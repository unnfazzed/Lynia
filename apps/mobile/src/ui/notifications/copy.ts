/**
 * Notifications v1 (`packages/design/handoff/notifications-v1/`, ledger D-65) — every user-facing string.
 *
 * `N` is the handoff's `N` (n-kit.jsx), VERBATIM: it ships as drawn. Names, prices, places and times in it
 * are the design's sample data — `src/ui/notifications/model.ts` builds the real strings from the feed in
 * the same sentence shapes (`NF`). Strings the app needs that the handoff never drew are in `NX`, each
 * listed in the ledger entry.
 */
export const N = {
  title: "Notifications",
  /* day groups + times */
  dToday: "TODAY", dYest: "YESTERDAY", d28: "MON 28 SEP",
  now: "now", m2: "2 min", m40: "40 min", h1: "1 hr", h3: "3 hr", yest: "Yesterday", sep28: "28 Sep",
  earlier1: "1 earlier update", earlierN: "earlier updates",
  hide: "Hide updates", openOrder: "Open order", openJob: "Open job",
  /* order titles (customer) — parcels by drop-off, merchant orders by venue */
  tGlenara: "Parcel to Glenara Ave", tBelgravia: "Parcel to Belgravia", tMbare: "Parcel to Mbare", tAvondaleP: "Parcel to Avondale",
  tSadza: "Sadza Republic", tPharm: "Healthwise Pharmacy", tMama: "Mama's Kitchen", tTM: "TM Pick n Pay, Borrowdale",
  /* order updates · customer voice (row line) */
  cAssigned: "Tendai is your rider.", cOnWay: "Tendai is heading to pickup.", cCollected: "Tendai has your parcel.",
  cToDrop: "Tendai is on the way to the drop-off.", cDelivered: "Delivered. How was Tendai?",
  cNotDone: "Tendai couldn't complete the delivery. We'll help you get it back.",
  cCancelled: "Order cancelled. Nothing was charged.", cNoRiders: "No riders yet. We're still asking nearby.",
  cRiderCx: "Your rider had to cancel. We're finding you another.", cWindow: "No rider took it in time. Post it again when you're ready.",
  cOffer: "Farai offered $3.20 to carry it.", cFare: "The fare is now $3.50.", cNear: "A rider is online near you.",
  /* order updates · timeline step labels */
  tlPosted: "Posted", tlAssigned: "Rider assigned", tlOnWay: "Rider on the way", tlCollected: "Parcel collected", tlToDrop: "On the way to drop-off",
  tlDelivered: "Delivered", tlCancelled: "Order cancelled", tlNoRiders: "No riders yet", tlOffer: "New offer", tlSos: "SOS on your delivery", tlBack: "Back on track",
  /* merchant orders */
  mAccepted: "Order accepted.", mPreparing: "Being prepared. About 15 min.", mCollected: "Tendai collected your food. On the way.",
  mDoor: "Your rider is at the door.", mDelivered: "Delivered. Enjoy your meal.", mDeliveredShop: "Delivered.",
  mSwap: "Panado 24s is out. They'd like to send Paracetamol 24s instead, same price.",
  tmAccepted: "Accepted", tmPreparing: "Being prepared", tmCollected: "Rider collected", tmDoor: "At your door", tmDelivered: "Delivered", tmSwap: "Item swapped",
  /* order updates · rider voice */
  rGot: "You got the job. $3.20 cash.", rToPickup: "Heading to pickup.", rCollected: "Parcel collected.",
  rDelivered: "Delivered. The $3.20 cash is yours.", rDelivered2: "Delivered. The $2.50 cash is yours.",
  rNotDone: "Delivery not completed. This doesn't count against you.", rCancelled: "Nyasha cancelled the order. This doesn't count against you.",
  trGot: "You got the job", trToPickup: "Heading to pickup", trCollected: "Parcel collected", trDelivered: "Delivered", trCancelled: "Order cancelled",
  tJobGlenara: "Eastgate → Glenara Ave", tJobAvondale: "Mama's Kitchen → Avondale", tJobBelgravia: "Fife Ave → Belgravia",
  /* account */
  aVerifiedT: "You're verified", aVerifiedB: "You can take parcel and food jobs.",
  aIdT: "ID check needs another look", aIdB: "Your ID photo was blurry. Take it again in good light.",
  aPausedT: "Account paused", aPausedB: "We're checking a customer report. You can't take jobs until it's cleared.",
  aBlockedT: "Account blocked", aBlockedB: "Call support and we'll talk it through.",
  aRestoredT: "Account restored", aRestoredB: "The report is cleared. You can take jobs again.",
  aWalletT: "Wallet credited", aWalletR: "$5.00 top-up added. Your balance is $12.60.", aWalletC: "$3.36 refund added to your wallet.",
  /* safety & support */
  sSosT: "SOS on your delivery", sSosB: "Our safety team is with Tendai now. Your parcel is safe.",
  sUpdate: "An update on your delivery: Tendai is moving again.", sBack: "Your delivery is back on track.",
  sResolvedT: "Your report was resolved", sResolvedB: "We refunded the late fee to your wallet.",
  /* actions — only rows that need you */
  seeOffer: "See offer", reviewSwap: "Review swap", tryAgain: "Try again",
  /* notifications off (Rider v2 J8 row) */
  offC: "Notifications are off. You won't hear when a rider offers or your order arrives.",
  offR: "Notifications are off. You won't get new jobs or food offers.", turnOn: "Turn on",
  /* swipe */
  remove: "Remove", removed: "Notification removed", undo: "Undo",
  /* dual role */
  otherR: "On the Rider side", otherRS: "2 updates · wallet credited, account restored",
  otherC: "On the Customer side", otherCS: "1 update · Sadza Republic is on the way",
  /* empty */
  emptyCT: "Nothing here yet", emptyCB: "Updates about your orders and your account show up here.", sendParcel: "Send a parcel",
  emptyRT: "No updates yet", emptyRB: "Updates about your jobs, money and account show up here.",
  /* loading + errors */
  slow: "Slow connection. Still loading…",
  failT: "Couldn't load notifications", failB: "Check your data, then try again. Your orders aren't affected.",
  stale: "Showing updates from 09:41. We couldn't refresh.",
};

