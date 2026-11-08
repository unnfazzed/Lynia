const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete mockStore[k];
  },
}));
let mockReferrerCode: string | undefined;
const mockInstallShopCode = jest.fn(async () => mockReferrerCode);
jest.mock("../../auth/install-referral", () => ({ installShopCode: () => mockInstallShopCode() }));

import {
  clearPendingShop,
  loadPendingShop,
  PENDING_SHOP_KEY,
  PENDING_SHOP_TTL_MS,
  pendingShopAtBoot,
  REFERRER_SHOP_USED_KEY,
  savePendingShop,
} from "../pending-shop";

const NOW = 1_800_000_000_000;

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockReferrerCode = undefined;
  mockInstallShopCode.mockClear();
});

describe("pending shop (D-129, plan E3)", () => {
  it("keeps a code in its canonical form and reads it back", async () => {
    expect(await savePendingShop(" 7kq2mx ", NOW)).toBe("7KQ2MX");
    expect(await loadPendingShop(NOW + 1000)).toEqual({ code: "7KQ2MX", savedAt: NOW });
  });

  it("ignores anything that isn't a code", async () => {
    expect(await savePendingShop("not a code", NOW)).toBeNull();
    expect(await savePendingShop(undefined, NOW)).toBeNull();
    expect(mockStore[PENDING_SHOP_KEY]).toBeUndefined();
  });

  it("lives 7 days, then is dropped", async () => {
    await savePendingShop("7KQ2MX", NOW);
    expect(await loadPendingShop(NOW + PENDING_SHOP_TTL_MS)).not.toBeNull();
    expect(await loadPendingShop(NOW + PENDING_SHOP_TTL_MS + 1)).toBeNull();
    expect(mockStore[PENDING_SHOP_KEY]).toBeUndefined();
  });

  it("drops an unreadable or tampered record", async () => {
    mockStore[PENDING_SHOP_KEY] = "{oops";
    expect(await loadPendingShop(NOW)).toBeNull();
    mockStore[PENDING_SHOP_KEY] = JSON.stringify({ code: "7KQ2M0", savedAt: NOW });
    expect(await loadPendingShop(NOW)).toBeNull();
  });

  it("clears", async () => {
    await savePendingShop("7KQ2MX", NOW);
    await clearPendingShop();
    expect(await loadPendingShop(NOW)).toBeNull();
  });
});

describe("pendingShopAtBoot (Play's install referrer, once per install)", () => {
  it("takes the referrer's shop code the first time only", async () => {
    mockReferrerCode = "3HT9PW";
    expect(await pendingShopAtBoot(NOW)).toBe("3HT9PW");
    expect(mockStore[REFERRER_SHOP_USED_KEY]).toBe("1");
    // The link opened (or the person signed out): the referrer is never taken again on this install.
    await clearPendingShop();
    expect(await pendingShopAtBoot(NOW)).toBeNull();
    expect(mockInstallShopCode).toHaveBeenCalledTimes(1);
  });

  it("a saved link wins without asking Play", async () => {
    await savePendingShop("7KQ2MX", NOW);
    expect(await pendingShopAtBoot(NOW)).toBe("7KQ2MX");
    expect(mockInstallShopCode).not.toHaveBeenCalled();
  });

  it("an organic install marks the referrer used and has no shop", async () => {
    expect(await pendingShopAtBoot(NOW)).toBeNull();
    expect(mockStore[REFERRER_SHOP_USED_KEY]).toBe("1");
  });
});

import { clearShopArrival, saveShopArrival, SHOP_ARRIVAL_TTL_MS, shareCodeForOrder } from "../pending-shop";

describe("shop arrival → Order.shareCode", () => {
  const M = "11111111-1111-4111-8111-111111111111";
  it("sends the code only with an order at the shop the link opened, within a day", async () => {
    await saveShopArrival(M, "7KQ2MX", NOW);
    expect(await shareCodeForOrder(M, NOW + 1000)).toBe("7KQ2MX");
    expect(await shareCodeForOrder("other", NOW)).toBeUndefined();
    expect(await shareCodeForOrder(M, NOW + SHOP_ARRIVAL_TTL_MS + 1)).toBeUndefined();
  });

  it("is gone once cleared (after the order goes through)", async () => {
    await saveShopArrival(M, "7KQ2MX", NOW);
    await clearShopArrival();
    expect(await shareCodeForOrder(M, NOW)).toBeUndefined();
  });
});
