/* After Send v2 — shared parts. Builds on sc2-kit.jsx (Btn, Notice, MapBox, MapPin, Dot, Sq, Status, lbl). Tokens only. v2 changes marked "v2". */
(function addIcons() {
  const L = window.lucide && window.lucide.icons; if (!L) return;
  Object.assign(L, {
    MessageCircle: [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
    ShieldCheck: [["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { d: "m9 12 2 2 4-4" }]],
    Share2: [["circle", { cx: 18, cy: 5, r: 3 }], ["circle", { cx: 6, cy: 12, r: 3 }], ["circle", { cx: 18, cy: 19, r: 3 }], ["line", { x1: 8.59, y1: 13.51, x2: 15.42, y2: 17.49 }], ["line", { x1: 15.41, y1: 6.51, x2: 8.59, y2: 10.49 }]],
    Camera: [["path", { d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" }], ["circle", { cx: 12, cy: 13, r: 3 }]],
    LifeBuoy: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "m4.93 4.93 4.24 4.24" }], ["path", { d: "m14.83 9.17 4.24-4.24" }], ["path", { d: "m14.83 14.83 4.24 4.24" }], ["path", { d: "m9.17 14.83-4.24 4.24" }], ["circle", { cx: 12, cy: 12, r: 4 }]],
    Undo2: [["path", { d: "M9 14 4 9l5-5" }], ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" }]],
    X: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
    Image: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ["circle", { cx: 9, cy: 9, r: 2 }], ["path", { d: "m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" }]],
    Copy: [["rect", { x: 8, y: 8, width: 14, height: 14, rx: 2 }], ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]],
    MessageSquare: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
    Send: [["path", { d: "m22 2-7 20-4-9-9-4Z" }], ["path", { d: "M22 2 11 13" }]],
    Home: [["path", { d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }], ["path", { d: "M9 22V12h6v10" }]],
  });
})();

const A = {
  back: "Back",
  /* titles per stage */
  tFinding: "Finding a rider", tNoOnline: "No riders online", tChoose: "Choose a rider", tOnWay: "Rider on the way",
  tToDrop: "Parcel on the way", tHandoff: "Arriving now", tNoRider: "No rider yet", tRiderCx: "Rider cancelled",
  tDelivered: "Delivered", tComplete: "Trip complete", tNotDel: "Not delivered", tCancelled: "Order cancelled",
  /* finding */
  finding: "Finding riders near you…", left: "left", seen: "3 riders have seen it", seen0: "No riders nearby yet",
  offersHere: "Offers show here as riders reply.",
  yourPrice: "YOUR PRICE", cash: "Cash to your rider", plus: "+ $0.50",
  raised: "Price raised to $3.86. Riders have been told.", was: "was $3.36",
  cancelReq: "Cancel request", cancelReqQ: "Stop looking for a rider? Nothing to pay.", keepLooking: "Keep looking", yesCancel: "Yes, cancel",
  noOnline: "No riders are online near you right now.",
  noOnlineHint: "Most riders are online 7–9am and 5–7pm. We'll keep looking until the timer ends.",
  notify: "Notify me when a rider's online",
  /* offers */
  offers: "3 offers", offers2: "2 offers", bestMatch: "Best match", choose: "Choose", trips: "trips", eta: "ETA", min: "min", newRider: "New",
  over: "+$0.64 over your price. Choose to accept $4.00.",
  bestWhy: "Best match weighs price, how close the rider is, and rating.",
  taken: "Farai was just taken by another customer. Pick another rider.",
  /* tracking */
  etaPickup: "Arriving at pickup in 6 min", etaDrop: "Arriving at drop-off in 12 min", atDrop: "Tendai is at the drop-off",
  stMatched: "Matched", stPicked: "Picked up", stOnWay: "On the way", stDelivered: "Delivered",
  verified: "Verified", call: "Call", whatsapp: "WhatsApp", bike: "Bike",
  code: "DELIVERY CODE", codeHelp: "Give this code to the recipient. The rider enters it at hand-off.",
  codeHand: "The recipient tells the rider this code. Only then is your parcel handed over.",
  shareCode: "Share code",
  shareMsg: "Your LyniaGo parcel is on its way with Tendai (bike ABH 4721). Give the rider this code at hand-off: 418290",
  codeIssuing: "Getting your code…",
  gmaps: "Follow route in Google Maps", gmapsSub: "The same route your rider is using",
  cancelFree: "Cancel order · free until pickup", cancelOrder: "Cancel order",
  photo: "Pickup photo", photoSub: "Taken by Tendai at 09:12", view: "View",
  gpsPaused: "Your rider's location hasn't updated — call them to check in.", lastSeen: "Last seen 3 min ago",
  offline: "Reconnecting… Showing the last update from 09:24.", codeOffline: "Your code works without data.",
  /* cancel */
  cancelQ: "Cancel this order?", cancelFreeBody: "It's free. Tendai hasn't picked up your parcel yet.",
  reason: "Reason (optional)", r1: "Sending it another way", r2: "Rider is too far", r3: "Changed my mind", r4: "Other",
  keep: "Keep order", cancelYes: "Cancel order",
  cancelWarn: "Tendai already has your parcel. If you cancel, you arrange getting it back with them directly.",
  cancelAnyway: "Cancel anyway",
  /* help */
  help: "Help", helpT: "Get help", helpSub: "Your trip keeps running while you're here.",
  emergency: "Emergency? Call 999", emergencySub: "Police, ambulance or fire",
  support: "Call LyniaGo support", supportSub: "We answer 7am–9pm",
  shareTrip: "Share my trip", shareTripSub: "Send trip details to someone you trust",
  report: "Report a problem", reportSub: "Wrong item, damage, rider behaviour", close: "Close",
  /* retry */
  noTook: "No rider took $3.36 this time.", noTookSub: "Riders nearby usually take a little more for this trip.",
  riderCx: "Tendai had to cancel.", riderCxSub: "We're already asking other riders at $3.36.",
  suggested: "SUGGESTED PRICE", sugNote: "$0.50 more than last time", sendAgainAt: "Send again at $3.86", editOrder: "Edit order",
  kept: "Your route, items and phones are kept.",
  /* delivered */
  delivered: "Parcel delivered", deliveredSub: "Handed over at 09:31 with code 418290.", rateQ: "How was Tendai?",
  rl1: "Bad", rl2: "Poor", rl3: "OK", rl4: "Good", rl5: "Great",
  tg1: "On time", tg2: "Careful with parcel", tg3: "Friendly", tg4: "Good communication",
  tn1: "Late", tn2: "Parcel damaged", tn3: "Rude", tn4: "Hard to reach",
  whatWell: "What went well?", whatWrong: "What went wrong?", optional: "Optional",
  skip: "Skip", submit: "Submit rating",
  rated: "Thanks — you rated Tendai 4 stars.", undo: "Undo",
  receipt: "Receipt", ref: "Ref", items: "Items", rider: "Rider", riderPhone: "Rider phone", price: "Agreed price", paidCash: "Paid cash to rider",
  masked: "Numbers are hidden now the trip's over.", shareReceipt: "Share receipt",
  home: "Back to home", sendAgain: "Send again", youRated: "You rated Tendai", getHelp: "Get help with this order",
  /* not delivered / cancelled */
  notDel: "Tendai couldn't deliver your parcel", notDelReason: "REASON FROM YOUR RIDER", notDelReasonV: "Recipient didn't answer · 3 tries",
  notDelBody: "The parcel is still with Tendai. Call to agree how to get it back, or try the drop-off again.", callRider: "Call rider",
  cxYou: "You cancelled this order", cxRider: "Tendai cancelled this order", cxLynia: "LyniaGo cancelled this order",
  reasonP: "Reason", cxYouR: "Sending it another way", cxRiderR: "Bike broke down",
  cxLyniaR: "We couldn't confirm the pickup. Call us if this looks wrong.", nothingOwed: "Nothing to pay.",

  /* ───── v2 additions ───── */
  grabMore: "Show more", grabLess: "Show less",
  /* 2.1–2.4 loading & errors */
  loading: "Opening your order…",
  loadFail: "Couldn't open your order", loadFailSub: "Check your data connection and try again.", tryAgain: "Try again",
  notFound: "We can't find this order", notFoundSub: "It may be on another account, or the link is old.",
  savedCopy: "Reconnecting… Showing your order as of 09:24.", savedAt: "Last update 09:24",
  /* 2.5–2.11 finding / offers */
  raiseFail: "Couldn't update the price. Try again.",
  over2: "+$0.14 over your price. Choose to accept $4.00.",
  notifyOn: "We'll tell you when a rider's online.",
  notifyFail: "Reminders aren't working right now. We'll keep looking until the timer ends.",
  choosing: "Confirming with Farai…", choosingSlow: "Still confirming with Farai. This can take a few seconds on slow data.",
  timeUp: "Time's up for new offers. You can still choose from these.", chooseIn: "Choose in",
  offers1: "1 offer", yourPriceTag: "Your price",
  /* 2.12–2.19 tracking */
  noFix: "Tendai is heading to pickup", noFixSub: "Live location and ETA show once Tendai's phone sends it.",
  noPhone: "Call and WhatsApp work once Tendai's number comes through.",
  photoBy: "Taken by Tendai at 09:12 · Eastgate Mall, CBD",
  reportT: "Report a problem", reportSub2: "Your trip keeps running. We'll reply by phone.",
  reportType: "What happened?", rp1: "Wrong item", rp2: "Damaged", rp3: "Rider behaviour", rp4: "Payment", rp5: "Other",
  tellMore: "Tell us more", tellMorePh: "What happened, and when?", sendTeam: "Send to our team",
  reportDone: "Thanks — our team will look into it", reportDoneSub: "We'll call you if we need more details. Your trip keeps running.",
  sosSent: "Our safety team has been told. They'll call you shortly.", sosAgain: "Call 999 again",
  shareTripMsg: "I'm sending a parcel with LyniaGo from Eastgate Mall, CBD to 14 Glenara Ave, Avenues. My rider is Tendai M. (bike ABH 4721). Order ref 8F3A-91C2.",
  shareWith: "Share with", copyText: "Copy", sms: "Messages",
  /* 2.20–2.23 retry / cancel */
  stillFinding: "Still finding a rider", raiseTo: "Raise to $3.86", fasterAt: "Riders may reply faster at $3.86.",
  sendFail: "Couldn't send. Check your data and try again.",
  cancelFail: "Couldn't cancel. Your order is still active.",
  /* 2.24–2.28 delivered / completed */
  rateFail: "Couldn't save your rating. Try again.",
  rateLater: "Rate Tendai", rateLaterSub: "Tap a star. You can rate for 7 days.",
  noTime: "Not recorded",
  /* 2.29–2.31 not delivered / cancelled */
  nr1: "Recipient didn't answer", nr2: "Recipient refused the parcel", nr3: "The address was wrong", nr4: "Bike broke down",
  tries1: "1 try", triesN: "tries",
  nb1: "The parcel is still with Tendai. Call to agree how to get it back, or try the drop-off again.",
  nb2: "The parcel is still with Tendai. Call to agree how to get it back.",
  nb3: "The parcel is still with Tendai. Call to give the right address, or agree how to get it back.",
  nb4: "The parcel is still with Tendai. Call to agree how to get it to you.",
  cxLyniaGeneric: "We had to stop this order. Call us if you have questions.",
  cxLyniaSpecific: "The rider reported the pickup was closed.",
  /* 2.33 Home live-order bar */
  barFinding: "Finding a rider · 1:24 left", barChoose: "3 offers · Choose a rider", barOnWay: "Rider on the way · 6 min",
  barToDrop: "Parcel on the way · 12 min", barArriving: "Rider at the drop-off · Code 418290", barRate: "Delivered · Rate Tendai",
  /* 2.34 push notifications [title, body] */
  pOffer1: "New offer: $3.00", pOffer1B: "Tendai M. can pick up in 6 min. Choose before the timer ends.",
  pOfferN: "3 offers for your parcel", pOfferNB: "Choose a rider before the timer ends.",
  pMatched: "Tendai is on the way to pickup", pMatchedB: "Arriving in about 6 min. Open to see your delivery code.",
  pPicked: "Tendai has your parcel", pPickedB: "On the way to 14 Glenara Ave. About 12 min.",
  pArriving: "Tendai is at the drop-off", pArrivingB: "Have your delivery code ready.",
  pDelivered: "Parcel delivered", pDeliveredB: "Handed over at 09:31. Tap to rate Tendai.",
  pNotDel: "Tendai couldn't deliver your parcel", pNotDelB: "Recipient didn't answer. Call Tendai to sort it out.",
  pRiderCx: "Your rider cancelled", pRiderCxB: "We're asking other riders at $3.36.",
  pLyniaCx: "Your order was cancelled", pLyniaCxB: "Open to see why. Nothing to pay.",
  pNoMatch: "No rider took $3.36", pNoMatchB: "Send again at $3.86 in one tap.",
};
const RIDERS = {
  t: { n: "Tendai M.", i: "TM", r: "4.8", trips: 132, eta: 6, p: "$3.00" },
  k: { n: "Kudzai N.", i: "KN", r: "4.9", trips: 88, eta: 9, p: "$4.00", over: true },
  f: { n: "Farai R.", i: "FR", r: null, trips: 3, eta: 5, p: "$3.36", same: true },
};

function AIc({ n, s = 18, c = "currentColor", fill = "none", sw = 2 }) {
  const node = (window.lucide && window.lucide.icons[n]) || [];
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>{node.map(([t, a], i) => React.createElement(t, { ...a, key: i }))}</svg>;
}

function AFrame({ W, H, children }) {
  return <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: "var(--bg)", borderRadius: 18, boxShadow: "0 0 0 1px var(--line), 0 16px 40px rgba(20,24,27,.14)", fontFamily: "var(--font-sans)", color: "var(--ink)", flex: "none" }}>{children}</div>;
}

