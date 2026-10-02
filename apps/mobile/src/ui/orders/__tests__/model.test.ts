import type { OrderHistoryRow, OrderSnapshot } from "../../../api/orders";
import { dayLabel, firstSegment, historyRowVM, matchesQuery, monthYear, parcelNowVM, searchDate, sortNow, type NowCardVM } from "../model";

/** Orders v2 view-models (packages/design/handoff/orders-v2 README §4–§6, ledger D-63). */

const NOW = new Date(2026, 9, 2, 12, 0, 0); // Fri 2 Oct 2026, local time
const at = (daysAgo: number, h = 10, m = 0): string => new Date(2026, 9, 2 - daysAgo, h, m).toISOString();

const row = (over: Partial<OrderHistoryRow> = {}): OrderHistoryRow => ({
  id: "o1",
  orderType: "parcel",
  merchantName: null,
  role: "customer",
  pickup: { point: { lat: 0, lng: 0 }, landmark: "Eastgate Mall, CBD" },
  dropoff: { point: { lat: 0, lng: 0 }, landmark: "Belgravia, Harare" },
  itemDesc: "Documents",
  note: null,
  proposedFare: "3.00",
  agreedFare: "3.36",
  status: "delivered",
  createdAt: at(0),
  rating: null,
  counterpartyName: "Tendai Moyo",
  ...over,
});

const snap = (over: Partial<OrderSnapshot> = {}): OrderSnapshot =>
  ({
    id: "p1",
    status: "en_route_dropoff",
    orderType: "parcel",
    agreedFare: "3.36",
    proposedFare: "3.00",
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate Mall, CBD" },
    dropoff: { point: { lat: -17.8, lng: 31.04 }, landmark: "Belgravia, Harare" },
    rider: null,
    riderCard: { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 3, tripsCount: 9, plate: null, verified: true },
    events: [],
    counterpartyPhone: null,
    expiresAt: null,
    ...over,
  }) as OrderSnapshot;

describe("day labels", () => {
  it("TODAY · YESTERDAY · weekday for 2–6 days · 'TUE 22 SEP' after, with the year only when it isn't this one", () => {
    expect(dayLabel(at(0), NOW)).toBe("TODAY");
    expect(dayLabel(at(1), NOW)).toBe("YESTERDAY");
    expect(dayLabel(at(4), NOW)).toBe("MONDAY");
    expect(dayLabel(at(10), NOW)).toBe("TUE 22 SEP");
    expect(dayLabel(new Date(2025, 8, 23).toISOString(), NOW)).toBe("TUE 23 SEP 2025");
  });

  it("search results show the date instead of the time", () => {
    expect(searchDate(at(0), NOW)).toBe("Today");
    expect(searchDate(at(1), NOW)).toBe("Yesterday");
    expect(searchDate(at(4), NOW)).toBe("Monday");
    expect(searchDate(at(10), NOW)).toBe("Tue 22 Sep");
  });

  it("the End row's month", () => {
    expect(monthYear(new Date(2025, 2, 4).toISOString())).toBe("Mar 2025");
  });
});

describe("history rows", () => {
  it("parcel: 'Parcel to <first segment>', '<item> · from <pickup>', the paid fare and 'Tendai M.'", () => {
    const v = historyRowVM(row());
    expect(v.title).toBe("Parcel to Belgravia");
    expect(v.items).toBe("Documents · from Eastgate Mall");
    expect(v.outcome).toBe("delivered");
    expect(v.chargedUsd).toBe(3.36);
    expect(v.riderName).toBe("Tendai M.");
    expect(v.service).toBe("send");
  });

  it("merchant: the venue name and its dish summary", () => {
    const v = historyRowVM(row({ orderType: "merchant", merchantName: "Sadza Republic", itemDesc: "Sadza & beef stew" }));
    expect(v.title).toBe("Sadza Republic");
    expect(v.items).toBe("Sadza & beef stew");
    expect(v.service).toBe("restaurants");
  });

  it.each([
    ["expired", "noRider"],
    ["undelivered", "notDelivered"],
    ["cancelled", "cancelledByYou"],
    ["completed", "delivered"],
  ] as const)("%s → %s; only a delivery is charged", (status, outcome) => {
    const v = historyRowVM(row({ status }));
    expect(v.outcome).toBe(outcome);
    expect(v.chargedUsd).toBe(outcome === "delivered" ? 3.36 : 0);
  });

  it("search matches the title, the drop-off area and the rider, case-insensitively", () => {
    const v = historyRowVM(row());
    expect(matchesQuery(v, "belgr")).toBe(true);
    expect(matchesQuery(v, "harare")).toBe(true);
    expect(matchesQuery(v, "TENDAI")).toBe(true);
    expect(matchesQuery(v, "msasa")).toBe(false);
  });

  it("firstSegment falls back to the whole text when there is no comma", () => {
    expect(firstSegment("Mbare")).toBe("Mbare");
    expect(firstSegment(" 14 Lanark Rd , Belgravia")).toBe("14 Lanark Rd");
  });
});

