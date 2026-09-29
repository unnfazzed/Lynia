import { afterEach, describe, expect, it, vi } from "vitest";
import { clearBusinessCache, loadBusiness, primeBusiness } from "./business";
import { getMerchantProfile } from "./menu-api";
import { merchantProfile } from "../testing/fixtures";

vi.mock("./menu-api", () => ({ getMerchantProfile: vi.fn() }));

afterEach(() => {
  clearBusinessCache();
  vi.clearAllMocks();
});

describe("the shell's shared read of the business (merchant web upgrade L2)", () => {
  it("reads /merchant/me once per page load, however many parts of the shell ask", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop" }));
    const [a, b] = await Promise.all([loadBusiness(), loadBusiness()]);
    expect(a?.businessType).toBe("shop");
    expect(b).toBe(a);
    expect(getMerchantProfile).toHaveBeenCalledTimes(1);
  });

  it("doesn't remember a failure, so the next ask tries again, and never rejects", async () => {
    vi.mocked(getMerchantProfile).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(merchantProfile());
    await expect(loadBusiness()).resolves.toBeNull();
    await expect(loadBusiness()).resolves.toMatchObject({ businessType: "restaurant" });
    expect(getMerchantProfile).toHaveBeenCalledTimes(2);
  });

  it("takes a profile a page already read, and forgets it on sign-out", async () => {
    primeBusiness(merchantProfile({ name: "Primed" }));
    await expect(loadBusiness()).resolves.toMatchObject({ name: "Primed" });
    expect(getMerchantProfile).not.toHaveBeenCalled();

    clearBusinessCache();
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ name: "Fresh" }));
    await expect(loadBusiness()).resolves.toMatchObject({ name: "Fresh" });
  });
});