function ASpin({ c = "#fff", s = 18 }) {
  return <span className="as-spin" style={{ width: s, height: s, borderColor: c, borderTopColor: "transparent" }}></span>;
}

/* v2 · font-scale preview: multiplies every px font-size / line-height in the subtree (like Android sp), and lets text rows grow. */
function FontScale({ k = 1, children }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    if (k === 1 || !ref.current) return;
    ref.current.querySelectorAll("*").forEach(el => {
      if (el.dataset.fsDone || el.namespaceURI.includes("svg")) return; el.dataset.fsDone = 1;
      const st = el.style, cap = el.closest("[data-fsmax]"), kk = cap ? Math.min(k, +cap.dataset.fsmax) : k;
      if (st.fontSize && st.fontSize.endsWith("px")) st.fontSize = parseFloat(st.fontSize) * kk + "px";
      if (st.lineHeight && st.lineHeight.endsWith("px")) st.lineHeight = parseFloat(st.lineHeight) * kk + "px";
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
      if (hasText && st.height && parseFloat(st.height) <= 60) { st.minHeight = st.height; st.height = "auto"; }
      if (hasText && st.whiteSpace === "nowrap" && !el.dataset.keep) st.whiteSpace = "normal";
    });
  }, [k]);
  return <div ref={ref} style={{ display: "contents" }}>{children}</div>;
}

