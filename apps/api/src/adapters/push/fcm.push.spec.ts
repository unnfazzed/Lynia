import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushMessage } from "./push.interface";
import { FcmPush } from "./fcm.push";

// firebase-admin is loaded lazily via dynamic import() inside FcmPush.messaging(). Mock both modular
// sub-paths so init (and per-send transport) can be driven without ADC / network / a real project.
const mocks = vi.hoisted(() => ({
  getMessaging: vi.fn(),
  getApps: vi.fn<() => unknown[]>(() => []),
  getApp: vi.fn(),
  initializeApp: vi.fn(() => ({})),
  applicationDefault: vi.fn(() => ({})),
  cert: vi.fn(() => ({ kind: "cert" })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: mocks.getApps,
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
  applicationDefault: mocks.applicationDefault,
  cert: mocks.cert,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mocks.getMessaging,
}));

const msg = (token: string): PushMessage => ({ token, title: "t", body: "b" });

beforeEach(() => {
  vi.clearAllMocks();
  // No default app initialized ⇒ FcmPush builds one from ADC (initializeApp path).
  mocks.getApps.mockReturnValue([]);
  mocks.initializeApp.mockReturnValue({});
});

describe("FcmPush — lazy init is retryable after a rejected first attempt (DS15-04)", () => {
  it("retries init on the NEXT call instead of caching the dead rejected promise", async () => {
    const messagingStub = { send: vi.fn().mockResolvedValue("msg-id"), sendEach: vi.fn() };
    // First init throws (transient ADC/network hiccup), every later init succeeds.
    mocks.getMessaging
      .mockImplementationOnce(() => {
        throw new Error("ADC unavailable");
      })
      .mockImplementation(() => messagingStub);

    const push = new FcmPush("test-project");

    // Call 1: init fails → best-effort transient failure (never throws, never prunes).
    const first = await push.send(msg("tok"));
    expect(first).toEqual({ ok: false, invalidToken: false });

    // Call 2: the previous rejection must NOT be reused — init is attempted again and now succeeds.
    const second = await push.send(msg("tok"));
    expect(second).toEqual({ ok: true, invalidToken: false });

    // Two init attempts (proves the retry), and exactly one real send (on the successful init).
    expect(mocks.getMessaging).toHaveBeenCalledTimes(2);
    expect(messagingStub.send).toHaveBeenCalledTimes(1);
  });

  it("caches a SUCCESSFUL init — a second send reuses it without re-initializing", async () => {
    const messagingStub = { send: vi.fn().mockResolvedValue("msg-id"), sendEach: vi.fn() };
    mocks.getMessaging.mockReturnValue(messagingStub);

    const push = new FcmPush("test-project");
    await push.send(msg("a"));
    await push.send(msg("b"));

    expect(mocks.getMessaging).toHaveBeenCalledTimes(1);
    expect(messagingStub.send).toHaveBeenCalledTimes(2);
  });
});

describe("FcmPush.sendEach — a mid-loop chunk failure is isolated per chunk (DS15-10)", () => {
  it("preserves an earlier chunk's real results when a later chunk throws", async () => {
    // 501 messages ⇒ chunk 1 = 500 (succeeds), chunk 2 = 1 (throws transiently mid-loop).
    const messages = Array.from({ length: 501 }, (_, i) => msg(`tok-${i}`));
    const okResp = {
      responses: Array.from({ length: 500 }, () => ({ success: true })),
      successCount: 500,
      failureCount: 0,
    };
    const sendEach = vi
      .fn()
      .mockResolvedValueOnce(okResp) // chunk 1 succeeds
      .mockRejectedValueOnce(new Error("FCM 503 unavailable")); // chunk 2 throws
    mocks.getMessaging.mockReturnValue({ send: vi.fn(), sendEach });

    const push = new FcmPush("test-project");
    const results = await push.sendEach(messages);

    expect(results).toHaveLength(501);
    // Chunk 1's 500 results are the REAL successes — NOT discarded / rewritten to all-false.
    for (let i = 0; i < 500; i += 1) {
      expect(results[i]).toEqual({ ok: true, invalidToken: false });
    }
    // Chunk 2's single message is marked failed but transient (never pruned).
    expect(results[500]).toEqual({ ok: false, invalidToken: false });
    // Both chunks were attempted — the failure didn't abort the whole call.
    expect(sendEach).toHaveBeenCalledTimes(2);
  });

  it("still maps per-message dead-token results inside a succeeding chunk", async () => {
    const messages = [msg("live"), msg("dead")];
    const resp = {
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
      ],
      successCount: 1,
      failureCount: 1,
    };
    const sendEach = vi.fn().mockResolvedValue(resp);
    mocks.getMessaging.mockReturnValue({ send: vi.fn(), sendEach });

    const push = new FcmPush("test-project");
    const results = await push.sendEach(messages);

    expect(results).toEqual([
      { ok: true, invalidToken: false },
      { ok: false, invalidToken: true }, // permanently dead token ⇒ prunable
    ]);
  });

  it("prunes a token from another Firebase project (messaging/mismatched-credential) on first send", async () => {
    const resp = {
      responses: [{ success: false, error: { code: "messaging/mismatched-credential" } }],
      successCount: 0,
      failureCount: 1,
    };
    mocks.getMessaging.mockReturnValue({ send: vi.fn(), sendEach: vi.fn().mockResolvedValue(resp) });

    const results = await new FcmPush("test-project").sendEach([msg("old-project")]);

    expect(results).toEqual([{ ok: false, invalidToken: true }]);
  });

  it("single send also prunes on messaging/mismatched-credential, but not on a transient error", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("wrong project"), { code: "messaging/mismatched-credential" }))
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { code: "messaging/server-unavailable" }));
    mocks.getMessaging.mockReturnValue({ send, sendEach: vi.fn() });
    const push = new FcmPush("test-project");

    await expect(push.send(msg("old-project"))).resolves.toEqual({ ok: false, invalidToken: true });
    await expect(push.send(msg("live"))).resolves.toEqual({ ok: false, invalidToken: false });
  });

  it("resolves every message to a non-dead ok:false when init itself fails (never throws, never prunes)", async () => {
    mocks.getMessaging.mockImplementation(() => {
      throw new Error("ADC unavailable");
    });

    const push = new FcmPush("test-project");
    const results = await push.sendEach([msg("a"), msg("b")]);

    expect(results).toEqual([
      { ok: false, invalidToken: false },
      { ok: false, invalidToken: false },
    ]);
  });
});

