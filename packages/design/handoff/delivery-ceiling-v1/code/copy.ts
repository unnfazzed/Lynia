/* LyniaGo Delivery ceiling v1 — every new or changed string. Source of truth: dc-screens.js (DC).
   {x} = runtime value. Copy says "rider"; the app renders it as "biker". Keys are stable i18n ids.
   Strings that replace an Order flow v2.1 string are marked // was: … (key in O). */
export const DC = {
  r: {
    dlv: "DELIVERY",
    trip: "{km} km",
    rec: "Recommended",
    slow: "Below the recommended price, riders may take longer to accept.",
    upTo: "Pay no more than", // was: "Pay up to"
    promise: "Riders are asked at a lower price first, so you’ll often pay less. Never more.",
    lower: "Lower by $0.50", // a11y label, − button
    raise: "Raise by $0.50", // a11y label, + button
    lowest: "Lowest is {p}", // a11y label, − disabled
    highest: "Highest is {p}", // a11y label, + disabled
    feeUpTo: "{p} at most", // Delivery fee row value; "at most" 13/600 muted
    totalUpTo: "{p} at most", // Total row value
    free: "Free", // Delivery fee row on a free-delivery venue (never "$0.00")
    freeTag: "Free delivery",
    cashSubUpTo: "Have {p} ready. It may be less. You’ll see the exact amount when a rider accepts.", // was: O.r.cashSub "Have {p} ready — riders carry little change."
    place: "Place order · {p} cash at most", // was: O.r.place "Place order · {p} cash"
  },
  t: {
    searching: "Delivery {d} at most",
    searchingSub: "finding a lower price", // joined with " · "
    orderUpTo: "{n} {items} · {p} cash at most", // Your order row, before acceptance
    orderExact: "{n} {items} · {p} cash", // Your order row, after acceptance
    payReady: "Have {p} ready",
    payFee: "Delivery {d}",
    saved: "you saved {s}", // joined with " · ", only when accepted < up to
    slowRiderSub: "No rider has taken it at {d} yet. Your order is kept ready at {v}.", // was: O.t.slowRiderSub "We’re asking more riders now. Your food is kept warm — same food, same price, nothing extra to pay."
    raiseT: "Raise to {d}?",
    raiseSub: "More riders say yes at a higher price. You still pay only what a rider accepts.",
    raiseNew: "Pay no more than",
    raiseTotal: "Total {p} cash at most",
    raiseBtn: "Raise to {d}", // follows the stepper
    keepWaiting: "Keep waiting",
    raisedToast: "Raised to {d} at most. Asking riders now.",
  },
  push: {
    raise: ["No rider yet for your {v} order", "Raise delivery to {d} at most, or keep waiting."],
    raiseActions: ["Raise to {d}", "Keep waiting"],
    accepted: ["Tendai is heading to {v}", "Have {p} ready at the door."], // was: O.g.push.c[3] ["Tendai is heading to Gava’s Kitchen","He’ll collect your order soon."]
  },
  o: { // Orders v2 Now card
    beforeT: "{v} is packing",
    before: "Packing · {p} cash at most",
    afterT: "Tendai is on the way to {v}",
    after: "Have {p} ready at the door",
  },
  n: { // Notifications v1 row line
    before: "Packing your order · delivery {d} at most",
    after: "Tendai accepted · have {p} ready",
  },
  m: {
    holdT: "No rider yet",
    holdSub: "Riders are offered {o}. Nobody has taken it so far.", // was: "Nobody has taken it so far. Keep searching, or cancel and the customer is told."
    topT: "Add to the offer from your cash",
    topSub: "You pay it. {c}’s price doesn’t change.",
    topUps: ["+$0.50", "+$1", "+$2"],
    topOffer: "Offer {o}",
    topAria: "Add {t}", // a11y label on each top-up button, e.g. "Add $1.00"
    keep: "Keep searching",
    cancel: "Cancel order",
    askIn: "We’ll ask {c} to raise in {t}.",
    sentToast: "Offer raised to {o}. Finding a rider.",
    finding: "Finding a rider",
    offered: "Offered {o} · includes your {t}",
    cashGoods: "Goods",
    cashTop: "Rider top-up", // value "−{t}"
    cashBack: "Cash back",
    boardT: "#{id} · No rider yet",
    boardSub: "Offered {o} · we ask {c} in {t}",
    boardBtn: "Top up",
    moneySub: "Delivered · rider top-up −{t}",
    moneyKpi: "{n} orders · {s} sales · rider top-ups −{t}",
  },
} as const;
