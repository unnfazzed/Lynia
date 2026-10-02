import type { NotificationRow } from "../../../api/notifications";
import { earlier, N, NF } from "../copy";
import { buildFeed, dayLabel, timeLabel } from "../model";

/** Notifications v1 (ledger D-65): the view-model rules, README "Behaviour" / "Tones" / "Time". */

const NOW = new Date(2026, 9, 2, 12, 30); // Fri 2 Oct 2026, 12:30 local
const at = (d: number, h: number, m = 0): string => new Date(2026, 9, d, h, m).toISOString();
const dest = (r: NotificationRow): string => (r.orderId ? `/order/${r.orderId}` : "/home");
const row = (p: Partial<NotificationRow> & { id: string }): NotificationRow => ({ orderId: null, icon: "bell", title: "server title", message: "server message", at: at(2, 12), unread: false, ...p });
const feedOf = (rows: NotificationRow[], side: "customer" | "rider" = "customer", unread: string[] = []) =>
  buildFeed(rows, { side, now: NOW, unreadIds: new Set(unread), dest });

describe("the NF shapes give back the drawn N strings for the samples", () => {
  it.each([
    [NF.parcelTo("Glenara Ave"), N.tGlenara],
    [NF.job("Eastgate", "Glenara Ave"), N.tJobGlenara],
    [NF.cAssigned("Tendai"), N.cAssigned],
    [NF.cOnWay("Tendai"), N.cOnWay],
    [NF.cCollected("Tendai"), N.cCollected],
    [NF.cToDrop("Tendai"), N.cToDrop],
    [NF.cDelivered("Tendai"), N.cDelivered],
    [NF.cNotDone("Tendai"), N.cNotDone],
    [NF.cOffer("Farai", "3.20"), N.cOffer],
    [NF.cFare("3.50"), N.cFare],
    [NF.mPreparing(15), N.mPreparing],
    [NF.mCollected("Tendai"), N.mCollected],
    [NF.mSwap("Panado 24s", "Paracetamol 24s", "same price"), N.mSwap],
    [NF.rGot("3.20"), N.rGot],
    [NF.rDelivered("3.20"), N.rDelivered],
    [NF.sSosB("Tendai"), N.sSosB],
    [NF.min(2), N.m2],
    [NF.hr(1), N.h1],
    [NF.date(28, "Sep"), N.sep28],
    [NF.dayLabel("Mon", 28, "Sep"), N.d28],
    [NF.stale("09:41"), N.stale],
    [NF.otherSub(1, "Sadza Republic is on the way"), N.otherCS],
    [earlier(1), N.earlier1],
    [earlier(4), "4 earlier updates"],
  ])("%s", (built, drawn) => expect(built).toBe(drawn));
});

