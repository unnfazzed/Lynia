import { describe, expect, it } from "vitest";
import { InMemoryOtpStore } from "./otp-store";

describe("InMemoryOtpStore", () => {
  it("stores, reads, increments attempts, and deletes", async () => {
    const store = new InMemoryOtpStore();
    await store.put("+263771", "hashvalue", 300);

    expect(await store.get("+263771")).toEqual({ hash: "hashvalue", attempts: 0 });
    expect(await store.incrAttempts("+263771")).toBe(1);
    expect(await store.incrAttempts("+263771")).toBe(2);
    expect((await store.get("+263771"))?.attempts).toBe(2);

    await store.del("+263771");
    expect(await store.get("+263771")).toBeNull();
  });

  it("expires records past their TTL", async () => {
    const store = new InMemoryOtpStore();
    await store.put("+263772", "h", 0);
    // ttl 0 → already expired on the next read
    await new Promise((r) => setTimeout(r, 2));
    expect(await store.get("+263772")).toBeNull();
  });

  it("counts hits within a fixed window for rate limiting", async () => {
    const store = new InMemoryOtpStore();
    expect(await store.hit("rl:phone:x", 3600)).toBe(1);
    expect(await store.hit("rl:phone:x", 3600)).toBe(2);
    expect(await store.hit("rl:phone:y", 3600)).toBe(1);
  });
});
