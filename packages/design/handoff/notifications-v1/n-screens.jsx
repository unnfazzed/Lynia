/* Notifications v1 — sample feed + every frame. */
const CF = { /* customer */
  sadza: { id: "sadza", kind: "restaurants", tone: "neutral", unread: 1, title: N.tSadza, sub: N.mCollected, time: N.m2, steps: [[N.tmCollected, "12:21"], [N.tmPreparing, "12:05"], [N.tmAccepted, "12:02"]] },
  glen: { id: "glen", kind: "send", tone: "good", unread: 1, title: N.tGlenara, sub: N.cDelivered, time: N.h1, steps: [[N.tlDelivered, "10:31"], [N.tlToDrop, "10:12"], [N.tlCollected, "10:05"], [N.tlOnWay, "09:58"], [N.tlAssigned, "09:52"]] },
  pharm: { id: "pharm", kind: "pharmacy", tone: "warn", unread: 1, title: N.tPharm, sub: N.mSwap, time: N.h3, action: N.reviewSwap, steps: [[N.tmSwap, "08:40"], [N.tmAccepted, "08:31"]] },
  wallet: { id: "wallet", icon: "Banknote", tone: "money", title: N.aWalletT, sub: N.aWalletC, time: N.yest },
  belg: { id: "belg", kind: "send", tone: "neutral", title: N.tBelgravia, sub: N.cCancelled, time: N.yest, steps: [[N.tlCancelled, "17:02"], [N.tlNoRiders, "16:50"], [N.tlPosted, "16:38"]] },
  report: { id: "report", icon: "ShieldCheck", tone: "good", title: N.sResolvedT, sub: N.sResolvedB, time: N.yest },
  mama: { id: "mama", kind: "restaurants", tone: "good", title: N.tMama, sub: N.mDelivered, time: N.sep28, steps: [[N.tmDelivered, "19:14"], [N.tmDoor, "19:12"], [N.tmCollected, "18:55"], [N.tmPreparing, "18:41"], [N.tmAccepted, "18:38"]] },
  tm: { id: "tm", kind: "shops", tone: "good", title: N.tTM, sub: N.mDeliveredShop, time: N.sep28, steps: [[N.tmDelivered, "11:20"], [N.tmCollected, "11:02"], [N.tmAccepted, "10:47"]] },
  mbare: { id: "mbare", kind: "send", tone: "good", title: N.tMbare, sub: N.sBack, time: N.sep28, steps: [[N.tlBack, "15:40"], [N.tlSos, "15:22"], [N.tlCollected, "15:05"], [N.tlAssigned, "14:58"]] },
  sos: { id: "sos", icon: "Siren", tone: "danger", unread: 1, title: N.sSosT, sub: N.sSosB, time: N.now },
  mbareLive: { id: "mbareLive", kind: "send", tone: "neutral", unread: 1, title: N.tMbare, sub: N.cToDrop, time: N.m40, steps: [[N.tlToDrop, "15:05"], [N.tlCollected, "14:58"], [N.tlAssigned, "14:50"]] },
  offer: { id: "offer", kind: "send", tone: "warn", unread: 1, title: N.tAvondaleP, sub: N.cOffer, time: N.now, action: N.seeOffer, steps: [[N.tlOffer, "12:24"], [N.tlNoRiders, "12:15"], [N.tlPosted, "12:08"]] },
  idc: { id: "idc", icon: "IdCard", tone: "warn", unread: 1, title: N.aIdT, sub: N.aIdB, time: N.h1, action: N.tryAgain },
  verifiedC: { id: "verifiedC", icon: "ShieldCheck", tone: "good", title: N.aVerifiedT, sub: N.aVerifiedB, time: N.yest },
};
const RF = { /* rider */
  paused: { id: "paused", icon: "Ban", tone: "danger", unread: 1, title: N.aPausedT, sub: N.aPausedB, time: N.h1 },
  pausedOld: { id: "pausedOld", icon: "Ban", tone: "neutral", title: N.aPausedT, sub: N.aPausedB, time: N.h3 },
  restored: { id: "restored", icon: "ShieldCheck", tone: "good", unread: 1, title: N.aRestoredT, sub: N.aRestoredB, time: N.now },
  glen: { id: "rglen", kind: "send", tone: "good", unread: 1, title: N.tJobGlenara, sub: N.rDelivered, time: N.m2, steps: [[N.trDelivered, "10:31"], [N.trCollected, "10:05"], [N.trToPickup, "09:54"], [N.trGot, "09:52"]] },
  wallet: { id: "rwallet", icon: "Banknote", tone: "money", unread: 1, title: N.aWalletT, sub: N.aWalletR, time: N.h3 },
  avon: { id: "ravon", kind: "restaurants", tone: "neutral", title: N.tJobAvondale, sub: N.rCancelled, time: N.yest, steps: [[N.trCancelled, "18:10"], [N.trToPickup, "18:02"], [N.trGot, "18:01"]] },
  belg: { id: "rbelg", kind: "send", tone: "good", title: N.tJobBelgravia, sub: N.rDelivered2, time: N.yest, steps: [[N.trDelivered, "17:40"], [N.trCollected, "17:22"], [N.trGot, "17:10"]] },
  verified: { id: "rverified", icon: "ShieldCheck", tone: "good", title: N.aVerifiedT, sub: N.aVerifiedB, time: N.sep28 },
};
const read = (n) => ({ ...n, unread: 0 });