/* Send-flow header, no step bar. Right slot: Help (live trips). v2: title optional (2.1–2.3). */
function AHeader({ title, help }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 20, background: "var(--bg)" }}>
    <Status />
    <div style={{ height: 52, display: "grid", gridTemplateColumns: "minmax(max-content,1fr) minmax(0,auto) minmax(max-content,1fr)", columnGap: 6, alignItems: "center", padding: "0 8px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="ChevronDown" s={22} c="var(--accent-text)" rot={90} />{A.back}</span>
      <span data-keep="1" style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, textAlign: "center" }}>{title}</span>
      <span style={{ display: "flex", justifyContent: "flex-end" }}>{help ? <span style={{ height: 44, display: "flex", alignItems: "center" }}><span style={{ height: 34, display: "flex", alignItems: "center", gap: 5, padding: "0 10px", borderRadius: "var(--radius-pill)", border: "1.5px solid var(--danger)", fontSize: 13, fontWeight: 700, color: "var(--danger)" }}><AIc n="LifeBuoy" s={15} c="var(--danger)" />{A.help}</span></span> : null}</span>
    </div>
  </div>;
}
const HDR = 77;

const bez = (a, b, t, W, h) => {
  const P = [[a[0] * W, a[1] * h], [a[0] * W + (b[0] - a[0]) * W * .1, a[1] * h + (b[1] - a[1]) * h * .7], [b[0] * W - (b[0] - a[0]) * W * .6, b[1] * h - (b[1] - a[1]) * h * .05], [b[0] * W, b[1] * h]];
  const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]);
};
function RiderMarker({ x, y, paused, label }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-17px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, zIndex: 6 }}>
    <span style={{ width: 34, height: 34, borderRadius: "50%", background: paused ? "var(--muted)" : "var(--ink)", border: "3px solid #fff", boxShadow: "var(--shadow-menu)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", opacity: paused ? .85 : 1 }}><AIc n="Bike" s={17} c="#fff" /></span>
    <span style={{ background: paused ? "var(--bg)" : "var(--ink)", color: paused ? "var(--muted)" : "#fff", borderRadius: "var(--radius-pill)", padding: "2px 8px", fontSize: 12, fontWeight: 600, boxShadow: "var(--shadow-card)", whiteSpace: "nowrap", border: paused ? "1px dashed var(--muted)" : "none" }}>{label}</span>
  </div>;
}
/* Full-bleed map behind the sheet. rider: {t} on route, or {at:[x,y]} off route heading to pickup */
function AMap({ W, sheetTop, rider, rings, paused, dim, a = [.26, .26], b = [.76, .58] }) {
  const h = sheetTop - HDR + 18;
  let rm = null, path = null;
  if (rider) {
    const [x, y] = rider.at ? [rider.at[0] * W, rider.at[1] * h] : bez(a, b, rider.t, W, h);
    rm = <RiderMarker x={x} y={y} paused={paused} label={paused ? A.lastSeen : "Tendai"} />;
    if (rider.at) path = <svg width={W} height={h} style={{ position: "absolute", inset: 0, zIndex: 2 }}><path d={`M${x} ${y} Q ${x + 10} ${a[1] * h + 10}, ${a[0] * W} ${a[1] * h}`} fill="none" stroke="var(--ink)" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" /></svg>;
  }
  return <div style={{ position: "absolute", left: 0, right: 0, top: HDR, height: h, overflow: "hidden" }}>
    <MapBox W={W} H={h} a={a} b={b} route>
      {rings ? <><span className="as-ring" style={{ left: a[0] * W, top: a[1] * h }}></span><span className="as-ring as-ring2" style={{ left: a[0] * W, top: a[1] * h }}></span></> : null}
      {path}{rm}
    </MapBox>
    {dim ? <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.45)" }}></div> : null}
  </div>;
}

