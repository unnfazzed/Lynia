// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MerchantProfilePage from "./page";
import { adminFetchResult } from "../../lib/api";
import type { MerchantApplication, MerchantDetail, MerchantMetrics } from "../../lib/adminTypes";

vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn(), adminFetch: vi.fn(async () => null) }));
vi.mock("../actions", () => ({
  setMerchantOrderSettings: vi.fn(),
  moveMerchantApplication: vi.fn(),
  logMerchantCall: vi.fn(),
  recordMerchantLicence: vi.fn(),
  verifyMerchantLicence: vi.fn(),
}));
vi.mock("../../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function detail(over: Partial<MerchantDetail> = {}): MerchantDetail {
  return {
    id: "m-1",
    name: "Mbare Auto Spares",
    cashRule: "collect_and_return",
    pilotEnabled: false,
    busyMode: false,
    cuisineTags: [],
    businessType: "shop",
    shopKind: "auto_parts",
    landmark: "Opposite Mbare market",
    contactPhoneMasked: "+263•••••4567",
    orders: 0,
    openDebtAmount: "0.00",
    openDebtCount: 0,
    joined: "29 Sep 2026",
    description: null,
    priceLevel: null,
    contactPhone: "+263771234567",
    pin: { lat: -17.83, lng: 31.05 },
    trail: [],
    debtLedger: [],
    debtLedgerNextCursor: null,
    ...over,
  };
}

function application(over: Partial<MerchantApplication> = {}): MerchantApplication {
  return {
    merchantId: "m-1",
    status: "reviewing",
    statusAt: null,
    rejectReason: null,
    appliedAt: "2026-10-10T08:00:00.000Z",
    approvedAt: null,
    sla: "red",
    ageMs: 3 * 24 * 3600 * 1000,
    isPharmacy: false,
    checklist: [
      { key: "location", label: "Pin and landmark", ok: true, required: true, detail: "Opposite Mbare market" },
      { key: "call", label: "Ops call", ok: false, required: true, detail: "No call logged" },
    ],
    score: { passed: 1, total: 2 },
    canApprove: false,
    actions: ["reject"],
    licence: null,
    calls: [],
    history: [],
    ...over,
  };
}

const METRICS: MerchantMetrics = {
  since: "2026-10-13T00:00:00.000Z",
  short: true,
  windowDays: 30,
  orders: 4,
  acceptMedianSeconds: 120,
  acceptSample: 2,
  missedPct: 25,
  missed: 1,
  prepMedianMinutes: 17,
  promisedMedianMinutes: 18,
  prepSample: 2,
  outOfStockPct: null,
  outOfStockLines: 0,
  lines: 0,
  hoursOpen: null,
  hoursScheduled: null,
  rating: null,
  openDebtAmount: "0.00",
  openDebtCount: 0,
};

/** Serves the detail, and (when given) the application and metrics reads; an older API 404s them. */
async function open(m: MerchantDetail, extra: { app?: MerchantApplication; metrics?: MerchantMetrics } = {}) {
  vi.mocked(adminFetchResult).mockImplementation(async (path: string) => {
    if (path.endsWith("/application")) return extra.app ? { data: extra.app } : { reason: "not-found" };
    if (path.endsWith("/metrics")) return extra.metrics ? { data: extra.metrics } : { reason: "not-found" };
    return { data: m };
  });
  render(await MerchantProfilePage({ params: Promise.resolve({ id: m.id }), searchParams: Promise.resolve({}) }));
}