const CustFeed = ({ open }) => <>
  <Group day={N.dToday} rows={[CF.sadza, CF.glen, CF.pharm]} open={open} />
  <Group day={N.dYest} rows={[CF.wallet, CF.belg, CF.report]} open={open} />
  <Group day={N.d28} rows={[CF.mama, CF.tm, CF.mbare]} open={open} />
</>;
const RiderFeed = ({ restored, open }) => <>
  {restored ? null : <NCard danger><NRow n={RF.paused} first /></NCard>}
  <Group rider day={N.dToday} rows={restored ? [RF.restored, RF.glen, RF.wallet, RF.pausedOld] : [RF.glen, RF.wallet]} open={open} />
  <Group rider day={N.dYest} rows={[RF.avon, RF.belg]} open={open} />
  <Group rider day={N.d28} rows={[RF.verified]} open={open} />
</>;

function N1({ W, H, offset }) { return <NScreen W={W} H={H} offset={offset}><CustFeed /></NScreen>; }
function N1c({ W, H }) {
  return <NScreen W={W} H={H}>
    <NCard danger><NRow n={CF.sos} first /></NCard>
    <Group day={N.dToday} rows={[CF.mbareLive, CF.sadza]} />
    <Group day={N.dYest} rows={[CF.wallet, CF.belg]} />
  </NScreen>;
}
function N2({ W, H }) {
  return <NScreen W={W} H={H}>
    <Group day={N.dToday} rows={[CF.sadza, CF.glen, CF.pharm]} open={{ glen: 1 }} />
    <Group day={N.dYest} rows={[CF.wallet]} />
  </NScreen>;
}
function N3({ W, H, restored }) { return <NScreen W={W} H={H}><RiderFeed restored={restored} /></NScreen>; }
function N4({ W, H, rider }) {
  return <NScreen W={W} H={H}>
    <OtherSide rider={rider} />
    {rider ? <>
      <Group rider day={N.dToday} rows={[RF.glen, RF.wallet]} />
      <Group rider day={N.dYest} rows={[RF.belg, CF.verifiedC]} />
    </> : <>
      <Group day={N.dToday} rows={[CF.glen, CF.pharm]} />
      <Group day={N.dYest} rows={[CF.wallet, CF.verifiedC, CF.belg]} />
    </>}
  </NScreen>;
}
function N5({ W, H }) {
  return <NScreen W={W} H={H}>
    <Group day={N.dToday} rows={[CF.offer, CF.pharm, CF.idc, read(CF.glen)]} />
  </NScreen>;
}
function N6({ W, H, rider }) {
  return <NScreen W={W} H={H}>
    <OffRow rider={rider} />
    {rider ? <><Group rider day={N.dToday} rows={[read(RF.glen), read(RF.wallet)]} /><Group rider day={N.dYest} rows={[RF.avon, RF.belg]} /></>
      : <><Group day={N.dToday} rows={[read(CF.sadza), read(CF.glen)]} /><Group day={N.dYest} rows={[CF.wallet, CF.belg]} /></>}
  </NScreen>;
}
function N7({ W, H, gone }) {
  const toast = gone ? <AToast bottom={16} icon="Trash2" text={N.removed} action={N.undo} actionIcon="Undo2" /> : null;
  return <NScreen W={W} H={H} toast={toast}>
    <Day>{N.dToday}</Day>
    <NCard>
      <NRow n={read(CF.sadza)} first />
      {gone ? null : <SwipeRow dx={-Math.round(W * .38)}><NRow n={read(CF.glen)} first /></SwipeRow>}
      <NRow n={read(CF.pharm)} />
    </NCard>
    <Group day={N.dYest} rows={[CF.wallet, CF.belg]} />
  </NScreen>;
}
function N8({ W, H, rider }) {
  return <NScreen W={W} H={H}>
    <div style={{ marginTop: 12, background: "var(--accent-wash)", borderRadius: 20, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <img src="../calm-mint-v2-2026-10/assets/illustrations/trust-tracking.svg" alt="" style={{ height: 110 }} />
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: "24px", marginTop: 8 }}>{rider ? N.emptyRT : N.emptyCT}</div>
      <div style={{ fontSize: 14, lineHeight: "20px", color: "var(--muted)", textWrap: "pretty", marginBottom: rider ? 4 : 10 }}>{rider ? N.emptyRB : N.emptyCB}</div>
      {rider ? null : <div style={{ alignSelf: "stretch", display: "flex" }}><GBtn label={N.sendParcel} icon="Package" /></div>}
    </div>
  </NScreen>;
}
function N9({ W, H, slow }) {
  return <NScreen W={W} H={H}>
    <div style={{ height: 10, width: 54, background: "var(--skeleton)", borderRadius: 5, margin: "8px 4px 0" }}></div>
    <NCard>{["58%", "44%", "66%", "50%"].map((w, i) => <SkelRow key={i} first={i === 0} w={w} />)}</NCard>
    <div style={{ height: 10, width: 72, background: "var(--skeleton)", borderRadius: 5, margin: "8px 4px 0" }}></div>
    <NCard>{["52%", "62%"].map((w, i) => <SkelRow key={i} first={i === 0} w={w} />)}</NCard>
    {slow ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "var(--muted)", marginTop: 4 }}><ASpin c="var(--muted)" s={14} />{N.slow}</div> : null}
  </NScreen>;
}
function N10({ W, H }) {
  return <AFrame W={W} H={H}><NHeader />
    <div style={{ position: "absolute", left: 0, right: 0, top: RHDR, bottom: 0, background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 24px 60px", textAlign: "center" }}>
      <IconDisc n="WifiOff" s={72} />
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px", textWrap: "balance" }}>{N.failT}</div>
      <div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{N.failB}</div>
      <div style={{ alignSelf: "stretch", display: "flex", marginTop: 8 }}><GBtn label={N.tryAgain} icon="RefreshCw" /></div>
    </div></AFrame>;
}
function N10b({ W, H }) {
  return <NScreen W={W} H={H}>
    <Notice icon="WifiOff" text={N.stale} />
    <Group day={N.dToday} rows={[read(CF.sadza), read(CF.glen)]} />
    <Group day={N.dYest} rows={[CF.wallet, CF.belg]} />
  </NScreen>;
}

/* Live prototype: tap "n earlier updates" to expand, drag a row sideways to remove, Undo in the toast. */
function LiveFeed({ W = 360, H = 720, side, off, seed }) {
  const base = React.useMemo(() => side === "rider"
    ? [[N.dToday, [RF.glen, RF.wallet]], [N.dYest, [RF.avon, RF.belg]], [N.d28, [RF.verified]]]
    : [[N.dToday, [CF.sadza, CF.glen, CF.pharm]], [N.dYest, [CF.wallet, CF.belg, CF.report]], [N.d28, [CF.mama, CF.tm, CF.mbare]]], [side]);
  const [open, setOpen] = React.useState({}), [gone, setGone] = React.useState({}), [last, setLast] = React.useState(null), [drag, setDrag] = React.useState({});
  const st = React.useRef({});
  React.useEffect(() => { setOpen({}); setGone({}); setLast(null); }, [side, seed]);
  React.useEffect(() => { if (!last) return; const t = setTimeout(() => setLast(null), 5000); return () => clearTimeout(t); }, [last]);
  const down = (id) => (e) => { st.current = { id, x: e.clientX, moved: false }; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (id) => (e) => { const s = st.current; if (s.id !== id) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 6) s.moved = true; if (s.moved) setDrag({ [id]: dx }); };
  const up = (id) => () => { const s = st.current, dx = drag[id] || 0; st.current = { justMoved: s.moved };
    if (Math.abs(dx) > W * .35) { setDrag({ [id]: dx > 0 ? W : -W }); setTimeout(() => { setGone(g => ({ ...g, [id]: 1 })); setDrag({}); setLast(id); }, 200); }
    else setDrag({}); };
  const toast = last ? <div onClick={() => { setGone(g => { const n = { ...g }; delete n[last]; return n; }); setLast(null); }} style={{ cursor: "pointer" }}><AToast bottom={16} icon="Trash2" text={N.removed} action={N.undo} actionIcon="Undo2" /></div> : null;
  return <NScreen W={W} H={H} scroll toast={toast}>
    {off ? <OffRow rider={side === "rider"} /> : null}
    {base.map(([day, rows]) => { const vis = rows.filter(r => !gone[r.id]); if (!vis.length) return null;
      return <React.Fragment key={day}><Day>{day}</Day><NCard>{vis.map((n, i) => <SwipeRow key={n.id} first={i === 0} dx={drag[n.id] || 0} live={st.current.id === n.id}
        onPointerDown={down(n.id)} onPointerMove={move(n.id)} onPointerUp={up(n.id)} onPointerCancel={() => { st.current = {}; setDrag({}); }}>
        <NRow n={n} first rider={side === "rider"} open={open[n.id]} onToggle={() => { if (!st.current.justMoved) setOpen(o => ({ ...o, [n.id]: !o[n.id] })); }} />
      </SwipeRow>)}</NCard></React.Fragment>; })}
  </NScreen>;
}

Object.assign(window, { CF, RF, N1, N1c, N2, N3, N4, N5, N6, N7, N8, N9, N10, N10b, LiveFeed });