describe("FcmPush — credential source", () => {
  const sa = {
    project_id: "lynia-fcm",
    client_email: "push@lynia-fcm.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
  };

  it("uses the inline service account (cert), not ADC, when FCM_SERVICE_ACCOUNT_JSON is given", async () => {
    mocks.getMessaging.mockReturnValue({ send: vi.fn().mockResolvedValue("id"), sendEach: vi.fn() });
    await expect(new FcmPush("lynia-fcm", JSON.stringify(sa)).send(msg("t"))).resolves.toEqual({ ok: true, invalidToken: false });
    expect(mocks.cert).toHaveBeenCalledWith({ projectId: "lynia-fcm", clientEmail: sa.client_email, privateKey: sa.private_key });
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
    expect(mocks.initializeApp).toHaveBeenCalledWith({ credential: { kind: "cert" }, projectId: "lynia-fcm" });
  });

  it("falls back to ADC when no inline service account is given", async () => {
    mocks.getMessaging.mockReturnValue({ send: vi.fn().mockResolvedValue("id"), sendEach: vi.fn() });
    await new FcmPush("lynia-fcm").send(msg("t"));
    expect(mocks.applicationDefault).toHaveBeenCalledTimes(1);
    expect(mocks.cert).not.toHaveBeenCalled();
  });
});