/* v2 · Grabber: visible bar 36×4 in a 28 px row; tap/drag hit area 120×44 = the row + 16 px above the sheet edge. */
const GRAB = 28;
function Grabber({ showHit }) {
  return <div style={{ position: "relative", height: GRAB, display: "flex", justifyContent: "center", alignItems: "center" }}>
    <span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }}></span>
    {showHit ? <span style={{ position: "absolute", left: "50%", top: -16, width: 120, height: 44, marginLeft: -60, border: "1.5px dashed var(--danger)", borderRadius: 8, boxSizing: "border-box" }}></span> : null}
  </div>;
}
function Sheet({ top, ctaH = 0, children, pad = "0 16px 16px", showHit }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, bottom: 0, background: "var(--bg)", borderRadius: "16px 16px 0 0", boxShadow: "0 -2px 16px rgba(20,24,27,.10)", zIndex: 10 }}>
    <Grabber showHit={showHit} />
    <div style={{ position: "absolute", left: 0, right: 0, top: GRAB, bottom: ctaH, overflow: "hidden" }}><div style={{ padding: pad, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div></div>
  </div>;
}
function Bar({ hint, row, children }) {
  return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", padding: "10px 16px 12px", boxShadow: "var(--shadow-sheet)", zIndex: 25, display: "flex", flexDirection: "column", gap: 8 }}>
    {hint ? <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: "18px" }}>{hint}</div> : null}
    {row ? <div style={{ display: "flex", gap: 8 }}>{children}</div> : children}
  </div>;
}
const barH = (n = 1, hint) => 22 + n * 52 + (n - 1) * 8 + (hint ? 26 : 0);

