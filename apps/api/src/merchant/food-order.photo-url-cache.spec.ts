import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { FoodDebtService } from "./food-debt.service";
import { FoodOrderService } from "./food-order.service";
import { PROOF_PHOTO_URL_CACHE_TTL_MS, PROOF_READ_URL_TTL_SECONDS } from "./merchant-order-proof.service";
import { MERCHANT_PHOTO_URL_CACHE_TTL_MS, PHOTO_READ_URL_TTL_SECONDS } from "./merchant.service";

// C4 (MJ-P3 + P03): the single-order reads (customer, merchant and rider screens poll every 4–15 s)
// minted a fresh signed URL for the pickup / door proof and swap photos on EVERY read, so the device
// image cache missed and the photo downloaded again each poll. They now reuse one URL per object key
// until it nears expiry.

/** A storage stub whose every mint returns a distinct URL (like a real V4 signature carrying X-Goog-Date). */
function fakeStorage() {
  let n = 0;
  const createReadUrl = vi.fn(async (key: string, ttl?: number) => `https://storage.example/${key}?sig=${++n}&ttl=${ttl}`);
  return { storage: { createReadUrl } as unknown as StorageAdapter, createReadUrl };
}

function build(storage: StorageAdapter, env: Partial<Env> = {}) {
  return new FoodOrderService(
    {} as PrismaService,
    {} as TokenService,
    {} as NotificationsService,
    {} as FoodDebtService,
    {} as TrackingGateway,
    {} as PaymentRail,
    undefined,
    storage,
    env as Env,
  );
}

type Detail = { pickupProof?: { photoUrl: string | null }; doorProof?: { photoUrl: string | null } };
const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  pickupPhotoKey: "pickup/rider-1/aaaa.jpg",
  pickupPhotoAt: new Date("2026-10-07T10:00:00Z"),
  pickupBagSealed: true,
  deliveryProofKey: "delivery-proof/rider-1/bbbb.jpg",
  deliveryProofAt: new Date("2026-10-07T10:30:00Z"),
  deliveryProofReason: "left_at_gate",
  deliveryProofHandedTo: null,
  substitutionRounds: [],
  ...over,
});
const read = (svc: FoodOrderService, o: Record<string, unknown>): Promise<Detail> =>
  (svc as unknown as { withDetail(o: unknown, r: unknown): Promise<Detail> }).withDetail(o, {});
const signSwap = (svc: FoodOrderService, key: string): Promise<string | null> =>
  (svc as unknown as { signSwapPhoto(k: string): Promise<string | null> }).signSwapPhoto(key);

describe("C4: proof and swap photo URLs are reused per object key until near expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("two reads within the TTL return the SAME proof URLs and sign once per key", async () => {
    const { storage, createReadUrl } = fakeStorage();
    const svc = build(storage);
    const first = await read(svc, order());
    vi.advanceTimersByTime(15_000); // the next poll
    const second = await read(svc, order());
    expect(first.pickupProof?.photoUrl).toBeTruthy();
    expect(first.doorProof?.photoUrl).toBeTruthy();
    expect(second.pickupProof?.photoUrl).toBe(first.pickupProof?.photoUrl);
    expect(second.doorProof?.photoUrl).toBe(first.doorProof?.photoUrl);
    expect(createReadUrl).toHaveBeenCalledTimes(2); // one per key, not per read
    expect(createReadUrl).toHaveBeenCalledWith("pickup/rider-1/aaaa.jpg", PROOF_READ_URL_TTL_SECONDS);
  });

  it("a retaken photo (new object key) gets a fresh URL at once", async () => {
    const { storage } = fakeStorage();
    const svc = build(storage);
    const before = await read(svc, order());
    const after = await read(svc, order({ pickupPhotoKey: "pickup/rider-1/cccc.jpg" }));
    expect(after.pickupProof?.photoUrl).not.toBe(before.pickupProof?.photoUrl);
    expect(after.pickupProof?.photoUrl).toContain("pickup/rider-1/cccc.jpg");
    expect(after.doorProof?.photoUrl).toBe(before.doorProof?.photoUrl);
  });

  it("re-signs once the entry nears expiry, so a served URL always keeps signed life", async () => {
    const { storage, createReadUrl } = fakeStorage();
    const svc = build(storage);
    const first = await read(svc, order());
    // Past the cache TTL even at its +10% jitter — still inside the 15-min signed validity, so the
    // old URL is "about to expire" and must not be served again.
    vi.advanceTimersByTime(PROOF_PHOTO_URL_CACHE_TTL_MS * 1.1 + 1);
    expect(PROOF_PHOTO_URL_CACHE_TTL_MS * 1.1).toBeLessThanOrEqual(PROOF_READ_URL_TTL_SECONDS * 1000 - 4 * 60_000);
    const later = await read(svc, order());
    expect(later.pickupProof?.photoUrl).not.toBe(first.pickupProof?.photoUrl);
    expect(createReadUrl).toHaveBeenCalledTimes(4);
  });

  it("a failed mint is not cached: it serves null, and the next read retries", async () => {
    const { storage, createReadUrl } = fakeStorage();
    createReadUrl.mockRejectedValueOnce(new Error("signBlob 503"));
    const svc = build(storage);
    const first = await read(svc, order({ deliveryProofKey: null }));
    expect(first.pickupProof?.photoUrl).toBeNull();
    const second = await read(svc, order({ deliveryProofKey: null }));
    expect(second.pickupProof?.photoUrl).toMatch(/^https:/);
  });

  it("MICRO_CACHE_DISABLED mints per read (the kill-switch)", async () => {
    const { storage } = fakeStorage();
    const svc = build(storage, { MICRO_CACHE_DISABLED: "true" });
    const a = await read(svc, order());
    const b = await read(svc, order());
    expect(b.pickupProof?.photoUrl).not.toBe(a.pickupProof?.photoUrl);
  });

  it("swap-dish photos: same key ⇒ same URL within the TTL, different key ⇒ different URL, re-signed near expiry", async () => {
    const { storage, createReadUrl } = fakeStorage();
    const svc = build(storage);
    const a1 = await signSwap(svc, "dish/m-1/one.jpg");
    vi.advanceTimersByTime(60 * 60_000);
    const a2 = await signSwap(svc, "dish/m-1/one.jpg");
    const b = await signSwap(svc, "dish/m-1/two.jpg");
    expect(a2).toBe(a1);
    expect(b).not.toBe(a1);
    expect(createReadUrl).toHaveBeenCalledWith("dish/m-1/one.jpg", PHOTO_READ_URL_TTL_SECONDS);
    vi.advanceTimersByTime(MERCHANT_PHOTO_URL_CACHE_TTL_MS * 1.1 + 1);
    const a3 = await signSwap(svc, "dish/m-1/one.jpg");
    expect(a3).not.toBe(a1);
  });
});
