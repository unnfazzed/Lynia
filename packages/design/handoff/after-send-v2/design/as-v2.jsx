/* After Send v2 — new states (2.x) and component boards. Uses as-kit.jsx + as-screens.jsx. */
const NOPIN = { a: null, b: null };

/* 2.1 — opening an order: Back, no title, map without pins, sheet skeleton, no CTA */
function Opening({ W, H }) {
  const bar = (w, h = 10, bg = "var(--line)") => <span style={{ display: "block", width: w, height: h, borderRadius: h / 2, background: bg }}></span>;
  return <Live W={W} H={H} f={.34} map={NOPIN}>
    <Row style={{ justifyContent: "space-between" }}>{bar("60%", 16)}{bar(72, 28, "var(--surface)")}</Row>
    {bar("38%", 10, "var(--surface)")}
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>{bar("30%", 8, "var(--surface)")}{bar("45%", 22)}{bar("35%", 8, "var(--surface)")}</div>
    <Skel />
    <Row gap={8} style={{ justifyContent: "center" }}><ASpin c="var(--muted)" s={14} /><Muted>{A.loading}</Muted></Row>
  </Live>;
}

/* 2.2 · 2.3 — couldn't load (network, retryable) / not found (permanent) */
function LoadError({ W, H, gone }) {
  return <Live W={W} H={H} f={.36} map={NOPIN} ctaH={barH(gone ? 1 : 2)}
    cta={<Bar>{gone ? <GBtn label={A.home} icon="Home" /> : <><GBtn label={A.tryAgain} icon="RefreshCw" /><GBtn ghost label={A.home} /></>}</Bar>}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", paddingTop: 8 }}>
      <IconDisc n={gone ? "Package" : "WifiOff"} />
      <H2>{gone ? A.notFound : A.loadFail}</H2>
      <Muted s={14}>{gone ? A.notFoundSub : A.loadFailSub}</Muted>
    </div>
  </Live>;
}

/* 2.4 — offline cold start with a saved copy */
const Saved = ({ W, H }) => <Track W={W} H={H} stage="saved" ctaH={barH(1)} cta={<Bar><GBtn label={A.tryAgain} icon="RefreshCw" /></Bar>} />;

