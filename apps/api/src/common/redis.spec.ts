import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { createRedisClient, REDIS_FAIL_FAST } from "./redis";

/**
 * DS15-01 regression. An ioredis client is a plain Node EventEmitter: an `error` event emitted with NO
 * listener throws "Unhandled 'error' event" synchronously → uncaughtException → main.ts `process.exit(1)`,
 * turning a routine transient Redis blip into a fleet-wide crash-restart. `createRedisClient` attaches a
 * baseline `error` listener so EVERY caller — the OTP/rate-limit store (auth.module), the live-position
 * client (tracking.service), and the Socket.IO adapter pub/sub (tracking.gateway) — is covered by default.
 * These tests prove emitting `error` on such a client does NOT throw.
 */
describe("createRedisClient — DS15-01 baseline error listener", () => {
  it("registers an 'error' listener so an emitted error never throws (would crash the instance)", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined as unknown as Logger);
    const client = createRedisClient("redis://127.0.0.1:6379");
    // Stop the real connect/retry loop — we only exercise the listener wiring, not a live server.
    client.disconnect();

    // The factory must have registered at least one 'error' listener.
    expect(client.listenerCount("error")).toBeGreaterThan(0);

    // The crux: with the listener present, emitting 'error' must NOT throw. Without it, Node's
    // EventEmitter rethrows synchronously → uncaughtException → process exit.
    expect(() => client.emit("error", new Error("ECONNRESET"))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("redis client error: ECONNRESET"));

    warn.mockRestore();
  });

  it("supports a caller layering its own contextual 'error' listener on top (multiple listeners)", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined as unknown as Logger);
    const client = createRedisClient("redis://127.0.0.1:6379");
    client.disconnect();

    const contextual = vi.fn();
    client.on("error", contextual); // e.g. the otp-store / tracking contextual listener
    expect(client.listenerCount("error")).toBeGreaterThanOrEqual(2);

    expect(() => client.emit("error", new Error("timeout"))).not.toThrow();
    expect(contextual).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled(); // the baseline still fires too

    warn.mockRestore();
  });

  it("a duplicate() client (the Socket.IO adapter 'sub') does NOT inherit the listener — the gateway must add its own", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined as unknown as Logger);
    const pub = createRedisClient("redis://127.0.0.1:6379");
    const sub = pub.duplicate();
    pub.disconnect();
    sub.disconnect();

    // Documents the gateway gotcha: duplicate() is a FRESH client and copies NO listeners, so an
    // unguarded `sub` would crash on a blip — hence tracking.gateway attaches an 'error' listener to it.
    expect(sub.listenerCount("error")).toBe(0);

    // Mirror the gateway's fix, then prove the emit is safe on both.
    const log = vi.fn();
    pub.on("error", log);
    sub.on("error", log);
    expect(() => pub.emit("error", new Error("pub blip"))).not.toThrow();
    expect(() => sub.emit("error", new Error("sub blip"))).not.toThrow();
    expect(log).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });
});

/**
 * LC-C01 regression. Request-path clients must FAIL FAST on a Redis outage: with the factory's
 * `maxRetriesPerRequest: null` and the default offline queue, an awaited command issued while
 * Memorystore is unreachable is queued and never rejected, so the request hangs until reconnect
 * (pinning a Cloud Run slot up to the 3600s timeout → instance saturation on a single-node restart).
 * `REDIS_FAIL_FAST` sets `enableOfflineQueue: false` (reject while disconnected) + a `commandTimeout`
 * (catch the connected-but-hung case). The default profile is left byte-identical so the Socket.IO
 * pub/sub adapter's cross-instance offline-queuing is unchanged.
 */
describe("createRedisClient — LC-C01 request-path fail-fast", () => {
  it("REDIS_FAIL_FAST sets commandTimeout + disables the offline queue", () => {
    const client = createRedisClient("redis://127.0.0.1:6379", REDIS_FAIL_FAST);
    client.disconnect(); // stop the retry loop — we assert config, not a live server

    expect(client.options.commandTimeout).toBe(2_000);
    expect(client.options.enableOfflineQueue).toBe(false);
  });

  it("the DEFAULT profile keeps the offline queue and no command timeout (adapter path unchanged)", () => {
    const client = createRedisClient("redis://127.0.0.1:6379");
    client.disconnect();

    // ioredis default is enableOfflineQueue: true and no commandTimeout — the exact pre-fix behavior
    // the Socket.IO pub/sub adapter still relies on.
    expect(client.options.enableOfflineQueue).not.toBe(false);
    expect(client.options.commandTimeout).toBeUndefined();
  });

  it("a disconnected fail-fast client REJECTS a command instead of hanging (the outage-hang fix)", async () => {
    const client = createRedisClient("redis://127.0.0.1:6379", REDIS_FAIL_FAST);
    client.disconnect();

    // With the offline queue disabled a command on a non-connected client rejects promptly, so the
    // caller's try/catch fallback runs — rather than the promise pending until reconnect.
    await expect(client.get("lc-c01")).rejects.toThrow();
  });
});