describe("time and day labels", () => {
  it("now · min · hr · Yesterday · 28 Sep", () => {
    expect(timeLabel(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe("now");
    expect(timeLabel(at(2, 12, 28), NOW)).toBe("2 min");
    expect(timeLabel(at(2, 11, 20), NOW)).toBe("1 hr");
    expect(timeLabel(at(1, 18), NOW)).toBe("Yesterday");
    expect(timeLabel(new Date(2026, 8, 28, 9).toISOString(), NOW)).toBe("28 Sep");
  });
  it("TODAY · YESTERDAY · MON 28 SEP", () => {
    expect(dayLabel(at(2, 8), NOW)).toBe(N.dToday);
    expect(dayLabel(at(1, 23), NOW)).toBe(N.dYest);
    expect(dayLabel(new Date(2026, 8, 28, 9).toISOString(), NOW)).toBe(N.d28);
  });
});

describe("grouping", () => {
  const delivered = row({
    id: "s1",
    orderId: "o1",
    to: "customer",
    type: "status",
    beat: "delivered",
    status: "delivered",
    service: "send",
    dropoffArea: "Glenara Ave",
    riderName: "Tendai",
    at: at(2, 10, 31),
    steps: [
      { beat: "delivered", title: "x", at: at(2, 10, 31) },
      { beat: "en_route_dropoff", title: "x", at: at(2, 10, 12) },
      { beat: "picked_up", title: "x", at: at(2, 10, 5) },
      { beat: "en_route_pickup", title: "x", at: at(2, 9, 58) },
      { beat: "confirmed", title: "x", at: at(2, 9, 52) },
    ],
  });

  it("one row per order: the latest update, its steps latest first, tone good", () => {
    const f = feedOf([delivered], "customer", ["s1"]);
    expect(f.days).toHaveLength(1);
    const item = f.days[0]!.items[0]!;
    expect(item).toMatchObject({ title: N.tGlenara, line: N.cDelivered, tone: "good", service: "send", unread: true, to: "/order/o1", rider: false });
    expect(item.steps.map((s) => s.label)).toEqual([N.tlDelivered, N.tlToDrop, N.tlCollected, N.tlOnWay, N.tlAssigned]);
    expect(item.steps.map((s) => s.clock)).toEqual(["10:31", "10:12", "10:05", "09:58", "09:52"]);
  });

  it("an order's other rows (offer, fare, SOS lifted) fold into its timeline", () => {
    const f = feedOf([
      delivered,
      row({ id: "fa", orderId: "o1", to: "customer", type: "fare", amount: "3.50", at: at(2, 9, 40) }),
      row({ id: "sos", orderId: "o1", type: "sos", active: false, at: at(2, 10, 0) }),
      row({ id: "acc", type: "account", action: "wallet.credit", at: at(2, 11) }),
    ]);
    const items = f.days[0]!.items;
    expect(items.map((i) => i.key)).toEqual(["acc", "o1"]);
    expect(items[1]!.steps.map((s) => s.label)).toContain(N.tlSos);
    expect(items[1]!.steps.map((s) => s.label).at(-1)).toBe("Fare updated");
    expect(items[1]!.ids.sort()).toEqual(["fa", "s1", "sos"]);
    expect(items[0]).toMatchObject({ title: N.aWalletT, tone: "money", icon: "banknote", line: "server message" });
  });

  it("an order sits in the day of its latest update", () => {
    const f = feedOf([
      row({ id: "y", orderId: "o2", to: "customer", type: "status", beat: "cancelled", service: "send", dropoffArea: "Belgravia", at: at(1, 17) }),
      row({ id: "t", orderId: "o2", to: "customer", type: "fare", at: at(2, 8) }),
    ]);
    expect(f.days.map((d) => d.label)).toEqual([N.dToday]);
  });

  it("day groups come newest first", () => {
    const f = feedOf([
      row({ id: "old", type: "account", action: "rider.kyc_approve", at: new Date(2026, 8, 28, 9).toISOString() }),
      row({ id: "y", type: "account", action: "wallet.credit", at: at(1, 9) }),
      row({ id: "t", type: "issue", orderId: "o9", at: at(2, 9) }),
    ]);
    expect(f.days.map((d) => d.label)).toEqual([N.dToday, N.dYest, N.d28]);
    expect(f.days[0]!.items[0]).toMatchObject({ title: N.sResolvedT, tone: "good" });
  });
});

describe("side, pin and needs-you", () => {
  const job = row({ id: "j", orderId: "o5", to: "rider", type: "status", beat: "completed", amount: "3.20", pickupArea: "Eastgate", dropoffArea: "Glenara Ave", service: "send" });
  const mine = row({ id: "c", orderId: "o6", to: "customer", type: "status", beat: "picked_up", venue: "Sadza Republic", service: "restaurants", riderName: "Tendai" });
  const acct = row({ id: "a", type: "account", action: "rider.lift" });

  it("the rider sees jobs + account rows, the customer orders + account rows", () => {
    const r = feedOf([job, mine, acct], "rider").days.flatMap((d) => d.items);
    expect(r.map((i) => i.title).sort()).toEqual([N.aRestoredT, N.tJobGlenara].sort());
    expect(r.find((i) => i.key === "o5")).toMatchObject({ line: N.rDelivered, tone: "good", rider: true });
    const c = feedOf([job, mine, acct], "customer").days.flatMap((d) => d.items);
    expect(c.map((i) => i.title).sort()).toEqual([N.aRestoredT, N.tSadza].sort());
    expect(c.find((i) => i.key === "o6")).toMatchObject({ line: N.mCollected, service: "restaurants", tone: "neutral" });
  });

  it("the other side's unread orders are summarised for the dual-role row", () => {
    expect(feedOf([job, mine], "customer", ["j"]).other).toEqual({ count: 1, what: N.tJobGlenara });
    expect(feedOf([job, mine], "customer", []).other).toBeNull();
  });

  it("a pause or SOS in force pins; once lifted it drops into its day as neutral", () => {
    const paused = row({ id: "p", type: "account", action: "rider.suspend", active: true });
    const f = feedOf([paused], "rider");
    expect(f.pinned.map((i) => [i.title, i.tone])).toEqual([[N.aPausedT, "danger"]]);
    expect(f.days).toEqual([]);
    const lifted = feedOf([{ ...paused, active: false }], "rider");
    expect(lifted.pinned).toEqual([]);
    expect(lifted.days[0]!.items[0]).toMatchObject({ tone: "neutral", title: N.aPausedT });

    const sos = row({ id: "s", orderId: "o7", type: "sos", active: true, riderName: "Tendai", to: "customer" });
    expect(feedOf([sos]).pinned[0]).toMatchObject({ title: N.sSosT, line: N.sSosB, tone: "danger", icon: "siren" });
  });

  it("needs-you rows carry their button while the ask is open", () => {
    const offer = row({ id: "of", orderId: "o8", to: "customer", type: "offer", active: true, riderName: "Farai", amount: "3.20", dropoffArea: "Avondale" });
    const item = feedOf([offer]).days[0]!.items[0]!;
    expect(item).toMatchObject({ title: N.tAvondaleP, line: N.cOffer, tone: "warn", action: { label: N.seeOffer, to: "/order/o8" } });
    expect(feedOf([{ ...offer, active: false }]).days[0]!.items[0]!.action).toBeUndefined();

    const swap = row({ id: "sw", orderId: "o9", to: "customer", type: "swap", active: true, venue: "Healthwise Pharmacy", service: "pharmacy", swap: { item: "Panado 24s", sub: "Paracetamol 24s", diff: "same price" } });
    expect(feedOf([swap]).days[0]!.items[0]).toMatchObject({ title: N.tPharm, line: N.mSwap, action: { label: N.reviewSwap } });

    const kyc = row({ id: "k", type: "account", action: "rider.kyc_decline" });
    expect(feedOf([kyc], "rider").days[0]!.items[0]).toMatchObject({ title: N.aIdT, tone: "warn", action: { label: N.tryAgain, to: "/rider/become" } });
  });

  it("swiped rows are hidden until committed", () => {
    const f = buildFeed([job, acct], { side: "rider", now: NOW, unreadIds: new Set(), hidden: new Set(["j"]), dest });
    expect(f.days.flatMap((d) => d.items).map((i) => i.key)).toEqual(["a"]);
  });

  it("an older API (no structured fields) still renders, on the server's copy", () => {
    const old = row({ id: "x", orderId: "o1", status: "en_route_pickup", title: "Rider on the way", message: "Your rider is heading to the pickup point.", to: "customer" });
    expect(feedOf([old]).days[0]!.items[0]).toMatchObject({ title: "Rider on the way", line: "Your rider is heading to the pickup point.", service: "send" });
  });
});
