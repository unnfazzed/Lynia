/**
 * AuthProvider's session writes — the two ways a signed-in user was being sent back to the OTP screen
 * from inside the app itself:
 *
 *  1. A STALE WRITE-BACK. Profile setup finished sign-up with `signIn({ ...session, needsProfile:false })`
 *     using the session its render captured. When the PATCH before it had to refresh an expired access
 *     token, that captured session held the rotated-away refresh token — and writing it back put the dead
 *     token in memory and the keychain. `updateSession` patches whatever the provider holds NOW.
 *  2. A FAILED KEYCHAIN WRITE. `saveSession` rejecting used to propagate: verify.tsx showed "Couldn't
 *     verify the code" to a user the server had just signed in, and a refresh failed its request with
 *     the rotated token never saved. Writes now never throw; a failed one is retried when the app leaves
 *     the foreground.
 */
import { act, create } from "react-test-renderer";
import type { Session } from "../session";

type Listener = (state: string) => void;
let mockAppStateListener: Listener | null = null;
jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, cb: Listener) => {
      mockAppStateListener = cb;
      return { remove: jest.fn() };
    },
  },
}));

interface ApiHooks {
  getSession: () => Session | null;
  onTokens: (s: Session) => Promise<void>;
  onSignOut: () => void;
}
let mockHooks: ApiHooks | null = null;
jest.mock("../../api/client", () => ({
  configureApi: (h: ApiHooks) => {
    mockHooks = h;
  },
  clearConditionalCache: jest.fn(),
}));
jest.mock("../../api/auth", () => ({ logout: jest.fn(async () => ({ revoked: true })) }));
jest.mock("../../query/client", () => ({ queryClient: { clear: jest.fn() } }));
jest.mock("../../query/persist", () => ({ clearPersistedQueries: jest.fn(async () => undefined) }));
jest.mock("../../telemetry/sentry", () => ({ captureException: jest.fn() }));

let mockStoredAtBoot: Session | null = null;
jest.mock("../../boot/prewarm", () => ({
  prewarmBootReads: () => ({ session: Promise.resolve(mockStoredAtBoot) }),
}));

const mockSaveSession = jest.fn<Promise<void>, [Session]>(async () => undefined);
const mockClearSession = jest.fn<Promise<void>, []>(async () => undefined);
jest.mock("../session", () => ({
  saveSession: (s: Session) => mockSaveSession(s),
  clearSession: () => mockClearSession(),
  clearDeviceState: jest.fn(async () => undefined),
}));

import { logout } from "../../api/auth";
import { setBoundPushToken } from "../../push/bound-token";
import { __resetAuthSession, AuthProvider, useAuth } from "../auth-context";

type Auth = ReturnType<typeof useAuth>;
let auth: Auth;
function Probe(): null {
  auth = useAuth();
  return null;
}

async function mount(storedAtBoot: Session | null): Promise<ReturnType<typeof create>> {
  mockStoredAtBoot = storedAtBoot;
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  return tree;
}

/** Let a fire-and-forget write (e.g. the one queued on backgrounding) run to completion. */
async function flushWrites(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const newAccount: Session = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresIn: 900,
  profileId: "p1",
  role: "customer",
  needsProfile: true,
};

beforeEach(() => {
  __resetAuthSession(); // each test is a fresh launch — the session is process state
  mockHooks = null;
  mockAppStateListener = null;
  mockSaveSession.mockReset().mockResolvedValue(undefined);
  mockClearSession.mockReset().mockResolvedValue(undefined);
});

describe("updateSession — patches the session held NOW, not one a render captured", () => {
  it("keeps tokens a refresh rotated inside the same handler (the sign-up → OTP bounce)", async () => {
    await mount(newAccount);
    const captured = auth.session; // what profile/setup.tsx's render closed over
    expect(captured?.refreshToken).toBe("refresh-1");

    // The PATCH inside the handler hit an expired access token → the client refreshed and rotated.
    await act(async () => {
      await mockHooks!.onTokens({ ...newAccount, accessToken: "access-2", refreshToken: "refresh-2" });
    });
    await act(async () => {
      await auth.updateSession({ needsProfile: false });
    });

    const written = mockSaveSession.mock.calls.at(-1)?.[0];
    expect(written).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2", needsProfile: false });
    expect(mockHooks!.getSession()).toMatchObject({ refreshToken: "refresh-2", needsProfile: false });
    expect(auth.session).toMatchObject({ refreshToken: "refresh-2", needsProfile: false });
  });

  it("is a no-op once signed out — it never resurrects a session", async () => {
    await mount(newAccount);
    await act(async () => {
      await auth.signOut();
    });
    mockSaveSession.mockClear();

    await act(async () => {
      await auth.updateSession({ needsProfile: false });
    });
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(auth.session).toBeNull();
  });
});

