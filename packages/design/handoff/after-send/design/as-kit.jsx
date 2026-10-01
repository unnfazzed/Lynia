/* After Send — shared parts. Builds on sc2-kit.jsx (Btn, Notice, MapBox, MapPin, Dot, Sq, Status, lbl). Tokens only. */
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
  taken: "Tendai was just taken by another customer. Pick another rider.",
  /* tracking */
  etaPickup: "Arriving at pickup in 6 min", etaDrop: "Arriving at drop-off in 12 min", atDrop: "Tendai is at the drop-off",
  stMatched: "Matched", stPicked: "Picked up", stOnWay: "On the way", stDelivered: "Delivered",
  verified: "Verified", call: "Call", whatsapp: "WhatsApp", bike: "Bike",
  code: "DELIVERY CODE", codeHelp: "Give this code to the recipient. The rider enters it at hand-off.",
  codeHand: "The recipient tells the rider this code. Only then is your parcel handed over.",
  shareCode: "Share code",
  shareMsg: "Your LyniaGo parcel is on its way with Tendai (bike ABH 4721). Give the rider this code at hand-off: 4182",
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
  shareTrip: "Share my trip", shareTripSub: "Send a live link to someone you trust",
  report: "Report a problem", reportSub: "Wrong item, damage, rider behaviour", close: "Close",
  /* retry */
  noTook: "No rider took $3.36 this time.", noTookSub: "Riders nearby usually take a little more for this trip.",
  riderCx: "Your rider had to cancel.", riderCxSub: "It happens. Send again and we'll find someone new.",
  suggested: "SUGGESTED PRICE", sugNote: "$0.50 more than last time", sendAgainAt: "Send again at $3.86", editOrder: "Edit order",
  kept: "Your route, items and phones are kept.",
  /* delivered */
  delivered: "Parcel delivered", deliveredSub: "Handed over at 09:31 with code 4182.", rateQ: "How was Tendai?",
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
};
const RIDERS = {
  t: { n: "Tendai M.", i: "TM", r: "4.8", trips: 132, eta: 6, p: "$3.00" },
  k: { n: "Kudzai N.", i: "KN", r: "4.9", trips: 88, eta: 9, p: "$4.00", over: true },
  f: { n: "Farai R.", i: "FR", r: null, trips: 3, eta: 5, p: "$3.36" },
};

function AIc({ n, s = 18, c = "currentColor", fill = "none", sw = 2 }) {
  const node = (window.lucide && window.lucide.icons[n]) || [];
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>{node.map(([t, a], i) => React.createElement(t, { ...a, key: i }))}</svg>;
}

function AFrame({ W, H, children }) {
  return <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: "var(--bg)", borderRadius: 18, boxShadow: "0 0 0 1px var(--line), 0 16px 40px rgba(20,24,27,.14)", fontFamily: "var(--font-sans)", color: "var(--ink)", flex: "none" }}>{children}</div>;
}

/* Send-flow header, no step bar. Right slot: Help (live trips). */
function AHeader({ title, help }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 20, background: "var(--bg)" }}>
    <Status />
    <div style={{ height: 52, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 8px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="ChevronDown" s={22} c="var(--accent-text)" rot={90} />{A.back}</span>
      <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</span>
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

function Sheet({ top, ctaH = 0, children, pad = "4px 16px 16px" }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, bottom: 0, background: "var(--bg)", borderRadius: "16px 16px 0 0", boxShadow: "0 -2px 16px rgba(20,24,27,.10)", zIndex: 10 }}>
    <div style={{ height: 16, display: "flex", justifyContent: "center", alignItems: "center" }}><span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }}></span></div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 16, bottom: ctaH, overflow: "hidden" }}><div style={{ padding: pad, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div></div>
  </div>;
}
function Bar({ hint, row, children }) {
  return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", padding: "10px 16px 12px", boxShadow: "var(--shadow-sheet)", zIndex: 25, display: "flex", flexDirection: "column", gap: 8 }}>
    {hint ? <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: "18px" }}>{hint}</div> : null}
    {row ? <div style={{ display: "flex", gap: 8 }}>{children}</div> : children}
  </div>;
}
const barH = (n = 1, hint) => 22 + n * 52 + (n - 1) * 8 + (hint ? 26 : 0);

