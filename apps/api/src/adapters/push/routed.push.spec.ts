import { describe, expect, it } from "vitest";
import type { PushAdapter, PushMessage, PushResult } from "./push.interface";
import { PlatformRoutedPush } from "./routed.push";

/** A fake transport that records what it was asked to send and answers with a fixed result per token. */
function recorder(results: Record<string, PushResult>) {
  const sent: string[] = [];
  const adapter: PushAdapter = {
    send: async (m) => {
      sent.push(m.token);
      return results[m.token] ?? { ok: true, invalidToken: false };
    },
    sendEach: async (ms) => {
      sent.push(...ms.map((m) => m.token));
      return ms.map((m) => results[m.token] ?? { ok: true, invalidToken: false });
    },
  };
  return { adapter, sent };
}

const msg = (token: string, platform?: string | null): PushMessage => ({ token, platform, title: "t", body: "b" });

describe("PlatformRoutedPush", () => {
  it("sends iOS devices to APNs and everything else — including legacy rows with no platform — to FCM", async () => {
    const fcm = recorder({});
    const apns = recorder({});
    const push = new PlatformRoutedPush(fcm.adapter, apns.adapter);
    await push.send(msg("i1", "ios"));
    await push.send(msg("a1", "android"));
    await push.send(msg("l1", null));
    await push.send(msg("l2"));
    expect(apns.sent).toEqual(["i1"]);
    expect(fcm.sent).toEqual(["a1", "l1", "l2"]);
  });

  it("sendEach splits a mixed batch and returns results in input order", async () => {
    const fcm = recorder({ a2: { ok: false, invalidToken: true } });
    const apns = recorder({ i1: { ok: false, invalidToken: false } });
    const push = new PlatformRoutedPush(fcm.adapter, apns.adapter);
    const results = await push.sendEach([msg("a1", "android"), msg("i1", "ios"), msg("a2", "android"), msg("i2", "ios")]);
    expect(results).toEqual([
      { ok: true, invalidToken: false },
      { ok: false, invalidToken: false },
      { ok: false, invalidToken: true },
      { ok: true, invalidToken: false },
    ]);
    expect(fcm.sent).toEqual(["a1", "a2"]);
    expect(apns.sent).toEqual(["i1", "i2"]);
  });

  it("does not call a transport with an empty batch", async () => {
    const fcm = recorder({});
    const apns = recorder({});
    const push = new PlatformRoutedPush(fcm.adapter, apns.adapter);
    expect(await push.sendEach([msg("a1", "android")])).toEqual([{ ok: true, invalidToken: false }]);
    expect(apns.sent).toEqual([]);
    expect(await push.sendEach([])).toEqual([]);
  });
});