describe("Merchant profile: holding a business's bookings (merchant web upgrade L2, R2-5)", () => {
  it("links to the booking account, where ops holds every booking the business makes", async () => {
    await open(detail({ bookingAccount: { id: "p-booking", onHold: false } }));
    const link = screen.getByRole("link", { name: "Active — hold it on the booking account →" });
    expect(link.getAttribute("href")).toBe("/customers/p-booking");
  });

  it("says when the business's bookings are on hold", async () => {
    await open(detail({ bookingAccount: { id: "p-booking", onHold: true } }));
    expect(screen.getByRole("link", { name: "On hold — lift it on the booking account →" })).toBeTruthy();
  });

  it("before the first booking there's no account to hold yet", async () => {
    await open(detail({ bookingAccount: null }));
    expect(screen.getByText("No bookings yet")).toBeTruthy();
  });

  it("shows nothing about bookings on an API that can't book bikers yet", async () => {
    await open(detail());
    expect(screen.queryByText("Book a biker")).toBeNull();
  });
});

describe("Merchant profile: the people behind the business (owner, 2026-10-24)", () => {
  it("lists the team and the own bikers, each opening their own page", async () => {
    await open(
      detail({
        team: [
          { profileId: "p-own", name: "Tendai M", role: "owner", isPharmacist: false, phoneMasked: "+263•••••1111", hasCustomerPage: true, since: "2026-07-01" },
          { profileId: "p-stf", name: "Rudo", role: "staff", isPharmacist: true, phoneMasked: "+263•••••2222", hasCustomerPage: false, since: "2026-08-01" },
        ],
        bikers: [{ profileId: "r-1", name: "Blessing C", phoneMasked: "+263•••••3333", isOnline: true, accountStatus: "active", since: "2026-10-20" }],
      }),
    );
    expect(screen.getByText("Team · 2")).toBeTruthy();
    expect(screen.getByText("Own bikers · 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Tendai M" }).getAttribute("href")).toBe("/customers/p-own");
    // A merchant-only profile has no customer page to open.
    expect(screen.queryByRole("link", { name: "Open Rudo" })).toBeNull();
    expect(screen.getByText("pharmacist")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Blessing C" }).getAttribute("href")).toBe("/riders/r-1");
  });

  it("says so when there are no own bikers", async () => {
    await open(detail({ team: [], bikers: [] }));
    expect(screen.getByText("No own bikers ride from this branch.")).toBeTruthy();
  });

  it("shows no people card on an API that doesn't send them", async () => {
    await open(detail());
    expect(screen.queryByText(/^Team ·/)).toBeNull();
  });
});