/* v2: loading = spinner replaces the icon, label stays; disabled = --line fill / --muted text. */
function SmBtn({ label, icon, kind = "ghost", flex, danger, loading, disabled }) {
  let st = { ghost: ["var(--bg)", "var(--accent-text)", "1.5px solid var(--line)"], fill: ["var(--accent)", "#fff", "none"], white: ["var(--bg)", "var(--accent-text)", "none"] }[kind];
  if (disabled) st = [kind === "fill" ? "var(--line)" : st[0], "var(--muted)", st[2]];
  const fg = danger && !disabled ? "var(--danger)" : st[1];
  return <span data-keep="1" style={{ flex, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 14px", borderRadius: "var(--radius-pill)", background: st[0], color: fg, border: st[2], fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", boxSizing: "border-box" }} className="lynia-tabular">{loading ? <ASpin c={fg} s={16} /> : icon ? <AIc n={icon} s={16} c={fg} /> : null}{label}</span>;
}
function GBtn({ label, icon, ghost, danger, loading, disabled }) {
  const fg = disabled ? "var(--muted)" : danger ? "var(--danger)" : ghost ? "var(--accent-text)" : "#fff";
  const bg = ghost ? "var(--bg)" : disabled ? "var(--line)" : "var(--accent)";
  return <div data-keep="1" style={{ flex: "1 1 0", height: 52, minHeight: 52, borderRadius: "var(--radius-pill)", background: bg, color: fg, border: ghost ? "1.5px solid var(--line)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", textAlign: "center" }}>{loading ? <ASpin c={fg} /> : icon ? <AIc n={icon} s={18} c={fg} /> : null}{label}</div>;
}
const H2 = ({ children, style }) => <div style={{ fontSize: 18, fontWeight: 700, lineHeight: "24px", textWrap: "pretty", ...style }}>{children}</div>;
const Muted = ({ children, s = 13, style }) => <div style={{ fontSize: s, lineHeight: s > 13 ? "20px" : "18px", color: "var(--muted)", textWrap: "pretty", ...style }}>{children}</div>;