describe("a failed keychain write never strands the user", () => {
  it("signIn still resolves and the session is live in memory", async () => {
    await mount(null);
    mockSaveSession.mockRejectedValueOnce(new Error("KeyStore unavailable"));

    await act(async () => {
      await expect(auth.signIn(newAccount)).resolves.toBeUndefined();
    });
    expect(auth.session).toEqual(newAccount);
    expect(mockHooks!.getSession()).toEqual(newAccount);
  });

  it("the unsaved session is written again when the app leaves the foreground", async () => {
    await mount(null);
    mockSaveSession.mockRejectedValueOnce(new Error("KeyStore unavailable"));
    await act(async () => {
      await auth.signIn(newAccount);
    });
    expect(mockSaveSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockAppStateListener?.("background");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSaveSession).toHaveBeenCalledTimes(2);
    expect(mockSaveSession).toHaveBeenLastCalledWith(newAccount);

    // Once it's saved, backgrounding again writes nothing.
    await act(async () => {
      mockAppStateListener?.("background");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSaveSession).toHaveBeenCalledTimes(2);
  });

  it("a refresh's token hand-off resolves even when the write fails — the retried request still runs", async () => {
    await mount(newAccount);
    mockSaveSession.mockRejectedValueOnce(new Error("KeyStore unavailable"));
    const rotated = { ...newAccount, accessToken: "access-2", refreshToken: "refresh-2" };

    await act(async () => {
      await expect(mockHooks!.onTokens(rotated)).resolves.toBeUndefined();
    });
    expect(mockHooks!.getSession()).toEqual(rotated);
  });
});

describe("a failed write is not dropped", () => {
  it("the next write persists the latest state", async () => {
    await mount(newAccount);
    mockSaveSession.mockRejectedValueOnce(new Error("KeyStore unavailable"));
    const rotated = { ...newAccount, accessToken: "access-2", refreshToken: "refresh-2" };
    await act(async () => {
      await mockHooks!.onTokens(rotated); // this write fails
    });
    await act(async () => {
      await auth.updateSession({ needsProfile: false }); // …and the next one carries it
    });
    expect(mockSaveSession).toHaveBeenLastCalledWith({ ...rotated, needsProfile: false });
  });

  it("a sign-out whose delete failed is deleted again when the app leaves the foreground", async () => {
    await mount(newAccount);
    mockClearSession.mockRejectedValueOnce(new Error("KeyStore unavailable"));
    await act(async () => {
      await auth.signOut();
    });
    expect(mockClearSession).toHaveBeenCalledTimes(1);

    mockAppStateListener?.("background");
    await flushWrites();
    expect(mockClearSession).toHaveBeenCalledTimes(2);
    expect(mockSaveSession).not.toHaveBeenCalled(); // never resurrected
  });
});

/**
 * The root ErrorBoundary's "Reload" remounts the whole tree without restarting the process. The provider
 * used to re-apply the keychain read made at LAUNCH (prewarm memoizes it) — tokens that may since have
 * rotated twice, which the server rejects: a crash-recovery tap signed the user out.
 */
describe("a remount carries on with the session this process holds", () => {
  it("keeps the rotated tokens, not the launch read", async () => {
    const tree = await mount(newAccount);
    const rotated = { ...newAccount, accessToken: "access-3", refreshToken: "refresh-3" };
    await act(async () => {
      await mockHooks!.onTokens(rotated);
    });
    await act(async () => {
      tree.unmount();
    });

    await mount(newAccount); // prewarm would still hand back the launch-time session
    expect(auth.loading).toBe(false);
    expect(auth.session).toEqual(rotated);
    expect(mockHooks!.getSession()).toEqual(rotated);
  });

  it("stays signed out after a sign-out, even though the launch read had a session", async () => {
    const tree = await mount(newAccount);
    await act(async () => {
      await auth.signOut();
    });
    await act(async () => {
      tree.unmount();
    });

    await mount(newAccount);
    expect(auth.session).toBeNull();
  });
});

describe("sign-out unbinds this device's push token (E2E 2026-10-05 FS-8)", () => {
  afterEach(() => setBoundPushToken(null));

  it("names the bound push token in the logout request, while the session is still live", async () => {
    setBoundPushToken("fcm-token-1");
    await mount(newAccount);
    await act(async () => {
      await auth.signOut();
    });
    expect(logout).toHaveBeenLastCalledWith("refresh-1", "fcm-token-1");
  });

  it("sends no token when none is bound (push off / never registered)", async () => {
    await mount(newAccount);
    await act(async () => {
      await auth.signOut();
    });
    expect(logout).toHaveBeenLastCalledWith("refresh-1", null);
  });
});

describe("session writes are serialized", () => {
  it("a sign-out's delete lands AFTER a save still in flight — the signed-out session is never resurrected", async () => {
    await mount(newAccount);
    let finishSave!: () => void;
    mockSaveSession.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );

    let patching!: Promise<void>;
    let signingOut!: Promise<void>;
    await act(async () => {
      patching = auth.updateSession({ needsProfile: false }); // its keychain write is still running…
      signingOut = auth.signOut(); // …when the user signs out
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockClearSession).not.toHaveBeenCalled(); // queued behind the in-flight save, not racing it

    await act(async () => {
      finishSave();
      await patching;
      await signingOut;
    });
    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockSaveSession).toHaveBeenCalledTimes(1);
    expect(mockSaveSession.mock.invocationCallOrder[0]).toBeLessThan(mockClearSession.mock.invocationCallOrder[0]!);
  });
});
