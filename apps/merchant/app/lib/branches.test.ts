import { describe, expect, it } from "vitest";
import { BRANCH_ERRORS, branchErrorFor, catalogueCount, isLive, showBranchChevron, showNotLiveHome } from "./branches";
import { toBranchRequest } from "./branch-form";

describe("branches rules (ledger D-51)", () => {
  it("a restaurant or a shop is live once ops switched it on (shops since D-58)", () => {
    expect(isLive({ businessType: "shop", pilotEnabled: false })).toBe(false);
    expect(isLive({ businessType: "shop", pilotEnabled: true })).toBe(true);
    expect(isLive({ businessType: "restaurant", pilotEnabled: false })).toBe(false);
    expect(isLive({ businessType: "restaurant", pilotEnabled: true })).toBe(true);
  });

  it("the header chevron is for an owner with 2+ branches, never staff", () => {
    expect(showBranchChevron({ myRole: "owner" }, 1)).toBe(false);
    expect(showBranchChevron({ myRole: "owner" }, 2)).toBe(true);
    expect(showBranchChevron({ myRole: "staff" }, 2)).toBe(false);
    expect(showBranchChevron(null, 3)).toBe(false);
  });

  it("the not-live home needs 2+ branches, so a single new restaurant keeps today's Orders home", () => {
    const dormant = { myRole: "owner" as const, pilotEnabled: false, businessType: "restaurant" as const };
    expect(showNotLiveHome(dormant, 1)).toBe(false);
    expect(showNotLiveHome(dormant, 2)).toBe(true);
    expect(showNotLiveHome({ ...dormant, pilotEnabled: true }, 2)).toBe(false);
    expect(showNotLiveHome({ ...dormant, businessType: "shop" }, 2)).toBe(true);
  });

  it("maps the four API refusals to where C7 shows them, with the drawn copy", () => {
    expect(branchErrorFor("branch_name_taken", "x")).toEqual(BRANCH_ERRORS.branch_name_taken);
    expect(branchErrorFor("branch_name_taken", "x").where).toBe("name");
    expect(branchErrorFor("outside_service_area", "x")).toEqual({
      where: "location",
      message: "That address is outside the area LyniaGo covers for now.",
    });
    expect(branchErrorFor("branch_limit", "x").where).toBe("banner");
    expect(branchErrorFor("on_hold", "x").message).toBe("This account is on hold. Message LyniaGo on WhatsApp to sort it out.");
    // Anything else is a banner with the server's own words; a prototype key is never mistaken for one.
    expect(branchErrorFor("teapot", "Couldn't do that")).toEqual({ where: "banner", message: "Couldn't do that" });
    expect(branchErrorFor("toString", "Nope")).toEqual({ where: "banner", message: "Nope" });
    expect(branchErrorFor(undefined, "Offline")).toEqual({ where: "banner", message: "Offline" });
  });

  it("counts the catalogue in the drawn words", () => {
    expect(catalogueCount("restaurant", 12, 3)).toBe("12 dishes in 3 categories");
    expect(catalogueCount("shop", 40, 5)).toBe("40 items in 5 categories");
    expect(catalogueCount("restaurant", 1, 1)).toBe("1 dish in 1 category");
  });

  it("sends the trimmed name, the address line and the owner's number as the contact", () => {
    expect(
      toBranchRequest({
        name: "  Sadza Republic · Avondale ",
        location: { point: { lat: -17.8, lng: 31.04 }, address: " Fife Ave, Avondale ", source: "gps" },
        copyMenu: false,
        contactPhone: "0771234567",
      }),
    ).toEqual({
      name: "Sadza Republic · Avondale",
      location: { point: { lat: -17.8, lng: 31.04 }, address: "Fife Ave, Avondale", contactPhone: "+263771234567" },
      copyMenu: false,
    });
    const noAddress = toBranchRequest({ name: "B", location: { point: { lat: 0, lng: 0 }, address: "", source: "gps" }, copyMenu: true, contactPhone: "+263771234567" });
    expect(noAddress.location).not.toHaveProperty("address");
  });
});
