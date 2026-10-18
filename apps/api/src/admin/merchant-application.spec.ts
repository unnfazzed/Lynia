import { describe, expect, it } from "vitest";
import { MERCHANT_APPLICATION_STATUSES } from "@lynia/shared";
import { MerchantApplicationStatus } from "@prisma/client";
import {
  ACTION_FROM,
  allowedActions,
  applicationStatusWhere,
  buildChecklist,
  checklistPasses,
  checklistScore,
  effectiveApplicationStatus,
  median,
  type ChecklistInput,
} from "./merchant-application";

const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Next to the rank", contactPhone: "+263771234567" };

function readyInput(over: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    businessType: "restaurant",
    shopKind: null,
    status: "reviewing",
    location: PIN,
    hours: { mon: { open: "08:00", close: "20:00" }, tue: { open: "08:00", close: "20:00" } },
    owner: { name: "Tendai Moyo", phoneVerified: true, termsAccepted: true },
    menu: { categories: 2, dishes: 10, liveDishes: 8, withPhoto: 8, drafts: 2, minPrice: 1.5, maxPrice: 12 },
    shopFront: { logo: true, cover: true, about: true },
    team: { members: 2, staff: 1, openInvites: 1, pharmacists: 0 },
    licence: null,
    lastCallAt: new Date("2026-10-13T08:00:00Z"),
    ...over,
  };
}

describe("merchant application — state (admin console v2 §5)", () => {
  it("the Prisma enum and @lynia/shared list the same states, in order", () => {
    expect(Object.values(MerchantApplicationStatus)).toEqual([...MERCHANT_APPLICATION_STATUSES]);
  });

  it.each([
    // [stored, pilotEnabled, effective]
    ["applied", false, "applied"],
    ["reviewing", false, "reviewing"],
    ["approved", false, "approved"],
    ["rejected", false, "rejected"],
    ["live", true, "live"],
    ["suspended", false, "suspended"],
    // An older revision's go-live switch turned it on without moving the state: the switch wins.
    ["applied", true, "live"],
    // An older revision's switch-off of a live business: suspended (Resume brings it back).
    ["live", false, "suspended"],
    // A suspension always wins.
    ["suspended", true, "suspended"],
  ] as const)("stored %s with pilotEnabled=%s reads as %s", (stored, pilot, effective) => {
    expect(effectiveApplicationStatus({ applicationStatus: stored, pilotEnabled: pilot })).toBe(effective);
  });

  it("the queue filters agree with the effective status", () => {
    expect(applicationStatusWhere("live")).toEqual({ pilotEnabled: true, applicationStatus: { not: "suspended" } });
    expect(applicationStatusWhere("suspended")).toEqual({ OR: [{ applicationStatus: "suspended" }, { applicationStatus: "live", pilotEnabled: false }] });
    expect(applicationStatusWhere("applied")).toEqual({ applicationStatus: "applied", pilotEnabled: false });
  });

  it("each state opens only its next steps", () => {
    expect(allowedActions("applied")).toEqual(["review", "reject"]);
    expect(allowedActions("reviewing")).toEqual(["approve", "reject"]);
    expect(allowedActions("approved")).toEqual(["reject", "go_live"]);
    expect(allowedActions("live")).toEqual(["suspend"]);
    expect(allowedActions("suspended")).toEqual(["resume"]);
    expect(allowedActions("rejected")).toEqual(["review"]);
    // Go live only ever starts from approved.
    expect(ACTION_FROM.go_live).toEqual(["approved"]);
  });
});