describe("Merchant profile: Taking orders (auto-accept)", () => {
  it("a restaurant shows its three switches with their current state", async () => {
    await open(detail({ businessType: "restaurant", shopKind: null, autoAccept: true, showPhoneToCustomers: false, freeDelivery: false }));
    const card = screen.getByRole("region", { name: "Taking orders" });
    expect(card.textContent).toContain("Accept orders automatically");
    expect(card.textContent).toContain("Show the restaurant's number to customers");
    expect(card.textContent).toContain("Free delivery");
    expect(screen.getByRole("button", { name: "Turn off…" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Turn on…" })).toHaveLength(2);
  });

  it("D-71: a shop's Taking orders card has only the free-delivery switch (shops never auto-accept)", async () => {
    await open(detail({ freeDelivery: true }));
    const card = screen.getByRole("region", { name: "Taking orders" });
    expect(card.textContent).toContain("Free delivery");
    expect(card.textContent).not.toContain("Accept orders automatically");
    expect(screen.getByRole("button", { name: "Turn off…" })).toBeTruthy();
  });
});

describe("Merchant profile: the application (admin console v2 §5)", () => {
  it("while not live, the application card sits at the top with the checklist, score and allowed actions", async () => {
    await open(detail(), { app: application() });
    const card = screen.getByRole("region", { name: "Application" });
    expect(card.textContent).toContain("1/2 required checks");
    expect(card.textContent).toContain("In review");
    expect(card.textContent).toContain("Opposite Mbare market");
    expect(card.textContent).toContain("No call logged");
    expect(card.textContent).toContain("Approve shows once Ops call passes.");
    expect(screen.getByRole("button", { name: "Log call…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suspend…" })).toBeNull();
  });

  it("names every failing required check, lists required checks first, and never marks a missing optional one ❌", async () => {
    await open(detail(), {
      app: application({
        checklist: [
          { key: "hours", label: "Opening hours", ok: false, required: true, detail: "Not set" },
          { key: "shopfront", label: "Shop front", ok: false, required: false, detail: "no logo · no cover · no about" },
          { key: "menu", label: "Items", ok: false, required: true, detail: "0 categories · no items" },
          { key: "call", label: "Ops call", ok: true, required: true, detail: "Spoke to the business" },
        ],
        score: { passed: 1, total: 3 },
      }),
    });
    const card = screen.getByRole("region", { name: "Application" });
    expect(card.textContent).toContain("Approve shows once Opening hours and Items pass.");
    expect(card.textContent!.indexOf("Ops call")).toBeLessThan(card.textContent!.indexOf("Shop front (optional)"));
    expect(screen.getAllByLabelText("Fails")).toHaveLength(2);
    expect(screen.getByLabelText("Not yet (optional)")).toBeTruthy();
  });

  it("a new application says Approve comes after Start review", async () => {
    await open(detail(), { app: application({ status: "applied", actions: ["review", "reject"] }) });
    expect(screen.getByRole("region", { name: "Application" }).textContent).toContain("Approve shows after Start review, once Ops call passes.");
    expect(screen.getByRole("button", { name: "Start review…" })).toBeTruthy();
  });

  it("a pharmacy's card offers the licence actions", async () => {
    await open(detail({ shopKind: "pharmacy" }), {
      app: application({ isPharmacy: true, licence: { licenceNumber: "PCZ-1", pharmacistName: "R. Dube", reference: null, recordedBy: "ops", recordedAt: "2026-10-12T08:00:00.000Z", verifiedAt: null, verifiedBy: null } }),
    });
    expect(screen.getByRole("button", { name: "Edit licence…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark verified…" })).toBeTruthy();
  });

  it("a rejected application says what the business was told", async () => {
    await open(detail(), { app: application({ status: "rejected", rejectReason: "outside_area", sla: null, actions: ["review"] }) });
    expect(screen.getByRole("region", { name: "Application" }).textContent).toContain("Told: Your business is outside the area LyniaGo covers for now.");
    expect(screen.getByRole("button", { name: "Start review…" })).toBeTruthy();
  });

  it("a live business has no application card, and can be suspended from the header", async () => {
    await open(detail({ pilotEnabled: true }), { app: application({ status: "live", sla: null, actions: ["suspend"] }) });
    expect(screen.queryByRole("region", { name: "Application" })).toBeNull();
    expect(screen.getByRole("button", { name: "Suspend…" })).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("a live pharmacy without a verified licence is grandfathered: a warning and the licence action, still live", async () => {
    await open(detail({ pilotEnabled: true, shopKind: "pharmacy" }), {
      app: application({
        status: "live",
        isPharmacy: true,
        sla: null,
        actions: ["suspend"],
        checklist: [{ key: "licence", label: "Pharmacy licence", ok: false, required: true, detail: "Not recorded", warning: "Live before licences were checked. Record and verify it." }],
      }),
    });
    expect(screen.getByText("No verified pharmacy licence.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record licence…" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Application" })).toBeNull();
  });

  it("the performance card shows the numbers it has, \"—\" for the rest, and says since when", async () => {
    await open(detail(), { metrics: METRICS });
    const card = screen.getByRole("region", { name: "Performance" });
    expect(card.textContent).toContain("since 13 Oct 2026");
    expect(card.textContent).toContain("2 min median");
    expect(card.textContent).toContain("25% (1)");
    expect(card.textContent).toContain("17 min vs 18 min promised");
    expect(card.textContent).toContain("—");
  });

  it("an API without the application read shows the old not-live warning instead", async () => {
    await open(detail());
    expect(screen.queryByRole("region", { name: "Application" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Performance" })).toBeNull();
    expect(screen.getByText("Customers can't see this shop yet.")).toBeTruthy();
  });
});