/* 2.16 — pickup photo viewer, full screen */
function PhotoViewer({ W, H }) {
  return <AFrame W={W} H={H}>
    <div style={{ position: "absolute", inset: 0, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 24 }}></div>
      <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 8px", gap: 4 }}>
        <span style={{ height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: "var(--radius-pill)", background: "rgba(255,255,255,.12)", fontSize: 15, fontWeight: 700 }}><AIc n="X" s={18} c="#fff" />{A.close}</span>
        <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700, marginRight: 96 }}>{A.photo}</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0" }}>
        <div style={{ width: "100%", aspectRatio: "3 / 4", maxHeight: "100%", background: "repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 8px, rgba(255,255,255,.12) 8px 9px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "rgba(255,255,255,.7)" }}>pickup photo · pinch to zoom</div>
      </div>
      <div style={{ padding: "12px 16px 20px", display: "flex", gap: 10, alignItems: "center" }}>
        <AIc n="Camera" s={18} c="#fff" /><span style={{ fontSize: 14, lineHeight: "20px" }}>{A.photoBy}</span>
      </div>
    </div>
  </AFrame>;
}

/* 2.17 — report a problem (form, then thanks) */
function Report({ W, H, done }) {
  const ov = <><Scrim /><Panel pad="0 16px 12px">
    {done ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", padding: "8px 0 16px" }}>
      <IconDisc n="CircleCheck" tone="ok" />
      <H2>{A.reportDone}</H2>
      <Muted s={14}>{A.reportDoneSub}</Muted>
    </div> : <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
      <div><H2>{A.reportT}</H2><Muted style={{ marginTop: 2 }}>{A.reportSub2}</Muted></div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{A.reportType}</div>
      <Tags list={[A.rp1, A.rp2, A.rp3, A.rp4, A.rp5]} on={[1]} />
      <div style={{ fontSize: 13, fontWeight: 600 }}>{A.tellMore} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {A.optional}</span></div>
      <div style={{ minHeight: 76, border: "2px solid var(--accent-text)", borderRadius: "var(--radius-input)", padding: "10px 12px", fontSize: 15, lineHeight: "21px", boxSizing: "border-box" }}>The box was wet on one side.<span style={{ display: "inline-block", width: 2, height: 18, background: "var(--accent-text)", verticalAlign: "-3px", marginLeft: 1 }}></span></div>
    </div>}
    <div style={{ display: "flex" }}>{done ? <GBtn ghost label={A.close} /> : <GBtn label={A.sendTeam} icon="Send" />}</div>
  </Panel></>;
  return <Track W={W} H={H} stage="drop" overlay={ov} />;
}

/* 2.19 — Share my trip: text only (no live link yet), into the Android share sheet */
function ShareTrip({ W, H }) {
  const tgt = (icon, l) => <div style={{ width: 72, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><IconDisc n={icon} tone="ok" s={48} /><span style={{ fontSize: 12, fontWeight: 600 }}>{l}</span></div>;
  const ov = <><Scrim /><Panel>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{A.shareWith}</div>
    <div style={{ background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 12px", fontSize: 13, lineHeight: "19px", textWrap: "pretty" }}>{A.shareTripMsg}</div>
    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0 8px" }}>{tgt("MessageCircle", A.whatsapp)}{tgt("MessageSquare", A.sms)}{tgt("Copy", A.copyText)}</div>
  </Panel></>;
  return <Track W={W} H={H} stage="drop" overlay={ov} />;
}

/* Boards: components outside the phone, drawn at the sheet's content width */
function Board({ W, children }) {
  return <div style={{ width: W, background: "var(--bg)", borderRadius: 18, boxShadow: "0 0 0 1px var(--line), 0 16px 40px rgba(20,24,27,.10)", padding: 16, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18, fontFamily: "var(--font-sans)", color: "var(--ink)" }}>{children}</div>;
}
const BItem = ({ l, children }) => <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div style={{ ...lbl, color: "var(--muted)" }}>{l}</div>{children}</div>;

/* 1.1 — code card at both widths + font scale 1.3 + issuing (2.14) */
function CodeBoard({ W }) {
  const n = W - 32;
  return <Board W={W}>
    <BItem l={`${n} dp · one row`}><CodeCard W={360} /></BItem>
        <BItem l={`${n} dp · font scale 1.3 → Share code under the digits`}><FontScale k={1.3}><CodeCard W={W} stack /></FontScale></BItem>
    <BItem l="2.14 · code being issued (~1 s)"><CodeCard W={W} issuing /></BItem>
  </Board>;
}

/* 2.13 — rider card variants at 320 */
function RiderBoard({ W = 320 }) {
  return <Board W={W}>
    <BItem l="No plate on file"><RiderCard plate={false} /></BItem>
    <BItem l="Not verified · no tag"><RiderCard verified={false} /></BItem>
    <BItem l="No photo · initials"><RiderCard photo={false} /></BItem>
    <BItem l="Long name + plate wrap"><RiderCard name="Tinotenda Chikwanha-Mutasa" i="TC" /></BItem>
    <BItem l="2.15 · number not available yet"><RiderCard noPhone /></BItem>
  </Board>;
}

/* 2.11 — offer card variants */
function OfferBoard({ W = 360 }) {
  return <Board W={W}>
    <BItem l="Best match · with photo"><OfferCard o={{ ...RIDERS.t, photo: true }} best /></BItem>
    <BItem l="Without photo · initials"><OfferCard o={RIDERS.k} /></BItem>
    <BItem l="New rider · same as your price"><OfferCard o={RIDERS.f} /></BItem>
    <BItem l="Very long name"><OfferCard o={{ n: "Tinotenda Chikwanha-Mutasa", i: "TC", r: "4.7", trips: 56, eta: 7, p: "$3.20" }} /></BItem>
    <BItem l="New rider ranked first"><OfferCard o={RIDERS.f} best /></BItem>
  </Board>;
}

/* 2.33 — Home live-order bar, per stage */
function LiveBar({ icon, text, sub }) {
  return <div style={{ minHeight: 60, display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 8px 12px", borderRadius: "var(--radius-input)", background: "var(--bg)", boxShadow: "var(--shadow-card), 0 0 0 1px var(--line)" }}>
    <IconDisc n={icon} tone="ok" s={40} />
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, lineHeight: "19px" }} className="lynia-tabular">{text}</div>{sub ? <Muted s={12}>{sub}</Muted> : null}</div>
    <AIc n="ChevronRight" s={18} c="var(--muted)" />
  </div>;
}
function BarBoard({ W = 360 }) {
  return <Board W={W}>
    <BItem l="Finding"><LiveBar icon="Timer" text={A.barFinding} /></BItem>
    <BItem l="Choose"><LiveBar icon="Bike" text={A.barChoose} /></BItem>
    <BItem l="On the way (to pickup / to drop-off)"><LiveBar icon="Bike" text={A.barOnWay} /><LiveBar icon="Package" text={A.barToDrop} /></BItem>
    <BItem l="Arriving"><LiveBar icon="MapPin" text={A.barArriving} /></BItem>
    <BItem l="Delivered, not rated"><LiveBar icon="Star" text={A.barRate} /></BItem>
  </Board>;
}

/* 2.34 — push notifications */
function Push({ t, b }) {
  return <div style={{ background: "var(--surface)", borderRadius: 16, padding: "10px 12px", display: "flex", gap: 10 }}>
    <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--accent)", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>LG</span>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, color: "var(--muted)" }}>LyniaGo · now</div><div style={{ fontSize: 14, fontWeight: 700, lineHeight: "19px" }}>{t}</div><div style={{ fontSize: 13, lineHeight: "18px" }}>{b}</div></div>
  </div>;
}
function PushBoard({ W = 360 }) {
  const P = [["Offer arrived (1)", "pOffer1"], ["Offers arrived (2+)", "pOfferN"], ["Matched", "pMatched"], ["Picked up", "pPicked"], ["Arriving", "pArriving"], ["Delivered", "pDelivered"], ["Not delivered", "pNotDel"], ["Cancelled by rider (reopened)", "pRiderCx"], ["Cancelled by LyniaGo", "pLyniaCx"], ["Window closed, no match", "pNoMatch"]];
  return <Board W={W}>{P.map(([l, k]) => <BItem key={k} l={l}><Push t={A[k]} b={A[k + "B"]} /></BItem>)}</Board>;
}

Object.assign(window, { Opening, LoadError, Saved, PhotoViewer, Report, ShareTrip, Board, BItem, CodeBoard, RiderBoard, OfferBoard, LiveBar, BarBoard, Push, PushBoard });
