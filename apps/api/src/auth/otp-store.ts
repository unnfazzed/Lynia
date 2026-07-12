import IORedis from "ioredis";

export interface OtpRecord {
  hash: string;
  attempts: number;
}

/**
 * OTP + rate-limit storage. The attempt counter and the per-phone/per-IP/global rate limits
 * live here, not in the JWT (ET5). Redis-backed in prod; in-memory for dev/tests.
 */
export interface OtpStore {
  put(phone: string, hash: string, ttlSec: number): Promise<void>;
  get(phone: string): Promise<OtpRecord | null>;
  incrAttempts(phone: string): Promise<number>;
  del(phone: string): Promise<void>;
  /**
   * Post-verify retry grace (UX review 2026-07-11 §6). A successful verify consumes the OTP record
   * before the response reaches the client, so on a flaky link a client timeout + retry with the
   * SAME correct code used to hit "expired". graceSet stores ONLY the code's hash (never the raw
   * code, never session tokens) for a short TTL so that retry can be recognized and re-issued a
   * fresh session. Kept as a separate record (not a flag on the OTP record) so it carries no
   * attempt counter and can never be mistaken for a live code.
   */
  graceSet(phone: string, hash: string, ttlSec: number): Promise<void>;
  /** The grace hash for the phone, or null when none was written / the TTL elapsed. */
  graceGet(phone: string): Promise<string | null>;
  /** Increment a fixed-window counter; returns the new count. */
  hit(key: string, windowSec: number): Promise<number>;
}

export const OTP_STORE = Symbol("OTP_STORE");

export class InMemoryOtpStore implements OtpStore {
  private readonly otp = new Map<string, { hash: string; attempts: number; exp: number }>();
  private readonly grace = new Map<string, { hash: string; exp: number }>();
  private readonly rl = new Map<string, { count: number; exp: number }>();

  async put(phone: string, hash: string, ttlSec: number): Promise<void> {
    this.otp.set(phone, { hash, attempts: 0, exp: Date.now() + ttlSec * 1000 });
  }
  async get(phone: string): Promise<OtpRecord | null> {
    const r = this.otp.get(phone);
    if (!r) return null;
    if (Date.now() > r.exp) {
      this.otp.delete(phone);
      return null;
    }
    return { hash: r.hash, attempts: r.attempts };
  }
  async incrAttempts(phone: string): Promise<number> {
    const r = this.otp.get(phone);
    if (!r) return 0;
    r.attempts += 1;
    return r.attempts;
  }
  async del(phone: string): Promise<void> {
    this.otp.delete(phone);
  }
  async graceSet(phone: string, hash: string, ttlSec: number): Promise<void> {
    this.grace.set(phone, { hash, exp: Date.now() + ttlSec * 1000 });
  }
  async graceGet(phone: string): Promise<string | null> {
    const g = this.grace.get(phone);
    if (!g) return null;
    if (Date.now() > g.exp) {
      this.grace.delete(phone);
      return null;
    }
    return g.hash;
  }
  async hit(key: string, windowSec: number): Promise<number> {
    const now = Date.now();
    const e = this.rl.get(key);
    if (!e || now > e.exp) {
      this.rl.set(key, { count: 1, exp: now + windowSec * 1000 });
      return 1;
    }
    e.count += 1;
    return e.count;
  }
}

export class RedisOtpStore implements OtpStore {
  constructor(private readonly redis: IORedis) {}
  private key(phone: string): string {
    return `otp:${phone}`;
  }
  async put(phone: string, hash: string, ttlSec: number): Promise<void> {
    // hset + expire in one atomic Lua call so a crash/failure between them can never strand the OTP
    // record with no TTL (which would leave a stale hash + attempt counter alive indefinitely).
    await this.redis.eval(
      "redis.call('hset', KEYS[1], 'hash', ARGV[1], 'attempts', 0); redis.call('expire', KEYS[1], ARGV[2]); return 1",
      1,
      this.key(phone),
      hash,
      ttlSec,
    );
  }
  async get(phone: string): Promise<OtpRecord | null> {
    const h = await this.redis.hgetall(this.key(phone));
    if (!h || !h.hash) return null;
    return { hash: h.hash, attempts: Number(h.attempts ?? 0) };
  }
  async incrAttempts(phone: string): Promise<number> {
    return this.redis.hincrby(this.key(phone), "attempts", 1);
  }
  async del(phone: string): Promise<void> {
    await this.redis.del(this.key(phone));
  }
  private graceKey(phone: string): string {
    // Distinct prefix from the live OTP hash key — phones are E.164 ("+..."), so no phone value
    // can ever make `otp:<phone>` collide with `otp:grace:<phone>`.
    return `otp:grace:${phone}`;
  }
  async graceSet(phone: string, hash: string, ttlSec: number): Promise<void> {
    // Plain string value, so SET with EX writes value + TTL in one atomic command — the same
    // "never strand a record without a TTL" invariant the Lua scripts above enforce for the
    // multi-command hash writes, without needing a script here.
    await this.redis.set(this.graceKey(phone), hash, "EX", ttlSec);
  }
  async graceGet(phone: string): Promise<string | null> {
    return this.redis.get(this.graceKey(phone));
  }
  async hit(key: string, windowSec: number): Promise<number> {
    // incr + first-hit expire in one atomic Lua call. A crash/failure between the two would strand
    // the counter with no TTL — for the shared rl:global key that is a permanent OTP-send outage.
    const n = await this.redis.eval(
      "local n = redis.call('incr', KEYS[1]); if n == 1 then redis.call('expire', KEYS[1], ARGV[1]) end; return n",
      1,
      key,
      windowSec,
    );
    return Number(n);
  }
}