export const earlier = (n: number): string => n === 1 ? N.earlier1 : `${n} ${N.earlierN}`;

/**
 * The handoff's sample strings, re-shaped with slots. Each one is the `N` sentence with its sample value
 * (Tendai, $3.20, Farai, Nyasha, 15 min, Panado 24s …) turned into an argument — `copy.test.ts` fills them
 * with the samples and asserts the drawn `N` string comes back byte for byte.
 */
export const NF = {
  parcelTo: (area: string) => `Parcel to ${area}`,
  job: (from: string, to: string) => `${from} → ${to}`,
  cAssigned: (n: string) => `${n} is your rider.`,
  cOnWay: (n: string) => `${n} is heading to pickup.`,
  cCollected: (n: string) => `${n} has your parcel.`,
  cToDrop: (n: string) => `${n} is on the way to the drop-off.`,
  cDelivered: (n: string) => `Delivered. How was ${n}?`,
  cNotDone: (n: string) => `${n} couldn't complete the delivery. We'll help you get it back.`,
  cOffer: (n: string, p: string) => `${n} offered $${p} to carry it.`,
  cFare: (p: string) => `The fare is now $${p}.`,
  mPreparing: (min: number | null) => (min == null ? "Being prepared." : `Being prepared. About ${min} min.`),
  mCollected: (n: string) => `${n} collected your food. On the way.`,
  mSwap: (i: string, s: string, d: string) => `${i} is out. They'd like to send ${s} instead, ${d}.`,
  rGot: (p: string) => `You got the job. $${p} cash.`,
  rDelivered: (p: string) => `Delivered. The $${p} cash is yours.`,
  sSosB: (n: string) => `Our safety team is with ${n} now. Your parcel is safe.`,
  /** "2 min" · "1 hr" — the N.m2 / N.h1 shapes. */
  min: (m: number) => `${m} min`,
  hr: (h: number) => `${h} hr`,
  /** "28 Sep" / "MON 28 SEP" — N.sep28 / N.d28. */
  date: (day: number, mon: string) => `${day} ${mon}`,
  dayLabel: (wd: string, day: number, mon: string) => `${wd} ${day} ${mon}`.toUpperCase(),
  stale: (hhmm: string) => `Showing updates from ${hhmm}. We couldn't refresh.`,
  /** The OtherSide sub line: "2 updates · wallet credited, account restored". */
  otherSub: (n: number, what: string) => `${n} ${n === 1 ? "update" : "updates"} · ${what}`,
};

/** App strings the handoff never drew (ledger D-65 §4). */
export const NX = {
  /** Timeline step for a fare correction (the server row's own title). */
  tlFare: "Fare updated",
  /** Timeline step for a rider bail that was re-sent (After Send v2's stage name). */
  tlRebroadcast: "Your rider had to cancel",
};
