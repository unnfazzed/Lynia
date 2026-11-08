import { describe, expect, it } from "vitest";
import { referralCodeFromInstallReferrer, referralInstallReferrer } from "./referral";
import {
  isCanonicalShopLink,
  normalizeShopCode,
  parseShopLink,
  shopCodeFromInstallReferrer,
  shopInstallReferrer,
  shopLink,
  shopLinkPath,
  shopSlug,
  SHOP_SLUG_MAX,
} from "./shop-link";

describe("shopSlug", () => {
  it.each([
    ["Chicken Inn Avondale", "chicken-inn-avondale"],
    ["Avondale Fresh", "avondale-fresh"],
    ["Belgravia Pharmacy", "belgravia-pharmacy"],
    ["Mbuya's Kitchen", "mbuyas-kitchen"],
    ["Mbuya’s Kitchen", "mbuyas-kitchen"], // typographic apostrophe
    ["Café Zuva", "cafe-zuva"],
    ["Fish & Chips", "fish-and-chips"],
    ["  Pizza   Inn!! (Borrowdale) ", "pizza-inn-borrowdale"],
    ["7 Arts Bakery", "7-arts-bakery"],
    ["SAM LEVY'S Boutique", "sam-levys-boutique"],
  ])("%s → %s", (name, slug) => {
    expect(shopSlug(name)).toBe(slug);
  });

  it("cuts a long name at a word boundary, never mid-word, within the limit", () => {
    const slug = shopSlug("Mbuya's Traditional Kitchen & Grill Borrowdale Village");
    expect(slug).toBe("mbuyas-traditional-kitchen-and-grill");
    expect(slug.length).toBeLessThanOrEqual(SHOP_SLUG_MAX);
  });

  it("cuts a single word longer than the limit instead of returning nothing", () => {
    expect(shopSlug("x".repeat(60))).toBe("x".repeat(SHOP_SLUG_MAX));
  });

  it("gives an empty slug when nothing usable is left", () => {
    expect(shopSlug("🍗🍔")).toBe("");
    expect(shopSlug("")).toBe("");
    expect(shopSlug(null)).toBe("");
  });
});

describe("shopLink / shopLinkPath", () => {
  it("puts the name in front of the code", () => {
    expect(shopLink("Chicken Inn Avondale", "7KQ2MX")).toBe("https://lyniago.com/s/chicken-inn-avondale-7KQ2MX");
    expect(shopLinkPath("Avondale Fresh", "3HT9PW")).toBe("/s/avondale-fresh-3HT9PW");
  });

  it("falls back to the bare code when the name gives no slug", () => {
    expect(shopLink("🍗", "7KQ2MX")).toBe("https://lyniago.com/s/7KQ2MX");
  });
});

describe("normalizeShopCode", () => {
  it("accepts any case and trims", () => {
    expect(normalizeShopCode(" 7kq2mx ")).toBe("7KQ2MX");
  });

  it("rejects ambiguous characters and wrong lengths", () => {
    expect(normalizeShopCode("7KQ2M0")).toBeNull(); // 0
    expect(normalizeShopCode("7KQ2MI")).toBeNull(); // I
    expect(normalizeShopCode("7KQ2M")).toBeNull();
    expect(normalizeShopCode("7KQ2MXX")).toBeNull();
    expect(normalizeShopCode(42)).toBeNull();
  });
});

describe("parseShopLink", () => {
  it("reads the canonical link", () => {
    expect(parseShopLink("/s/chicken-inn-avondale-7KQ2MX")).toEqual({ code: "7KQ2MX", slug: "chicken-inn-avondale" });
  });

  it("reads a bare code, any case, with or without the prefix or a trailing slash", () => {
    expect(parseShopLink("/s/7KQ2MX")).toEqual({ code: "7KQ2MX", slug: "" });
    expect(parseShopLink("7kq2mx")).toEqual({ code: "7KQ2MX", slug: "" });
    expect(parseShopLink("/s/chicken-inn-avondale-7KQ2MX/")).toEqual({ code: "7KQ2MX", slug: "chicken-inn-avondale" });
  });

  it("reads a URL-encoded segment", () => {
    expect(parseShopLink("/s/chicken%2Dinn-7KQ2MX")).toEqual({ code: "7KQ2MX", slug: "chicken-inn" });
  });

  it("only the code decides the shop: a made-up name still yields the same code", () => {
    expect(parseShopLink("/s/kfc-7KQ2MX")?.code).toBe("7KQ2MX");
  });

  it("returns null when there is no valid code", () => {
    expect(parseShopLink("/s/")).toBeNull();
    expect(parseShopLink("/s/chicken-inn-avondale")).toBeNull();
    expect(parseShopLink("/s/chicken")).toBeNull();
    expect(parseShopLink("/s/a/7KQ2MX")).toBeNull();
    expect(parseShopLink("/s/%E0%A4%A")).toBeNull(); // malformed encoding
    expect(parseShopLink(undefined)).toBeNull();
  });

  it("round-trips every link it builds", () => {
    for (const name of ["Chicken Inn Avondale", "Mbuya's Traditional Kitchen & Grill Borrowdale Village", "🍗"]) {
      const parsed = parseShopLink(shopLinkPath(name, "7KQ2MX"));
      expect(parsed?.code).toBe("7KQ2MX");
      expect(parsed && isCanonicalShopLink(parsed, name)).toBe(true);
    }
  });
});

describe("isCanonicalShopLink", () => {
  const current = "Chicken Inn Avondale";

  it("is canonical when the name part matches the shop's current name", () => {
    expect(isCanonicalShopLink({ code: "7KQ2MX", slug: "chicken-inn-avondale" }, current)).toBe(true);
  });

  it("needs a redirect for a bare code, an old name or a made-up name", () => {
    expect(isCanonicalShopLink({ code: "7KQ2MX", slug: "" }, current)).toBe(false);
    expect(isCanonicalShopLink({ code: "7KQ2MX", slug: "chicken-inn" }, current)).toBe(false);
    expect(isCanonicalShopLink({ code: "7KQ2MX", slug: "kfc" }, current)).toBe(false);
  });
});

describe("shop install referrer", () => {
  it("round-trips a code, encoded or not", () => {
    const referrer = shopInstallReferrer("7KQ2MX");
    expect(referrer).toBe("utm_source=lyniago.com&utm_medium=shop_share&utm_campaign=shop_share&utm_content=7KQ2MX");
    expect(shopCodeFromInstallReferrer(referrer)).toBe("7KQ2MX");
    expect(shopCodeFromInstallReferrer(encodeURIComponent(referrer))).toBe("7KQ2MX");
  });

  it("never reads a biker referral as a shop link, or a shop link as a referral", () => {
    expect(shopCodeFromInstallReferrer(referralInstallReferrer("K7P3QX"))).toBeNull();
    expect(referralCodeFromInstallReferrer(shopInstallReferrer("7KQ2MX"))).toBeNull();
  });

  it("ignores organic and malformed referrers", () => {
    expect(shopCodeFromInstallReferrer("utm_source=google-play&utm_medium=organic")).toBeNull();
    expect(shopCodeFromInstallReferrer("")).toBeNull();
    expect(shopCodeFromInstallReferrer("utm_medium=shop_share&utm_content=NOTACODE")).toBeNull();
  });
});
