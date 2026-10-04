import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import { createServer, type Http2Server, type IncomingHttpHeaders, type ServerHttp2Session, type ServerHttp2Stream } from "node:http2";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApnsPush,
  apnsCollapseId,
  apnsProviderToken,
  buildApnsRequest,
  http2Transport,
  isDeadApnsToken,
  type ApnsRequest,
  type ApnsResponse,
} from "./apns.push";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config = { keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: pem, topic: "zw.co.lynia", sandbox: false };
const token = "a".repeat(64);

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString()) as Record<string, unknown>;
}

function verifies(jwt: string, key: KeyObject): boolean {
  const [header, claims, signature] = jwt.split(".");
  return verify("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature ?? "", "base64url"));
}

describe("buildApnsRequest — payload contract", () => {
  it("a silent push (D-77) is a low-priority background push with no alert or sound", () => {
    const req = buildApnsRequest({ token, title: "", body: "", silent: true, data: { readyAt: "07:34" } }, "zw.co.lynia", 1_000);
    expect(req.headers).toEqual({ "apns-topic": "zw.co.lynia", "apns-push-type": "background", "apns-priority": "5" });
    expect(JSON.parse(req.body)).toEqual({ aps: { "content-available": 1 }, body: { readyAt: "07:34" } });
  });

  it("posts an alert to the device path with the app's topic", () => {
    const req = buildApnsRequest({ token, title: "Rider arriving", body: "Tendai is 2 minutes away" }, "zw.co.lynia", 1_000);
    expect(req.path).toBe(`/3/device/${token}`);
    expect(req.headers).toEqual({ "apns-topic": "zw.co.lynia", "apns-push-type": "alert", "apns-priority": "10" });
    expect(JSON.parse(req.body)).toEqual({ aps: { alert: { title: "Rider arriving", body: "Tendai is 2 minutes away" }, sound: "default" } });
  });

  // expo-notifications (iOS) reads a remote notification's data from userInfo["body"]; anywhere else and
  // every tap's routing data (orderId, kind, …) arrives null in the app.
  it("carries the custom data under a top-level 'body' key, where expo-notifications reads it", () => {
    const req = buildApnsRequest({ token, title: "t", body: "b", data: { orderId: "o1", status: "delivered" } }, "zw.co.lynia", 1_000);
    const payload = JSON.parse(req.body) as Record<string, unknown>;
    expect(payload.body).toEqual({ orderId: "o1", status: "delivered" });
    expect(payload).not.toHaveProperty("orderId");
  });

  it("omits the body key when there is no data", () => {
    const req = buildApnsRequest({ token, title: "t", body: "b", data: {} }, "zw.co.lynia", 1_000);
    expect(JSON.parse(req.body)).not.toHaveProperty("body");
  });

  it("maps ttlSeconds to an ABSOLUTE apns-expiration and collapseKey to apns-collapse-id", () => {
    const req = buildApnsRequest({ token, title: "t", body: "b", ttlSeconds: 60, collapseKey: "order:o1:assigned" }, "zw.co.lynia", 1_000);
    expect(req.headers["apns-expiration"]).toBe("1060");
    expect(req.headers["apns-collapse-id"]).toBe("order:o1:assigned");
  });

  it("keeps a collapse id within Apple's 64-byte limit", () => {
    expect(apnsCollapseId("x".repeat(64))).toBe("x".repeat(64));
    const long = apnsCollapseId("y".repeat(65));
    expect(long).toMatch(/^[0-9a-f]{64}$/);
    expect(apnsCollapseId("y".repeat(65))).toBe(long);
  });
});

describe("apnsProviderToken — ES256 JWT", () => {
  it("names the key and team, and verifies against the key's public half", () => {
    const jwt = apnsProviderToken("ABC123DEFG", "TEAM123456", privateKey, 1_700_000_000);
    const [header, claims] = jwt.split(".");
    expect(decodeSegment(header ?? "")).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(decodeSegment(claims ?? "")).toEqual({ iss: "TEAM123456", iat: 1_700_000_000 });
    expect(verifies(jwt, publicKey)).toBe(true);
  });
});

describe("isDeadApnsToken — prune only on permanent failures", () => {
  it.each([
    [410, "Unregistered", true],
    [400, "BadDeviceToken", true],
    [400, "DeviceTokenNotForTopic", true],
    [400, "BadCollapseId", false],
    [403, "ExpiredProviderToken", false],
    [429, "TooManyRequests", false],
    [503, "ServiceUnavailable", false],
    [0, undefined, false],
  ])("status %s %s → dead: %s", (status, reason, dead) => {
    expect(isDeadApnsToken(status, reason)).toBe(dead);
  });
});

describe("ApnsPush", () => {
  function fakeTransport(responses: ApnsResponse[]) {
    const seen: Array<ApnsRequest & { authorization: string }> = [];
    const transport = async (req: ApnsRequest & { authorization: string }): Promise<ApnsResponse> => {
      seen.push(req);
      return responses.shift() ?? { status: 200 };
    };
    return { transport, seen };
  }

  it("reports a 200 as delivered and a 410 as a dead token", async () => {
    const { transport } = fakeTransport([{ status: 200 }, { status: 410, reason: "Unregistered" }]);
    const push = new ApnsPush(config, transport, () => 1_000);
    expect(await push.send({ token, title: "t", body: "b" })).toEqual({ ok: true, invalidToken: false });
    expect(await push.send({ token, title: "t", body: "b" })).toEqual({ ok: false, invalidToken: true });
  });

  it("never prunes on a transport failure", async () => {
    const push = new ApnsPush(config, async () => {
      throw new Error("socket hang up");
    });
    expect(await push.send({ token, title: "t", body: "b" })).toEqual({ ok: false, invalidToken: false });
  });

  it("reuses one provider token for 50 minutes, then mints a fresh one", async () => {
    const { transport, seen } = fakeTransport([]);
    let now = 1_000;
    const push = new ApnsPush(config, transport, () => now);
    await push.send({ token, title: "t", body: "b" });
    now += 49 * 60;
    await push.send({ token, title: "t", body: "b" });
    now += 2 * 60;
    await push.send({ token, title: "t", body: "b" });
    expect(seen[1]?.authorization).toBe(seen[0]?.authorization);
    expect(seen[2]?.authorization).not.toBe(seen[0]?.authorization);
    expect(verifies((seen[2]?.authorization ?? "").replace(/^bearer /, ""), publicKey)).toBe(true);
  });

  it("re-mints the provider token after APNs rejects it (403)", async () => {
    const { transport, seen } = fakeTransport([{ status: 403, reason: "ExpiredProviderToken" }]);
    let now = 1_000;
    const push = new ApnsPush(config, transport, () => now);
    expect(await push.send({ token, title: "t", body: "b" })).toEqual({ ok: false, invalidToken: false });
    now += 1;
    await push.send({ token, title: "t", body: "b" });
    expect(seen[1]?.authorization).not.toBe(seen[0]?.authorization);
  });

  it("sendEach keeps input order across mixed outcomes", async () => {
    const { transport } = fakeTransport([{ status: 200 }, { status: 400, reason: "BadDeviceToken" }, { status: 503 }]);
    const push = new ApnsPush(config, transport, () => 1_000);
    const results = await push.sendEach([
      { token: "1".repeat(64), title: "t", body: "b" },
      { token: "2".repeat(64), title: "t", body: "b" },
      { token: "3".repeat(64), title: "t", body: "b" },
    ]);
    expect(results).toEqual([
      { ok: true, invalidToken: false },
      { ok: false, invalidToken: true },
      { ok: false, invalidToken: false },
    ]);
  });

  it("fails construction on a key that isn't a PEM private key", () => {
    expect(() => new ApnsPush({ ...config, privateKey: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----" })).toThrow();
  });
});

// The real transport against a real (plaintext) HTTP/2 server — the same protocol APNs speaks, minus TLS.
describe("http2Transport", () => {
  let server: Http2Server;
  let origin = "";
  const sessions = new Set<ServerHttp2Session>();
  const received: Array<{ headers: IncomingHttpHeaders; body: string }> = [];

  beforeAll(async () => {
    server = createServer();
    server.on("session", (session) => {
      sessions.add(session);
      session.on("close", () => sessions.delete(session));
    });
    server.on("stream", (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
      let body = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => (body += chunk));
      stream.on("end", () => {
        received.push({ headers, body });
        if (String(headers[":path"]).endsWith("gone")) {
          stream.respond({ ":status": 410 });
          stream.end(JSON.stringify({ reason: "Unregistered" }));
        } else {
          stream.respond({ ":status": 200 });
          stream.end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const session of sessions) session.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("POSTs the request with its auth and APNs headers, and reads status and reason back", async () => {
    const send = http2Transport(origin);
    const ok = await send({ path: "/3/device/abc", headers: { "apns-topic": "zw.co.lynia" }, body: '{"aps":{}}', authorization: "bearer t0k" });
    const gone = await send({ path: "/3/device/gone", headers: { "apns-topic": "zw.co.lynia" }, body: "{}", authorization: "bearer t0k" });
    expect(ok).toEqual({ status: 200, reason: undefined });
    expect(gone).toEqual({ status: 410, reason: "Unregistered" });
    expect(received[0]?.headers[":method"]).toBe("POST");
    expect(received[0]?.headers.authorization).toBe("bearer t0k");
    expect(received[0]?.headers["apns-topic"]).toBe("zw.co.lynia");
    expect(received[0]?.body).toBe('{"aps":{}}');
    // Both requests rode one connection.
    expect(sessions.size).toBe(1);
  });

  it("resolves an unreachable origin to status 0 instead of throwing", async () => {
    const send = http2Transport("http://127.0.0.1:1");
    expect(await send({ path: "/3/device/abc", headers: {}, body: "{}", authorization: "bearer t" })).toEqual({ status: 0 });
  });
});