function SmBtn({ label, icon, kind = "ghost", flex, danger }) {
  const st = { ghost: ["var(--bg)", "var(--accent-text)", "1.5px solid var(--line)"], fill: ["var(--accent)", "#fff", "none"], white: ["var(--bg)", "var(--accent-text)", "none"] }[kind];
  const fg = danger ? "var(--danger)" : st[1];
  return <span style={{ flex, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 14px", borderRadius: "var(--radius-pill)", background: st[0], color: fg, border: st[2], fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", boxSizing: "border-box" }}>{icon ? <AIc n={icon} s={16} c={fg} /> : null}{label}</span>;
}
function GBtn({ label, icon, ghost, danger }) {
  const fg = danger ? "var(--danger)" : ghost ? "var(--accent-text)" : "#fff";
  return <div style={{ flex: "1 1 0", height: 52, minHeight: 52, borderRadius: "var(--radius-pill)", background: ghost ? "var(--bg)" : "var(--accent)", color: fg, border: ghost ? "1.5px solid var(--line)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 700, whiteSpace: "nowrap" }}>{icon ? <AIc n={icon} s={18} c={fg} /> : null}{label}</div>;
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
const Plate = () => <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>{A.bike}<span style={{ border: "1.5px solid var(--ink)", borderRadius: 4, padding: "0 6px", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "var(--ink)", lineHeight: "18px" }}>ABH 4721</span></span>;
const Rating = ({ r, trips }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><AIc n="Star" s={13} c="var(--ink)" fill="var(--ink)" />{r ? `${r} · ${trips} ${A.trips}` : `${A.newRider} · ${trips} ${A.trips}`}</span>;

function StepTrack({ cur }) {
  const st = [A.stMatched, A.stPicked, A.stOnWay, A.stDelivered];
  return <div style={{ display: "flex" }}>{st.map((l, i) => {
    const done = i < cur, now = i === cur;
    return <div key={l} style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
      {i > 0 ? <span style={{ position: "absolute", top: 8, left: 0, right: "50%", height: 3, background: i <= cur ? "var(--accent)" : "var(--line)" }}></span> : null}
      {i < 3 ? <span style={{ position: "absolute", top: 8, left: "50%", right: 0, height: 3, background: i < cur ? "var(--accent)" : "var(--line)" }}></span> : null}
      <span style={{ position: "relative", width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, boxSizing: "border-box", background: done || now ? "var(--accent-text)" : "var(--surface)", color: done || now ? "#fff" : "var(--muted)", border: done || now ? "none" : "1px solid var(--line)", boxShadow: now ? "0 0 0 4px var(--accent-wash)" : "none" }}>{done ? <AIc n="Check" s={12} c="#fff" sw={3} /> : i + 1}</span>
      <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: now ? 700 : 600, color: now ? "var(--ink)" : done ? "var(--accent-text)" : "var(--muted)", whiteSpace: "nowrap" }}>{l}</span>
    </div>;
  })}</div>;
}

function RiderCard({ masked, buttons = true, photo = true }) {
  return <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar i="TM" photo={photo} s={48} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontSize: 16, fontWeight: 700 }}>Tendai M.</span><Verified /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--muted)" }}><Rating r="4.8" trips={132} /><Plate /></div>
        {masked ? <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">+263 7• ••• ••80</div> : null}
      </div>
    </div>
    {buttons && !masked ? <div style={{ display: "flex", gap: 8 }}><SmBtn flex={1} label={A.call} icon="Phone" /><SmBtn flex={1} label={A.whatsapp} icon="MessageCircle" /></div> : null}
  </div>;
}