describe("parcel Now cards", () => {
  const nowMs = NOW.getTime();

  it("finding: the asking price and the time left; nothing lit", () => {
    const v = parcelNowVM(snap({ status: "open_for_offers", agreedFare: null, riderCard: null, expiresAt: new Date(nowMs + 252_000).toISOString() }), nowMs, null);
    expect(v.title).toBe("Finding a rider");
    expect(v.sub).toBe("Parcel to Belgravia · asking $3.00");
    expect(v.pill).toBe("4:12 left");
    expect(v.lit).toBe(0);
  });

  it("each stage says who is doing what, on the four-step track", () => {
    expect(parcelNowVM(snap({ status: "assigned" }), nowMs, null)).toMatchObject({ title: "Tendai M. is your rider", lit: 1, icon: "package" });
    expect(parcelNowVM(snap({ status: "en_route_pickup" }), nowMs, null)).toMatchObject({ title: "Tendai is heading to pickup", sub: "Eastgate Mall, CBD → Belgravia", lit: 1 });
    expect(parcelNowVM(snap({ status: "picked_up" }), nowMs, null)).toMatchObject({ title: "Tendai has your parcel", lit: 2, icon: "bike" });
    expect(parcelNowVM(snap({ status: "en_route_dropoff" }), nowMs, null)).toMatchObject({ title: "Tendai is on the way", sub: "Parcel to Belgravia · $3.36", lit: 3, icon: "bike" });
  });

  it("before the rider's name reaches the phone, the After Send stage name stands in", () => {
    expect(parcelNowVM(snap({ status: "assigned", riderCard: null }), nowMs, null).title).toBe("Rider assigned");
    expect(parcelNowVM(snap({ riderCard: null }), nowMs, null).title).toBe("On the way");
  });

  it("a fresh GPS fix gives the yellow ETA chip; a stale one gives 'No ETA' and the last-seen time", () => {
    const fresh = parcelNowVM(snap({ rider: { profileId: "r", currentLat: -17.81, currentLng: 31.04, updatedAt: new Date(nowMs - 10_000).toISOString() } }), nowMs, null);
    expect(fresh.etaMinutes).toBeGreaterThan(0);
    expect(fresh.pill).toBeNull();
    const seen = new Date(2026, 9, 2, 11, 50).toISOString();
    const stale = parcelNowVM(snap({ rider: { profileId: "r", currentLat: -17.81, currentLng: 31.04, updatedAt: seen } }), nowMs, null);
    expect(stale.etaMinutes).toBeNull();
    expect(stale.pill).toBe("No ETA");
    expect(stale.sub).toBe("Location not updating · last seen 11:50");
  });

  it("offline: last stage kept, ETA dropped, 'Last known · ' sub and the 'As of' pill", () => {
    const v = parcelNowVM(snap({ rider: { profileId: "r", currentLat: -17.81, currentLng: 31.04, updatedAt: new Date(nowMs).toISOString() } }), nowMs, "09:24");
    expect(v.etaMinutes).toBeNull();
    expect(v.pill).toBe("As of 09:24");
    expect(v.sub).toBe("Last known · Parcel to Belgravia · $3.36");
    expect(v.icon).toBe("package");
  });

  it("most-advanced first, then the feed's own order", () => {
    const c = (id: string, lit: number): NowCardVM => ({ id, icon: "package", title: id, sub: "", lit, etaMinutes: null, pill: null });
    expect(sortNow([c("a", 1), c("b", 3), c("c", 1), c("d", 0)]).map((x) => x.id)).toEqual(["b", "a", "c", "d"]);
  });
});
