import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { createRedisClient } from "./redis";

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