function CodeCard({ offline }) {
  return <div style={{ background: "var(--accent-wash)", borderRadius: "var(--radius-input)", padding: "12px 12px 12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1 }}><div style={{ ...lbl, color: "var(--accent-text)" }}>{A.code}</div><div style={{ fontSize: 30, fontWeight: 800, letterSpacing: ".2em", lineHeight: "36px" }} className="lynia-tabular">4182</div></div>
      <SmBtn kind="white" label={A.shareCode} icon="Share2" />
    </div>
    <div style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink)", textWrap: "pretty" }}>{offline ? A.codeOffline + " " : ""}{A.codeHelp}</div>
  </div>;
}
function CodeBig({ W }) {
  const bw = W < 340 ? 54 : 64;
  return <div style={{ background: "var(--accent-wash)", borderRadius: 16, padding: "14px 14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
    <div style={{ ...lbl, color: "var(--accent-text)" }}>{A.code}</div>
    <div style={{ display: "flex", gap: 8 }}>{"4182".split("").map((d, i) => <span key={i} style={{ width: bw, height: bw + 16, borderRadius: 12, background: "var(--bg)", border: "2px solid var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: W < 340 ? 40 : 48, fontWeight: 800 }} className="lynia-tabular">{d}</span>)}</div>
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

function OfferCard({ o, best, chosen }) {
  return <div style={{ border: best ? "2px solid var(--accent-text)" : "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: best ? 11 : 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg)" }}>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar i={o.i} s={44} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {best ? <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: "var(--radius-pill)", padding: "1px 8px", lineHeight: "16px", marginBottom: 2 }}>{A.bestMatch}</span> : null}
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: "20px" }}>{o.n}</span>
        <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: "18px" }}><Rating r={o.r} trips={o.trips} /></span>
        <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: "18px", display: "flex", alignItems: "center", gap: 4 }}><AIc n="Clock" s={13} c="var(--muted)" />{A.eta} {o.eta} {A.min}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flex: "none" }}>
        <span style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px" }} className="lynia-tabular">{o.p}</span>
        <SmBtn kind="fill" label={A.choose} />
      </div>
    </div>
    {o.over ? <div style={{ background: "var(--surface)", borderRadius: 8, padding: "6px 10px", fontSize: 12, lineHeight: "16px", fontWeight: 600, color: "var(--ink)" }}>{A.over}</div> : null}
  </div>;
}

function Stars({ n, s = 36 }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
    {[1, 2, 3, 4, 5].map(i => <span key={i} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n="Star" s={s} c={i <= n ? "var(--accent)" : "var(--line)"} fill={i <= n ? "var(--accent)" : "none"} sw={1.6} /></span>)}
    {n ? <span style={{ marginLeft: 6, fontSize: 15, fontWeight: 700, color: "var(--accent-text)" }}>{A["rl" + n]}</span> : null}
  </div>;
}
function Tag({ label, on }) {
  return <span style={{ height: 44, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: "var(--radius-pill)", border: on ? "1.5px solid var(--accent-text)" : "1px solid var(--line)", background: on ? "var(--accent-wash)" : "var(--bg)", color: on ? "var(--accent-text)" : "var(--ink)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", boxSizing: "border-box" }}>{on ? <AIc n="Check" s={14} c="var(--accent-text)" sw={3} /> : null}{label}</span>;
}
const Tags = ({ list, on = [] }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{list.map((t, i) => <Tag key={t} label={t} on={on.includes(i)} />)}</div>;

function KV({ k, v, strong, icon }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
    <span style={{ fontSize: 13, color: "var(--muted)", flex: "none" }}>{k}</span>
    <span style={{ flex: 1, textAlign: "right", fontSize: strong ? 17 : 13, fontWeight: strong ? 700 : 600, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }} className="lynia-tabular">{icon ? <AIc n={icon} s={15} c="var(--accent-text)" /> : null}{v}</span>
  </div>;
}
function Receipt() {
  const stop = (m, name, t) => <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, padding: "3px 0" }}>{m}<span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span><span style={{ color: "var(--muted)", fontWeight: 400 }} className="lynia-tabular">{t}</span></div>;
  return <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 14px 12px" }}>
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}><span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{A.receipt}</span><span style={{ fontSize: 12, color: "var(--muted)" }}>{A.ref} 8F3A-91C2</span></div>
    <div style={{ paddingBottom: 6 }}>{stop(<Dot s={10} />, ADDR.a, "09:12")}{stop(<Sq s={10} />, ADDR.b, "09:31")}</div>
    <KV k={A.items} v="Documents envelope × 1" />
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

Object.assign(window, { A, RIDERS, AIc, AFrame, AHeader, HDR, AMap, RiderMarker, Sheet, Bar, barH, SmBtn, GBtn, H2, Muted, Countdown, Progress, Avatar, Verified, Plate, Rating, StepTrack, RiderCard, CodeCard, CodeBig, GMapsRow, TextLink, OfferCard, Stars, Tag, Tags, KV, Receipt, AToast, IconDisc, Skel });