describe("merchant application — checklist, computed from data", () => {
  it("a ready restaurant passes every required row; team is shown but never required", () => {
    const rows = buildChecklist(readyInput());
    expect(rows.map((r) => r.key)).toEqual(["location", "hours", "owner", "menu", "shopfront", "team", "call"]);
    expect(rows.every((r) => r.ok)).toBe(true);
    expect(rows.find((r) => r.key === "team")?.required).toBe(false);
    expect(checklistPasses(rows)).toBe(true);
    expect(checklistScore(rows)).toEqual({ passed: 5, total: 5 });
    expect(rows.find((r) => r.key === "menu")?.detail).toBe("2 categories · 10 dishes · 80% with photos · 2 drafts · $1.50–$12.00");
    expect(rows.find((r) => r.key === "owner")?.detail).toBe("Tendai Moyo · phone verified · terms accepted");
    expect(rows.find((r) => r.key === "team")?.detail).toBe("1 staff · 1 open invite");
  });

  it("the shop front shows the logo, cover and about to the reviewer, and never blocks Approve", () => {
    const ready = buildChecklist(readyInput()).find((r) => r.key === "shopfront")!;
    expect(ready).toMatchObject({ label: "Shop front", ok: true, required: false, detail: "logo · cover · about" });

    const bare = buildChecklist(readyInput({ shopFront: { logo: false, cover: false, about: false } }));
    expect(bare.find((r) => r.key === "shopfront")).toMatchObject({ ok: false, detail: "no logo · no cover · no about" });
    expect(checklistPasses(bare)).toBe(true);
    expect(checklistScore(bare)).toEqual({ passed: 5, total: 5 });

    // A cover is nice to have; a logo and an about make the row pass.
    const noCover = buildChecklist(readyInput({ shopFront: { logo: true, cover: false, about: true } }));
    expect(noCover.find((r) => r.key === "shopfront")).toMatchObject({ ok: true, detail: "logo · no cover · about" });
  });

  it("each missing piece fails its own row", () => {
    const rows = buildChecklist(
      readyInput({
        location: { point: PIN.point, landmark: "" },
        hours: null,
        owner: { name: "Tendai", phoneVerified: true, termsAccepted: false },
        menu: { categories: 1, dishes: 3, liveDishes: 0, withPhoto: 0, drafts: 3, minPrice: 2, maxPrice: 2 },
        lastCallAt: null,
      }),
    );
    const failing = rows.filter((r) => !r.ok).map((r) => r.key);
    expect(failing).toEqual(["location", "hours", "owner", "menu", "call"]);
    expect(checklistPasses(rows)).toBe(false);
    expect(checklistScore(rows)).toEqual({ passed: 0, total: 5 });
    expect(rows.find((r) => r.key === "location")?.detail).toBe("Pin set, no landmark");
    expect(rows.find((r) => r.key === "owner")?.detail).toContain("terms not accepted");
  });

  it("a pharmacy needs a recorded, verified licence with a named pharmacist (owner decision 5)", () => {
    const pharmacy = { businessType: "shop", shopKind: "pharmacy" } as const;
    const none = buildChecklist(readyInput({ ...pharmacy, team: { members: 2, staff: 1, openInvites: 0, pharmacists: 1 } }));
    const licence = none.find((r) => r.key === "licence")!;
    expect(licence).toMatchObject({ ok: false, required: true, detail: "Not recorded · 1 pharmacist on the team" });
    expect(licence.warning).toBeUndefined();
    expect(checklistScore(none)).toEqual({ passed: 5, total: 6 });

    const unverified = buildChecklist(readyInput({ ...pharmacy, licence: { licenceNumber: "PCZ-123", pharmacistName: "R. Dube", verifiedAt: null } }));
    expect(unverified.find((r) => r.key === "licence")).toMatchObject({ ok: false, detail: "No. PCZ-123 · R. Dube · not verified" });

    const verified = buildChecklist(readyInput({ ...pharmacy, licence: { licenceNumber: "PCZ-123", pharmacistName: "R. Dube", verifiedAt: new Date() } }));
    expect(checklistPasses(verified)).toBe(true);
    // A shop that isn't a pharmacy has no licence row, and says "items".
    const grocery = buildChecklist(readyInput({ businessType: "shop", shopKind: "grocery" }));
    expect(grocery.find((r) => r.key === "licence")).toBeUndefined();
    expect(grocery.find((r) => r.key === "menu")?.label).toBe("Items");
  });

  it("a pharmacy already live without a licence is grandfathered: a warning row, not a block", () => {
    const rows = buildChecklist(readyInput({ businessType: "shop", shopKind: "pharmacy", status: "live" }));
    expect(rows.find((r) => r.key === "licence")?.warning).toMatch(/Live before licences were checked/);
  });

  it("median handles odd, even and empty samples", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
