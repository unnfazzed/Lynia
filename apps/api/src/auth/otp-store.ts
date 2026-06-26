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
  /** Increment a fixed-window counter; returns the new count. */
  hit(key: string, windowSec: number): Promise<number>;
}

export const OTP_STORE = Symbol("OTP_STORE");

export class InMemoryOtpStore implements OtpStore {
  private readonly otp = new Map<string, { hash: string; attempts: number; exp: number }>();
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
    await this.redis.hset(this.key(phone), { hash, attempts: 0 });
    await this.redis.expire(this.key(phone), ttlSec);
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
  async hit(key: string, windowSec: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, windowSec);
    return n;
  }
}
