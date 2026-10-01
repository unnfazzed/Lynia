/**
 * Every user-facing string on the customer's order screen — the After Send handoff's `A` object
 * (`packages/design/handoff/after-send/design/as-kit.jsx`, ledger D-53), verbatim. The handoff's sample
 * values (Tendai, $3.36, 6 min, 4182, ABH 4721, 09:12 …) become the small formatters below; the wording
 * around them is unchanged. Components read strings from here only — no inline literals.
 */
export const ORDER_COPY = {
  back: "Back",
  /* titles per stage */
  tFinding: "Finding a rider",
  tNoOnline: "No riders online",
  tChoose: "Choose a rider",
  tOnWay: "Rider on the way",
  tToDrop: "Parcel on the way",
  tHandoff: "Arriving now",
  tNoRider: "No rider yet",
  tRiderCx: "Rider cancelled",
  tDelivered: "Delivered",
  tComplete: "Trip complete",
  tNotDel: "Not delivered",
  tCancelled: "Order cancelled",
  /* finding */
  finding: "Finding riders near you…",
  left: "left",
  seen0: "No riders nearby yet",
  offersHere: "Offers show here as riders reply.",
  yourPrice: "YOUR PRICE",
  cash: "Cash to your rider",
  plus: "+ $0.50",
  cancelReq: "Cancel request",
  cancelReqQ: "Stop looking for a rider? Nothing to pay.",
  keepLooking: "Keep looking",
  yesCancel: "Yes, cancel",
  noOnline: "No riders are online near you right now.",
  noOnlineHint: "Most riders are online 7–9am and 5–7pm. We'll keep looking until the timer ends.",
  notify: "Notify me when a rider's online",
  /* offers */
  bestMatch: "Best match",
  choose: "Choose",
  trips: "trips",
  eta: "ETA",
  min: "min",
  newRider: "New",
  bestWhy: "Best match weighs price, how close the rider is, and rating.",
  /* tracking */
  stMatched: "Matched",
  stPicked: "Picked up",
  stOnWay: "On the way",
  stDelivered: "Delivered",
  verified: "Verified",
  call: "Call",
  whatsapp: "WhatsApp",
  bike: "Bike",
  code: "DELIVERY CODE",
  codeHelp: "Give this code to the recipient. The rider enters it at hand-off.",
  codeHand: "The recipient tells the rider this code. Only then is your parcel handed over.",
  shareCode: "Share code",
  gmaps: "Follow route in Google Maps",
  gmapsSub: "The same route your rider is using",
  cancelFree: "Cancel order · free until pickup",
  cancelOrder: "Cancel order",
  photo: "Pickup photo",
  view: "View",
  gpsPaused: "Your rider's location hasn't updated — call them to check in.",
  codeOffline: "Your code works without data.",
  /* cancel */
  cancelQ: "Cancel this order?",
  reason: "Reason (optional)",
  r1: "Sending it another way",
  r2: "Rider is too far",
  r3: "Changed my mind",
  r4: "Other",
  keep: "Keep order",
  cancelYes: "Cancel order",
  cancelAnyway: "Cancel anyway",
  /* help */
  help: "Help",
  helpT: "Get help",
  helpSub: "Your trip keeps running while you're here.",
  emergencySub: "Police, ambulance or fire",
  support: "Call LyniaGo support",
  supportSub: "We answer 7am–9pm",
  shareTrip: "Share my trip",
  shareTripSub: "Send a live link to someone you trust",
  report: "Report a problem",
  reportSub: "Wrong item, damage, rider behaviour",
  close: "Close",
  /* retry */
  noTookSub: "Riders nearby usually take a little more for this trip.",
  riderCx: "Your rider had to cancel.",
  riderCxSub: "It happens. Send again and we'll find someone new.",
  suggested: "SUGGESTED PRICE",
  sugNote: "$0.50 more than last time",
  editOrder: "Edit order",
  kept: "Your route, items and phones are kept.",
  /* delivered */
  delivered: "Parcel delivered",
  rl: ["", "Bad", "Poor", "OK", "Good", "Great"] as const,
  tg: ["On time", "Careful with parcel", "Friendly", "Good communication"] as const,
  tn: ["Late", "Parcel damaged", "Rude", "Hard to reach"] as const,
  whatWell: "What went well?",
  whatWrong: "What went wrong?",
  optional: "Optional",
  skip: "Skip",
  submit: "Submit rating",
  undo: "Undo",
  receipt: "Receipt",
  ref: "Ref",
  items: "Items",
  rider: "Rider",
  riderPhone: "Rider phone",
  price: "Agreed price",
  paidCash: "Paid cash to rider",
  masked: "Numbers are hidden now the trip's over.",
  shareReceipt: "Share receipt",
  home: "Back to home",
  sendAgain: "Send again",
  youRated: "You rated",
  getHelp: "Get help with this order",
  /* not delivered / cancelled */
  notDelReason: "REASON FROM YOUR RIDER",
  callRider: "Call rider",
  cxYou: "You cancelled this order",
  cxLynia: "LyniaGo cancelled this order",
  reasonP: "Reason",
  cxLyniaR: "We couldn't confirm the pickup. Call us if this looks wrong.",
  nothingOwed: "Nothing to pay.",
  callSupport: "Call support",
  /* README "Interactions": the v2 toast when "+ $0.50" fails, with its retry */
  priceFail: "Couldn't update the price. Try again.",
  retry: "Try again",
  /* the rider's recorded reason on "Not delivered" — the handoff draws "Recipient didn't answer" */
  undelivered: {
    unreachable: "Recipient didn't answer",
    refused: "Recipient refused the parcel",
    wrong_address: "The address was wrong",
    breakdown: "Bike broke down",
  } as Record<string, string>,
  undeliveredOther: "Delivery not completed",
} as const;

