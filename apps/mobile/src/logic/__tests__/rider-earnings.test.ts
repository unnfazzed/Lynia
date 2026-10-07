import type { WalletEntry } from "@lynia/shared";
import type { OrderHistoryRow } from "../../api/orders";
import { buildMoneyFeed, filterMoneyFeed } from "../money-feed";
import { dayLabel, groupByDay, paidFare, startOfWeek, summarise } from "../rider-earnings";
import { DEFAULT_RIDER_PREFS, navUrl, parseRiderPrefs } from "../rider-prefs";

// Thu 1 Oct 2026, 14:00 local.
const NOW = new Date(2026, 9, 1, 14, 0);
const at = (d: number, h: number): string => new Date(2026, 9, d, h, 0).toISOString();

function row(over: Partial<OrderHistoryRow>): OrderHistoryRow {
  return {
    id: Math.random().toString(36),
    orderType: "parcel",
    merchantName: null,
    role: "rider",
    pickup: { point: { lat: 0, lng: 0 }, landmark: "Eastgate" },
    dropoff: { point: { lat: 0, lng: 0 }, landmark: "Avenues" },
    itemDesc: "Docs",
    note: null,
    proposedFare: "3.00",
    agreedFare: "3.20",
    status: "delivered",
    createdAt: at(1, 9),
    rating: null,
    counterpartyName: null,
    ...over,
  };
}

describe("rider earnings", () => {
  it("counts only delivered (or rated) rider jobs as a paid fare", () => {
    expect(paidFare(row({}))).toBe(3.2);
    expect(paidFare(row({ status: "completed" }))).toBe(3.2);
    expect(paidFare(row({ status: "undelivered" }))).toBeNull();
    expect(paidFare(row({ status: "cancelled" }))).toBeNull();
    expect(paidFare(row({ agreedFare: null }))).toBe(3);
  });

  it("LC-B-SIB-4: a rider's food job earns its delivery fee, not the customer's goods+delivery total", () => {
    const food = row({ orderType: "merchant", merchantName: "Sadza Republic", agreedFare: "20.00", deliveryFee: "2.50" });
    expect(paidFare(food)).toBe(2.5);
    // The EARNINGS card adds the fee, not $20 of dishes that went back to the kitchen.
    expect(summarise([row({}), food], "today", NOW).total).toBeCloseTo(5.7);
    // The Money feed's fare row says the same.
    const feed = buildMoneyFeed([food], []);
    expect(feed.find((i) => i.kind === "fare")?.amount).toBe(2.5);
    // A customer's own food order keeps what they paid; an older API with no deliveryFee keeps the old reading.
    expect(paidFare(row({ role: "customer", orderType: "merchant", agreedFare: "20.00", deliveryFee: "2.50" }))).toBe(20);
    expect(paidFare(row({ orderType: "merchant", agreedFare: "20.00" }))).toBe(20);
  });

  it("weeks start on Monday", () => {
    expect(startOfWeek(NOW).getDate()).toBe(28); // Mon 28 Sep
  });

  it("summarises today and the week, split by service, ignoring customer orders", () => {
    const rows = [
      row({}),
      row({ orderType: "merchant", agreedFare: "2.80", createdAt: at(1, 8) }),
      row({ createdAt: new Date(2026, 8, 29, 10).toISOString(), agreedFare: "5.00" }),
      row({ createdAt: new Date(2026, 8, 27, 10).toISOString() }), // last week (Sun 27 Sep)
      row({ role: "customer" }),
      row({ status: "cancelled" }),
    ];
    const today = summarise(rows, "today", NOW);
    expect(today).toMatchObject({ total: 6, jobs: 2, parcels: 1, food: 1 });
    const week = summarise(rows, "week", NOW);
    expect(week.total).toBe(11);
    expect(week.byDay).toEqual([0, 5, 0, 6, 0, 0, 0]);
  });

  it("labels and groups days", () => {
    expect(dayLabel(new Date(2026, 9, 1, 8), NOW, "TODAY", "YESTERDAY")).toBe("TODAY");
    expect(dayLabel(new Date(2026, 8, 30, 8), NOW, "TODAY", "YESTERDAY")).toBe("YESTERDAY");
    const g = groupByDay([new Date(2026, 9, 1, 9), new Date(2026, 9, 1, 8), new Date(2026, 8, 30, 8)], (d) => d, NOW, "T", "Y");
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ["T", 2],
      ["Y", 1],
    ]);
  });
});

describe("the Money feed", () => {
  const entry = (over: Partial<WalletEntry>): WalletEntry => ({ id: "w", type: "commission", amount: -0.32, balanceAfter: 7, title: "Commission", meta: "", createdAt: at(1, 10), ...over });

  it("merges fares with wallet entries, newest first, and filters by service", () => {
    const feed = buildMoneyFeed(
      [row({ createdAt: at(1, 9) }), row({ orderType: "merchant", merchantName: "Mama's Kitchen", createdAt: at(1, 8) })],
      [entry({ id: "c", createdAt: at(1, 10) }), entry({ id: "t", type: "topup", amount: 5, createdAt: at(1, 7) })],
    );
    expect(feed.map((i) => i.kind)).toEqual(["commission", "fare", "fare", "topup"]);
    expect(feed[2]!.title).toBe("Mama's Kitchen → Avenues");
    expect(filterMoneyFeed(feed, "food").map((i) => i.service)).toEqual(["food"]);
    expect(filterMoneyFeed(feed, "parcel").map((i) => i.kind)).toEqual(["commission", "fare"]);
  });
});

describe("rider prefs", () => {
  it("parses defensively", () => {
    expect(parseRiderPrefs(null)).toEqual(DEFAULT_RIDER_PREFS);
    expect(parseRiderPrefs("not json")).toEqual(DEFAULT_RIDER_PREFS);
    expect(parseRiderPrefs(JSON.stringify({ navApp: "waze", topupProvider: "omari", topupPhone: " 0771 " }))).toEqual({ navApp: "waze", topupProvider: "omari", topupPhone: "0771" });
    expect(parseRiderPrefs(JSON.stringify({ navApp: "x", topupProvider: "visa" }))).toEqual(DEFAULT_RIDER_PREFS);
  });

  it("builds a navigate link for the chosen app", () => {
    expect(navUrl("waze", { lat: -17.8, lng: 31.05 })).toContain("waze.com/ul?ll=-17.8,31.05");
    expect(navUrl("gmaps", { lat: -17.8, lng: 31.05 })).toContain("destination=-17.8,31.05");
  });
});