function Countdown({ t, warn }) {
  return <span style={{ height: 28, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", borderRadius: "var(--radius-pill)", background: "var(--surface)", fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: "none" }} className="lynia-tabular"><AIc n="Timer" s={14} c="var(--muted)" />{t} {A.left}</span>;
}
const Progress = ({ pct }) => <div style={{ height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: "var(--accent)" }}></div></div>;

function Avatar({ i, photo, s = 44 }) {
  if (photo) return <span style={{ width: s, height: s, borderRadius: "50%", flex: "none", background: "repeating-linear-gradient(45deg, var(--surface) 0 4px, var(--line) 4px 5px)", border: "1px solid var(--line)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n="User" s={s * .45} c="var(--muted)" /></span>;
  return <span style={{ width: s, height: s, borderRadius: "50%", flex: "none", background: "var(--accent-wash)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: s * .34, fontWeight: 700 }}>{i}</span>;
}
const Verified = () => <span style={{ height: 20, display: "inline-flex", alignItems: "center", gap: 3, padding: "0 7px 0 5px", borderRadius: "var(--radius-pill)", background: "var(--accent-wash)", color: "var(--accent-text)", fontSize: 11, fontWeight: 700, flex: "none" }}><AIc n="ShieldCheck" s={13} c="var(--accent-text)" />{A.verified}</span>;
const Plate = ({ none }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{A.bike}{none ? null : <span style={{ border: "1.5px solid var(--ink)", borderRadius: 4, padding: "0 6px", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "var(--ink)", lineHeight: "18px" }}>ABH 4721</span>}</span>;
const Rating = ({ r, trips }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><AIc n="Star" s={13} c="var(--ink)" fill="var(--ink)" />{r ? `${r} · ${trips} ${A.trips}` : `${A.newRider} · ${trips} ${A.trips}`}</span>;

function StepTrack({ cur }) {
  const st = [A.stMatched, A.stPicked, A.stOnWay, A.stDelivered];
  return <div style={{ display: "flex" }}>{st.map((l, i) => {
    const done = i < cur, now = i === cur;
    return <div key={l} style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
      {i > 0 ? <span style={{ position: "absolute", top: 8, left: 0, right: "50%", height: 3, background: i <= cur ? "var(--accent)" : "var(--line)" }}></span> : null}
      {i < 3 ? <span style={{ position: "absolute", top: 8, left: "50%", right: 0, height: 3, background: i < cur ? "var(--accent)" : "var(--line)" }}></span> : null}
      <span style={{ position: "relative", width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, boxSizing: "border-box", background: done || now ? "var(--accent-text)" : "var(--surface)", color: done || now ? "#fff" : "var(--muted)", border: done || now ? "none" : "1px solid var(--line)", boxShadow: now ? "0 0 0 4px var(--accent-wash)" : "none" }}>{done ? <AIc n="Check" s={12} c="#fff" sw={3} /> : i + 1}</span>
      <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: now ? 700 : 600, color: now ? "var(--ink)" : done ? "var(--accent-text)" : "var(--muted)", whiteSpace: "nowrap", textAlign: "center", padding: "0 3px" }}>{l}</span>
    </div>;
  })}</div>;
}

/* v2 variants (2.13, 2.15): plate=false → "Bike" only; verified=false → no tag; photo=false → initials; name wraps, never truncates; noPhone → disabled Call/WhatsApp + reason line. */
function RiderCard({ masked, buttons = true, photo = true, plate = true, verified = true, name = "Tendai M.", i = "TM", noPhone }) {
  return <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar i={i} photo={photo} s={48} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontSize: 16, fontWeight: 700, lineHeight: "21px", overflowWrap: "anywhere" }}>{name}</span>{verified ? <Verified /> : null}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px 10px", flexWrap: "wrap", fontSize: 13, color: "var(--muted)" }}><Rating r="4.8" trips={132} /><Plate none={!plate} /></div>
        {masked ? <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">+263 7• ••• ••80</div> : null}
      </div>
    </div>
    {buttons && !masked ? <div style={{ display: "flex", gap: 8 }}><SmBtn flex={1} label={A.call} icon="Phone" disabled={noPhone} /><SmBtn flex={1} label={A.whatsapp} icon="MessageCircle" disabled={noPhone} /></div> : null}
    {noPhone ? <div style={{ fontSize: 12, lineHeight: "16px", color: "var(--muted)", marginTop: -2 }}>{A.noPhone}</div> : null}
  </div>;
}

/* v2 · 6-digit code, shown as 3+3 groups ("418 290"). The value copied/shared has no space. */
const CODE = "418290";
function CodeDigits({ size, gap, fsmax = 1 }) {
  return <span data-fsmax={fsmax} style={{ display: "inline-flex", gap, fontSize: size, fontWeight: 800, lineHeight: 1.15 + "", letterSpacing: ".04em", whiteSpace: "nowrap" }} className="lynia-tabular" data-keep="1"><span>{CODE.slice(0, 3)}</span><span>{CODE.slice(3)}</span></span>;
}
const SkelDigits = ({ h = 28 }) => <span style={{ display: "inline-flex", gap: 10 }}>{[0, 1].map(g => <span key={g} style={{ display: "inline-flex", gap: 4 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: h * .62, height: h, borderRadius: 6, background: "var(--bg)", opacity: .8 }}></span>)}</span>)}</span>;
/* Code card (6, 7, 9, 19). One row when digits + Share code fit (they do at 320 and 360 dp, scale 1.0); when the row overflows (font scale > 1) Share code drops under the digits, full width. */
function CodeCard({ offline, W = 360, stack, issuing }) {
  const st = !!stack; /* in the build: stack when the measured row overflows */
  const share = <SmBtn kind="white" label={A.shareCode} icon="Share2" flex={st ? 1 : undefined} disabled={issuing} />;
  return <div style={{ background: "var(--accent-wash)", borderRadius: "var(--radius-input)", padding: "12px 12px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><div style={{ ...lbl, color: "var(--accent-text)" }}>{A.code}</div>{issuing ? <SkelDigits /> : <CodeDigits size={28} gap={10} fsmax={1.15} />}</div>
      {st ? null : share}
    </div>
    {st ? <div style={{ display: "flex" }}>{share}</div> : null}
    <div style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink)", textWrap: "pretty" }}>{issuing ? A.codeIssuing : (offline ? A.codeOffline + " " : "") + A.codeHelp}</div>
  </div>;
}
/* Code big (8). No boxes: one white panel, digits 56/800 (48 under 340 dp), 3+3 with a 20 px gap — the biggest thing on the sheet. */
function CodeBig({ W }) {
  const sm = W < 340;
  return <div style={{ background: "var(--accent-wash)", borderRadius: 16, padding: "14px 14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
    <div style={{ ...lbl, color: "var(--accent-text)" }}>{A.code}</div>
    <div style={{ alignSelf: "stretch", background: "var(--bg)", border: "2px solid var(--accent-text)", borderRadius: 12, padding: "8px 0", display: "flex", justifyContent: "center" }}><CodeDigits size={sm ? 48 : 56} gap={sm ? 16 : 20} /></div>
    <div style={{ fontSize: 14, lineHeight: "20px", textAlign: "center", textWrap: "pretty" }}>{A.codeHand}</div>
  </div>;
}
function GMapsRow() {
  return <div style={{ minHeight: 56, border: "1px solid var(--line)", borderRadius: "var(--radius-input)", display: "flex", alignItems: "center", gap: 12, padding: "6px 10px 6px 12px" }}>
    <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><AIc n="Navigation" s={16} c="var(--accent-text)" /></span>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{A.gmaps}</div><Muted s={12}>{A.gmapsSub}</Muted></div>
    <AIc n="ChevronRight" s={18} c="var(--muted)" />
  </div>;
}
const TextLink = ({ label, icon, c = "var(--accent-text)", center }) => <span style={{ height: 44, display: "flex", alignItems: "center", justifyContent: center ? "center" : "flex-start", gap: 6, fontSize: 14, fontWeight: 600, color: c }}>{icon ? <AIc n={icon} s={16} c={c} /> : null}{label}</span>;

/* v2: busy = spinner in this card's Choose; off = Choose disabled (another card is busy); slow = confirming line; o.photo / o.same / o.over2 variants. */
function OfferCard({ o, best, busy, off, slow }) {
  return <div style={{ border: best ? "2px solid var(--accent-text)" : "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: best ? 11 : 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg)" }}>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar i={o.i} s={44} photo={o.photo} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {best ? <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: "var(--radius-pill)", padding: "1px 8px", lineHeight: "16px", marginBottom: 2 }}>{A.bestMatch}</span> : null}
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: "20px", overflowWrap: "anywhere" }}>{o.n}</span>
        <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: "18px" }}><Rating r={o.r} trips={o.trips} /></span>
        <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: "18px", display: "flex", alignItems: "center", gap: 4 }}><AIc n="Clock" s={13} c="var(--muted)" />{A.eta} {o.eta} {A.min}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flex: "none" }}>
        <span style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px" }} className="lynia-tabular">{o.p}</span>
        {o.same ? <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--muted)", marginTop: -6 }}>{A.yourPriceTag}</span> : null}
        <SmBtn kind="fill" label={A.choose} loading={busy} disabled={off} />
      </div>
    </div>
    {o.over ? <div style={{ background: "var(--surface)", borderRadius: 8, padding: "6px 10px", fontSize: 12, lineHeight: "16px", fontWeight: 600, color: "var(--ink)" }}>{o.over2 ? A.over2 : A.over}</div> : null}
    {busy ? <div style={{ fontSize: 12, lineHeight: "16px", color: "var(--muted)", textWrap: "pretty" }}>{slow ? A.choosingSlow : A.choosing}</div> : null}
  </div>;
}

