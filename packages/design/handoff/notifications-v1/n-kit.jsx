/* Notifications v1 — parts + N, every user-facing string. Builds on sc2-kit (Ic, Notice, lbl), as-kit (AFrame, AIc, SmBtn, GBtn, AToast, IconDisc, ASpin, A.back) and rv-kit (RStatus, Lbl, RHDR). Tokens only. */
(function addIcons() {
  const L = window.lucide && window.lucide.icons; if (!L) return;
  const add = {
    BellOff: [["path", { d: "M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" }], ["path", { d: "M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" }], ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" }], ["path", { d: "m2 2 20 20" }]],
    Pill: [["path", { d: "m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" }], ["path", { d: "m8.5 8.5 7 7" }]],
    X: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
  };
  for (const k in add) if (!L[k]) L[k] = add[k];
})();

/* ───── Every user-facing string. Ships verbatim. Names, prices, places and times are sample data. ───── */
const N = {
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
const earlier = (n) => n === 1 ? N.earlier1 : `${n} ${N.earlierN}`;

/* Tone = the icon disc. neutral mint · good ok-green · money sun · warn (needs you) danger ring · danger wash. Gold is never a tone — it's the unread dot only. */
const TONE = {
  neutral: { bg: "var(--accent-wash)", fg: "var(--accent-text)" },
  good: { bg: "var(--cta-fill)", fg: "#fff" },
  money: { bg: "var(--tile-sun)", fg: "var(--sun-ink)" },
  warn: { bg: "var(--bg)", fg: "var(--danger)", bd: "1.5px solid var(--danger)" },
  danger: { bg: "var(--danger-wash)", fg: "var(--danger-ink)" },
  other: { bg: "var(--surface)", fg: "var(--muted)", bd: "1px solid var(--line)" },
};
/* Order rows: the v2 service sticker on its tile tint (same as Order flow v2.1 vdisc). Tone rides on an 18 px mark at the bottom-right; in-progress orders (neutral) carry none. */
const KIND = {
  send: { src: "../../assets/service-icons/v2/send.svg", tint: "var(--tile-mint)" },
  restaurants: { src: "../../assets/service-icons/v2/restaurants.svg", tint: "var(--tile-peach)" },
  shops: { src: "../../assets/service-icons/v2/shops.svg", tint: "var(--tile-lilac)" },
  pharmacy: { src: "../../assets/service-icons/v2/pharmacy.svg", tint: "var(--tile-pharmacy)" },
};
const MARK = { good: ["var(--cta-fill)", "Check"], warn: ["var(--danger)", "!"], danger: ["var(--danger-ink)", "!"] };
function NDisc({ icon, kind, tone = "neutral", unread, s = 40 }) {
  const t = TONE[tone], k = KIND[kind], src = k && ((window.N_STICKERS || {})[kind] || k.src), m = k && MARK[tone];
  return <span style={{ position: "relative", width: s, height: s, flex: "none" }}>
    {k ? <span style={{ width: s, height: s, borderRadius: "50%", background: k.tint, display: "flex", alignItems: "center", justifyContent: "center" }}><img src={src} alt="" style={{ width: s * .72, height: s * .72 }} /></span>
      : <span style={{ width: s, height: s, borderRadius: "50%", background: t.bg, border: t.bd || "none", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n={icon} s={s * .45} c={t.fg} /></span>}
    {m ? <span style={{ position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: "50%", background: m[0], border: "2px solid var(--bg)", boxSizing: "content-box", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>{m[1] === "!" ? "!" : <AIc n={m[1]} s={11} c="#fff" sw={3} />}</span> : null}
    {unread ? <span style={{ position: "absolute", top: -1, right: -1, width: 10, height: 10, borderRadius: "50%", background: "var(--highlight)", border: "2px solid var(--bg)" }}></span> : null}
  </span>;
}

/* Pushed-screen header (AHeader geometry, no Help). */
function NHeader({ title = N.title }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 20, background: "var(--bg)" }}><RStatus />
    <div style={{ height: 52, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 8px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="ChevronDown" s={22} c="var(--accent-text)" rot={90} />{A.back}</span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span><span></span>
    </div></div>;
}
const NCard = ({ children, danger, style }) => <div style={{ background: "var(--bg)", border: danger ? "1px solid var(--danger)" : "1px solid var(--line)", borderRadius: 16, overflow: "hidden", ...style }}>{children}</div>;
const Day = ({ children }) => <Lbl style={{ fontSize: 11, padding: "6px 4px 0" }}>{children}</Lbl>;

/* Collapsed history: one quiet dot per earlier update (max 5), then the count. */
const Beads = ({ n }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{Array.from({ length: Math.min(n, 5) }).map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--illus-idle-mid)" }}></span>)}</span>;

/* Inline timeline — the order screen's step track, quieter: vertical, small dots, time on the right. steps[0] = latest. */
function Timeline({ steps }) {
  return <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>{steps.map(([l, t], i) => {
    const last = i === steps.length - 1, now = i === 0;
    return <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 10, minHeight: 30 }}>
      <span style={{ width: 12, flex: "none", position: "relative", display: "flex", justifyContent: "center" }}>
        {last ? null : <span style={{ position: "absolute", top: 15, bottom: -15, width: 2, background: "var(--line)" }}></span>}
        <span style={{ marginTop: now ? 5 : 6, width: now ? 10 : 8, height: now ? 10 : 8, borderRadius: "50%", background: now ? "var(--accent-text)" : "var(--accent)", boxShadow: now ? "0 0 0 3px var(--accent-wash)" : "none", position: "relative" }}></span>
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "20px", fontWeight: now ? 700 : 400, color: now ? "var(--ink)" : "var(--muted)" }}>{l}</span>
      <span style={{ fontSize: 12, lineHeight: "20px", color: "var(--muted)" }} className="lynia-tabular">{t}</span>
    </div>;
  })}</div>;
}

/* The row. One per order (latest update) or one per account/safety event. */
function NRow({ n, first, open, onToggle, rider }) {
  const steps = n.steps || [], more = steps.length - 1;
  const hasMore = more > 0;
  return <div style={{ display: "flex", gap: 12, padding: hasMore || n.action ? "12px 12px 4px" : 12, borderTop: first ? "none" : "1px solid var(--line)", background: "var(--bg)", cursor: "pointer" }}>
    <NDisc icon={n.icon} kind={n.kind} tone={n.tone} unread={n.unread} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", fontWeight: n.unread ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</span>
        <span style={{ fontSize: 12, color: n.unread ? "var(--ink)" : "var(--muted)", fontWeight: n.unread ? 600 : 400, whiteSpace: "nowrap" }} className="lynia-tabular">{n.time}</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: "18px", marginTop: 2, color: n.unread || n.tone === "danger" ? "var(--ink)" : "var(--muted)", textWrap: "pretty" }}>{n.sub}</div>
      {n.action ? <div style={{ display: "flex", marginTop: 10, marginBottom: hasMore ? 0 : 8 }}><SmBtn kind="fill" label={n.action} /></div> : null}
      {hasMore && !open ? <div onClick={onToggle} style={{ height: 44, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}><Beads n={more} />{earlier(more)}<AIc n="ChevronDown" s={14} c="var(--muted)" /></div> : null}
      {hasMore && open ? <>
        <Timeline steps={steps} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
          <span onClick={onToggle} style={{ height: 44, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}><AIc n="ChevronUp" s={15} c="var(--muted)" />{N.hide}</span>
          <span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}>{rider ? N.openJob : N.openOrder}<AIc n="ChevronRight" s={16} c="var(--accent-text)" /></span>
        </div></> : null}
    </div>
  </div>;
}

/* Swipe: row follows the finger and fades; the wash behind says what letting go does. */
function SwipeRow({ dx = 0, first, children, live, ...h }) {
  const W0 = 360, p = Math.min(Math.abs(dx) / W0, 1);
  return <div style={{ position: "relative", overflow: "hidden", borderTop: first ? "none" : "1px solid var(--line)", touchAction: "pan-y" }} {...h}>
    <div style={{ position: "absolute", inset: 0, background: "var(--danger-wash)", display: "flex", alignItems: "center", justifyContent: dx > 0 ? "flex-start" : "flex-end", padding: "0 20px", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--danger-ink)", opacity: dx ? 1 : 0 }}><AIc n="Trash2" s={18} c="var(--danger-ink)" />{N.remove}</div>
    <div style={{ position: "relative", transform: `translateX(${dx}px)`, opacity: 1 - p * .7, transition: live ? "none" : "transform .22s ease, opacity .22s ease" }}>{children}</div>
  </div>;
}

/* Rider v2 J8 warn row. */
const OffRow = ({ rider }) => <div style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--danger)", borderRadius: 12, padding: "6px 6px 6px 12px", background: "var(--bg)" }}><AIc n="BellOff" s={18} c="var(--danger)" /><span style={{ flex: 1, fontSize: 13, lineHeight: "18px", fontWeight: 600, textWrap: "pretty" }}>{rider ? N.offR : N.offC}</span><SmBtn kind="fill" label={N.turnOn} /></div>;

/* Dual role: the other side, as one quiet row (opens the C4/C5 switch sheet). */
const OtherSide = ({ rider }) => <NCard style={{ background: "var(--surface)" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", minHeight: 56, boxSizing: "border-box" }}>
  <NDisc icon="ArrowLeftRight" tone="other" s={36} />
  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, lineHeight: "20px" }}>{rider ? N.otherC : N.otherR}</div><div style={{ fontSize: 12, lineHeight: "16px", color: "var(--muted)", textWrap: "pretty" }}>{rider ? N.otherCS : N.otherRS}</div></div>
  <AIc n="ChevronRight" s={18} c="var(--muted)" />
</div></NCard>;

const SkelRow = ({ first, w = "60%" }) => <div style={{ display: "flex", gap: 12, padding: 12, borderTop: first ? "none" : "1px solid var(--line)", alignItems: "center" }}>
  <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--skeleton)", flex: "none" }}></span>
  <div style={{ flex: 1 }}><div style={{ height: 12, width: w, background: "var(--skeleton)", borderRadius: 6 }}></div><div style={{ height: 10, width: "85%", background: "var(--skeleton)", borderRadius: 5, marginTop: 8 }}></div></div>
</div>;

/* Screen: header + scrolling page (surface) with white r16 cards. */
function NScreen({ W, H, offset = 0, scroll, toast, children }) {
  const pad = W < 340 ? 12 : 16;
  return <AFrame W={W} H={H}>
    <NHeader />
    <div style={{ position: "absolute", left: 0, right: 0, top: RHDR, bottom: 0, background: "var(--surface)", overflowY: scroll ? "auto" : "hidden" }}>
      <div style={{ padding: `12px ${pad}px 88px`, marginTop: -offset, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
    {toast}
  </AFrame>;
}
/* A day group = label + card of rows. */
const Group = ({ day, rows, open = {}, rider }) => <><Day>{day}</Day><NCard>{rows.map((n, i) => <NRow key={n.id} n={n} first={i === 0} open={open[n.id]} rider={rider} />)}</NCard></>;

Object.assign(window, { N, earlier, TONE, KIND, MARK, NDisc, NHeader, NCard, Day, Beads, Timeline, NRow, SwipeRow, OffRow, OtherSide, SkelRow, NScreen, Group });