const A = ORDER_COPY;

/** "$3.36" — two decimals, no currency code (cash, USD). */
export const usd = (n: number): string => `$${n.toFixed(2)}`;

/** "1:24" — the countdown pill's m:ss. */
export const clock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "09:12" — 24-hour local time. */
export const hhmm = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The dynamic strings of `A`, one formatter each (sample values in the handoff → arguments here). */
export const orderText = {
  /** "3 riders have seen it" — the handoff's `seen`. */
  seen: (n: number): string => `${n} ${n === 1 ? "rider has" : "riders have"} seen it`,
  /** "Price raised to $3.86. Riders have been told." */
  raised: (price: number): string => `Price raised to ${usd(price)}. Riders have been told.`,
  /** "was $3.36" */
  was: (price: number): string => `was ${usd(price)}`,
  /** "3 offers" */
  offers: (n: number): string => `${n} ${n === 1 ? "offer" : "offers"}`,
  /** "+$0.64 over your price. Choose to accept $4.00." */
  over: (diff: number, price: number): string => `+${usd(diff)} over your price. Choose to accept ${usd(price)}.`,
  /** "Tendai was just taken by another customer. Pick another rider." */
  taken: (name: string): string => `${name} was just taken by another customer. Pick another rider.`,
  /** "Arriving at pickup in 6 min" */
  etaPickup: (min: number): string => `Arriving at pickup in ${min} min`,
  /** "Arriving at drop-off in 12 min" */
  etaDrop: (min: number): string => `Arriving at drop-off in ${min} min`,
  /** "Tendai is at the drop-off" */
  atDrop: (name: string): string => `${name} is at the drop-off`,
  /** "Your LyniaGo parcel is on its way with Tendai (bike ABH 4721). Give the rider this code at hand-off: 4182" */
  shareMsg: (name: string, plate: string | null, code: string): string =>
    `Your LyniaGo parcel is on its way with ${name}${plate ? ` (bike ${plate})` : ""}. Give the rider this code at hand-off: ${code}`,
  /** "Taken by Tendai at 09:12" */
  photoSub: (name: string, at: string): string => (at ? `Taken by ${name} at ${at}` : `Taken by ${name}`),
  /** "Last seen 3 min ago" */
  lastSeen: (min: number): string => `Last seen ${min} min ago`,
  /** "Reconnecting… Showing the last update from 09:24." */
  offline: (at: string): string => (at ? `Reconnecting… Showing the last update from ${at}.` : "Reconnecting…"),
  /** "It's free. Tendai hasn't picked up your parcel yet." */
  cancelFreeBody: (name: string): string => `It's free. ${name} hasn't picked up your parcel yet.`,
  /** "Tendai already has your parcel. If you cancel, you arrange getting it back with them directly." */
  cancelWarn: (name: string): string => `${name} already has your parcel. If you cancel, you arrange getting it back with them directly.`,
  /** "Emergency? Call 999" */
  emergency: (num: string): string => `Emergency? Call ${num}`,
  /** "No rider took $3.36 this time." */
  noTook: (price: number): string => `No rider took ${usd(price)} this time.`,
  /** "Send again at $3.86" */
  sendAgainAt: (price: number): string => `Send again at ${usd(price)}`,
  /** "Handed over at 09:31 with code 4182." */
  deliveredSub: (at: string, code: string | null): string =>
    code ? `Handed over at ${at} with code ${code}.` : `Handed over at ${at}.`,
  /** "How was Tendai?" */
  rateQ: (name: string): string => `How was ${name}?`,
  /** "Thanks — you rated Tendai 4 stars." */
  rated: (name: string, stars: number): string => `Thanks — you rated ${name} ${stars} ${stars === 1 ? "star" : "stars"}.`,
  /** "Undo · 0:09" */
  undo: (secs: number): string => `${A.undo} · 0:${String(Math.max(0, secs)).padStart(2, "0")}`,
  /** "You rated Tendai" */
  youRated: (name: string): string => `${A.youRated} ${name}`,
  /** "Delivered Tue 30 Sep, 09:31" */
  deliveredOn: (iso: string | null | undefined): string => {
    if (!iso) return A.delivered;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return A.delivered;
    return `Delivered ${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${hhmm(iso)}`;
  },
  /** "Tendai couldn't deliver your parcel" */
  notDel: (name: string): string => `${name} couldn't deliver your parcel`,
  /** "The parcel is still with Tendai. Call to agree how to get it back, or try the drop-off again." */
  notDelBody: (name: string): string => `The parcel is still with ${name}. Call to agree how to get it back, or try the drop-off again.`,
  /** "Tendai cancelled this order" */
  cxRider: (name: string): string => `${name} cancelled this order`,
  /** "Ref 8F3A-91C2" */
  ref: (orderId: string): string => {
    const hex = orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
    return `${A.ref} ${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
  },
  /** "Tendai M. · ABH 4721" */
  riderLine: (name: string, plate: string | null): string => (plate ? `${name} · ${plate}` : name),
  /** "4.8 · 132 trips" / "New · 3 trips" */
  rating: (avg: number | null, trips: number): string =>
    avg != null && avg > 0 ? `${avg.toFixed(1)} · ${trips} ${A.trips}` : `${A.newRider} · ${trips} ${A.trips}`,
  /** "Recipient didn't answer · 3 tries" */
  undeliveredReason: (reason: string | null | undefined, tries: number | null | undefined): string => {
    const r = (reason && A.undelivered[reason]) || A.undeliveredOther;
    return tries != null && tries > 0 ? `${r} · ${tries} ${tries === 1 ? "try" : "tries"}` : r;
  },
  /** The "Share my trip" message (the share sheet's text — the trip has no public live link yet). */
  shareTrip: (pickup: string, dropoff: string, rider: string | null, plate: string | null): string =>
    `I'm sending a parcel with LyniaGo from ${pickup} to ${dropoff}${rider ? `. My rider is ${rider}${plate ? ` (bike ${plate})` : ""}` : ""}.`,
  /** The "Share receipt" text. */
  receiptText: (r: { ref: string; pickup: string; dropoff: string; items: string; rider: string | null; price: number }): string =>
    [
      `LyniaGo ${A.receipt} · ${r.ref}`,
      `${r.pickup} → ${r.dropoff}`,
      r.items ? `${A.items}: ${r.items}` : null,
      r.rider ? `${A.rider}: ${r.rider}` : null,
      `${A.price}: ${usd(r.price)} · ${A.paidCash}`,
    ]
      .filter(Boolean)
      .join("\n"),
  /** "ETA 6 min" */
  eta: (min: number): string => `${A.eta} ${min} ${A.min}`,
} as const;

/** "Tendai M." — first name + last initial, the handoff's rider label. */
export function riderShortName(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f) return A.rider;
  return l ? `${f} ${l.charAt(0).toUpperCase()}.` : f;
}

/** "TM" — avatar initials. */
export function initials(first: string | null | undefined, last: string | null | undefined): string {
  return `${(first ?? "").trim().charAt(0)}${(last ?? "").trim().charAt(0)}`.toUpperCase() || "•";
}

/** "+263 7• ••• ••80" — the masked rider phone after the trip ends. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return "+263 7• ••• ••••";
  const tail = digits.slice(-2);
  return `+263 7• ••• ••${tail}`;
}