function Stars({ n, s = 36 }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
    {[1, 2, 3, 4, 5].map(i => <span key={i} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n="Star" s={s} c={i <= n ? "var(--accent)" : "var(--line)"} fill={i <= n ? "var(--accent)" : "none"} sw={1.6} /></span>)}
    {n ? <span style={{ marginLeft: 6, fontSize: 15, fontWeight: 700, color: "var(--accent-text)" }}>{A["rl" + n]}</span> : null}
  </div>;
}
function Tag({ label, on }) {
  return <span data-keep="1" style={{ height: 44, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: "var(--radius-pill)", border: on ? "1.5px solid var(--accent-text)" : "1px solid var(--line)", background: on ? "var(--accent-wash)" : "var(--bg)", color: on ? "var(--accent-text)" : "var(--ink)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", boxSizing: "border-box" }}>{on ? <AIc n="Check" s={14} c="var(--accent-text)" sw={3} /> : null}{label}</span>;
}
const Tags = ({ list, on = [] }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{list.map((t, i) => <Tag key={t} label={t} on={on.includes(i)} />)}</div>;

function KV({ k, v, strong, icon }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
    <span style={{ fontSize: 13, color: "var(--muted)", flex: "none" }}>{k}</span>
    <span style={{ flex: 1, textAlign: "right", fontSize: strong ? 17 : 13, fontWeight: strong ? 700 : 600, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }} className="lynia-tabular">{icon ? <AIc n={icon} s={15} c="var(--accent-text)" /> : null}{v}</span>
  </div>;
}
/* v2 variants (2.27): items = several lines; long address wraps (never ellipsised); noPickTime → "Not recorded". */
const LONG_ADDR = "Stand 4417, off Seke Rd, behind Chitungwiza Town Centre, Unit L";
function Receipt({ items, longAddr, noPickTime }) {
  const stop = (m, name, t, none) => <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: "18px", fontWeight: 600, padding: "3px 0" }}><span style={{ height: 18, display: "flex", alignItems: "center" }}>{m}</span><span style={{ flex: 1, minWidth: 0, textWrap: "pretty" }}>{name}</span><span style={{ color: "var(--muted)", fontWeight: 400, fontSize: none ? 12 : 13, whiteSpace: "nowrap" }} className="lynia-tabular">{t}</span></div>;
  return <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 14px 12px" }}>
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}><span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{A.receipt}</span><span style={{ fontSize: 12, color: "var(--muted)" }}>{A.ref} 8F3A-91C2</span></div>
    <div style={{ paddingBottom: 6 }}>{stop(<Dot s={10} />, ADDR.a, noPickTime ? A.noTime : "09:12", noPickTime)}{stop(<Sq s={10} />, longAddr ? LONG_ADDR : ADDR.b, "09:31")}</div>
    {items ? <div style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 13, color: "var(--muted)", flex: "none" }}>{A.items}</span><div style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: 600, lineHeight: "20px" }}>{items.map(t => <div key={t}>{t}</div>)}</div></div> : <KV k={A.items} v="Documents envelope × 1" />}
    <KV k={A.rider} v="Tendai M. · ABH 4721" />
    <KV k={A.riderPhone} v="+263 7• ••• ••80" />
    <KV k={A.price} v="$3.36" strong />
    <KV k="" v={A.paidCash} icon="Banknote" />
    <Muted s={12} style={{ margin: "2px 0 10px" }}>{A.masked}</Muted>
    <div style={{ display: "flex" }}><SmBtn flex={1} label={A.shareReceipt} icon="Share2" /></div>
  </div>;
}

function AToast({ text, icon = "CircleAlert", action, actionIcon, bottom }) {
  return <div style={{ position: "absolute", left: 12, right: 12, bottom, zIndex: 35, background: "var(--ink)", color: "#fff", borderRadius: "var(--radius-input)", padding: action ? "6px 6px 6px 14px" : "12px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, lineHeight: "18px", boxShadow: "var(--shadow-menu)" }}>
    <AIc n={icon} s={18} c="#fff" /><span style={{ flex: 1, textWrap: "pretty" }}>{text}</span>
    {action ? <span style={{ height: 44, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 10, background: "var(--accent-wash)", color: "var(--accent-text)", fontWeight: 700, whiteSpace: "nowrap" }} className="lynia-tabular"><AIc n={actionIcon} s={15} c="var(--accent-text)" />{action}</span> : null}
  </div>;
}
const IconDisc = ({ n, tone = "calm", s = 56 }) => <span style={{ width: s, height: s, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: tone === "ok" ? "var(--accent-wash)" : "var(--surface)", border: tone === "danger" ? "1.5px solid var(--danger)" : "none", boxSizing: "border-box" }}><AIc n={n} s={s * .46} c={tone === "danger" ? "var(--danger)" : tone === "ok" ? "var(--accent-text)" : "var(--muted)"} /></span>;
const Skel = () => <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
  <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface)" }}></span>
  <div style={{ flex: 1 }}><div style={{ height: 10, width: "55%", background: "var(--line)", borderRadius: 5, marginBottom: 8 }}></div><div style={{ height: 8, width: "35%", background: "var(--surface)", borderRadius: 4 }}></div></div>
  <span style={{ width: 70, height: 36, borderRadius: 18, background: "var(--surface)" }}></span>
</div>;

Object.assign(window, { ASpin, FontScale, Grabber, GRAB, CODE, CodeDigits, SkelDigits, LONG_ADDR, A, RIDERS, AIc, AFrame, AHeader, HDR, AMap, RiderMarker, Sheet, Bar, barH, SmBtn, GBtn, H2, Muted, Countdown, Progress, Avatar, Verified, Plate, Rating, StepTrack, RiderCard, CodeCard, CodeBig, GMapsRow, TextLink, OfferCard, Stars, Tag, Tags, KV, Receipt, AToast, IconDisc, Skel });
