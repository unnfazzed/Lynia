/* After Send — every stage of the one order screen (map on top, sheet below). */
function Live({ W, H, title, help, f = .32, map = {}, cta, ctaH = 0, toast, banner, overlay, children }) {
  const top = HDR + Math.round((H - HDR) * f);
  return <AFrame W={W} H={H}>
    <AMap W={W} sheetTop={top} {...map} />
    <AHeader title={title} help={help} />
    {banner}
    <Sheet top={top} ctaH={ctaH}>{children}</Sheet>
    {cta}{toast}{overlay}
  </AFrame>;
}
const Row = ({ children, gap = 10, align = "center", style }) => <div style={{ display: "flex", alignItems: align, gap, ...style }}>{children}</div>;
const Stop = ({ b, children }) => <Row gap={8}>{b ? <Sq s={10} /> : <Dot s={10} />}<Muted s={13} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{children}</Muted></Row>;

/* 1 · 1b · 2 · 5 — finding */
function Finding({ W, H, mode = "new" }) {
  const none = mode === "none", raised = mode === "raised", cx = mode === "cancel";
  const ctaH = cx ? barH(1, true) : barH(1);
  return <Live W={W} H={H} title={none ? A.tNoOnline : A.tFinding} f={.34} map={{ rings: !none }} ctaH={ctaH}
    cta={cx ? <Bar hint={A.cancelReqQ} row><GBtn ghost danger label={A.yesCancel} /><GBtn label={A.keepLooking} /></Bar> : <Bar><GBtn ghost label={A.cancelReq} icon="X" /></Bar>}>
    <Row style={{ justifyContent: "space-between" }} align="flex-start"><H2>{A.finding}</H2><Countdown t={none ? "1:05" : raised ? "0:52" : "1:24"} /></Row>
    <Progress pct={none ? 72 : raised ? 58 : 93} />
    <Row gap={6}><AIc n="Bike" s={16} c="var(--muted)" /><Muted>{none ? A.seen0 : A.seen}</Muted></Row>
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 10px 10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={lbl}>{A.yourPrice}</div>
        <Row gap={8} align="baseline"><span style={{ fontSize: 28, fontWeight: 700, lineHeight: "34px" }} className="lynia-tabular">{raised ? "$3.86" : "$3.36"}</span>{raised ? <span style={{ fontSize: 13, color: "var(--muted)", textDecoration: "line-through" }}>{A.was}</span> : null}</Row>
        <Row gap={5}><AIc n="Banknote" s={14} c="var(--muted)" /><Muted s={12}>{A.cash}</Muted></Row>
      </div>
      {none ? null : <SmBtn label={A.plus} />}
    </div>
    {raised ? <Row gap={8} style={{ background: "var(--accent-wash)", borderRadius: "var(--radius-input)", padding: "10px 12px" }}><AIc n="CircleCheck" s={18} c="var(--accent-text)" /><span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>{A.raised}</span></Row> : null}
    {none ? <>
      <Notice icon="Clock" text={<><b>{A.noOnline}</b> {A.noOnlineHint}</>} />
      <TextLink label={A.notify} icon="Bell" />
    </> : <><Muted>{A.offersHere}</Muted><Skel /></>}
  </Live>;
}

/* 3 · 4 — offers */
function Offers({ W, H, race }) {
  const list = race ? [RIDERS.f, RIDERS.k] : [RIDERS.t, RIDERS.k, RIDERS.f];
  return <Live W={W} H={H} title={A.tChoose} f={.16} ctaH={barH(1)} cta={<Bar><GBtn ghost label={A.cancelReq} icon="X" /></Bar>}
    toast={race ? <AToast text={A.taken} icon="CircleAlert" bottom={barH(1) + 10} /> : null}>
    <Row style={{ justifyContent: "space-between" }}><H2>{race ? A.offers2 : A.offers}</H2><Countdown t={race ? "0:41" : "0:58"} /></Row>
    <Row style={{ marginTop: -4 }}>
      <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontSize: 13, color: "var(--muted)" }}>{A.yourPrice.charAt(0) + A.yourPrice.slice(1).toLowerCase()} </span><b style={{ fontSize: 15 }} className="lynia-tabular">$3.36</b><Muted s={12}>{A.cash}</Muted></div>
      <SmBtn label={A.plus} />
    </Row>
    {list.map((o, i) => <OfferCard key={o.n} o={o} best={i === 0} />)}
    <Muted s={12}>{A.bestWhy}</Muted>
  </Live>;
}

/* 6 · 7 · 9 · 19 — tracking */
function Track({ W, H, stage = "pickup", overlay }) {
  const pick = stage === "pickup", paused = stage === "paused", off = stage === "offline";
  const banner = off ? <div style={{ position: "absolute", left: 0, right: 0, top: HDR, zIndex: 21, background: "var(--ink)", color: "#fff", padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", fontSize: 13, lineHeight: "18px" }}><span className="sc2-spin" style={{ width: 16, height: 16, flex: "none" }}></span><span>{A.offline}</span></div> : null;
  return <Live W={W} H={H} title={pick ? A.tOnWay : A.tToDrop} help f={.3} banner={banner} overlay={overlay}
    map={{ rider: pick ? { at: [.13, .72] } : { t: paused || off ? .45 : .55 }, paused: paused || off }}>
    {paused ? <Notice tone="warn" icon="TriangleAlert" text={A.gpsPaused} /> : null}
    <div><H2>{pick ? A.etaPickup : A.etaDrop}</H2><div style={{ marginTop: 4 }}><Stop b={!pick}>{pick ? ADDR.a : ADDR.b}</Stop></div></div>
    <StepTrack cur={pick ? 0 : 2} />
    {!pick ? <Row style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 8 }}>
      <span style={{ width: 52, height: 52, borderRadius: 8, flex: "none", background: "repeating-linear-gradient(45deg, var(--surface) 0 6px, var(--line) 6px 7px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 9, color: "var(--muted)" }}>photo</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{A.photo}</div><Muted s={12}>{A.photoSub}</Muted></div>
      <SmBtn label={A.view} icon="Camera" />
    </Row> : null}
    <RiderCard />
    <CodeCard offline={off} />
    <GMapsRow />
    <TextLink label={pick ? A.cancelFree : A.cancelOrder} icon="X" c="var(--muted)" center />
  </Live>;
}

/* 8 — hand-off */
function Handoff({ W, H }) {
  return <Live W={W} H={H} title={A.tHandoff} help f={.17} map={{ rider: { t: .88 } }} ctaH={barH(1)} cta={<Bar><GBtn label={A.shareCode} icon="Share2" /></Bar>}>
    <div><H2>{A.atDrop}</H2><div style={{ marginTop: 4 }}><Stop b>{ADDR.b}</Stop></div></div>
    <StepTrack cur={2} />
    <CodeBig W={W} />
    <RiderCard />
  </Live>;
}

/* 10a · 10b — cancel */
function Cancel({ W, H, after }) {
  return <Live W={W} H={H} title={after ? A.tToDrop : A.tOnWay} help f={.3} map={{ rider: after ? { t: .55 } : { at: [.13, .72] }, dim: true }} ctaH={barH(2)}
    cta={<Bar><GBtn label={A.keep} /><GBtn ghost danger label={after ? A.cancelAnyway : A.cancelYes} /></Bar>}>
    <H2>{A.cancelQ}</H2>
    {after ? <Notice tone="warn" icon="TriangleAlert" text={A.cancelWarn} /> : <Row gap={8}><AIc n="CircleCheck" s={18} c="var(--accent-text)" /><span style={{ fontSize: 14, lineHeight: "20px" }}>{A.cancelFreeBody}</span></Row>}
    <div style={{ fontSize: 13, fontWeight: 600 }}>{A.reason}</div>
    <Tags list={[A.r1, A.r2, A.r3, A.r4]} on={[0]} />
  </Live>;
}

/* 11 — Get help over a live trip */
function Help({ W, H }) {
  const row = (icon, t, s, danger) => <Row gap={12} style={{ minHeight: 60, borderTop: "1px solid var(--line)" }}>
    <IconDisc n={icon} s={40} tone={danger ? "danger" : "ok"} />
    <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: danger ? "var(--danger)" : "var(--ink)" }}>{t}</div><Muted s={12}>{s}</Muted></div>
    <AIc n="ChevronRight" s={18} c="var(--muted)" />
  </Row>;
  const ov = <>
    <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 40 }}></div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 41, background: "var(--bg)", borderRadius: "16px 16px 0 0", padding: "0 16px 12px" }}>
      <div style={{ height: 16, display: "flex", justifyContent: "center", alignItems: "center" }}><span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }}></span></div>
      <H2>{A.helpT}</H2><Muted style={{ margin: "2px 0 8px" }}>{A.helpSub}</Muted>
      {row("Phone", A.emergency, A.emergencySub, true)}
      {row("Phone", A.support, A.supportSub)}
      {row("Share2", A.shareTrip, A.shareTripSub)}
      {row("CircleAlert", A.report, A.reportSub)}
      <div style={{ display: "flex", marginTop: 8 }}><GBtn ghost label={A.close} /></div>
    </div>
  </>;
  return <Track W={W} H={H} stage="drop" overlay={ov} />;
}

/* 12 · 13 — one retry screen */
function Retry({ W, H, rider }) {
  return <Live W={W} H={H} title={rider ? A.tRiderCx : A.tNoRider} f={.26} map={{ dim: true }} ctaH={barH(2)}
    cta={<Bar><GBtn label={A.sendAgainAt} icon="RefreshCw" /><GBtn ghost label={A.editOrder} icon="Pencil" /></Bar>}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", paddingTop: 4 }}>
      <IconDisc n={rider ? "Bike" : "Clock"} />
      <H2>{rider ? A.riderCx : A.noTook}</H2>
      <Muted s={14}>{rider ? A.riderCxSub : A.noTookSub}</Muted>
    </div>
    <Row style={{ background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 14px" }}>
      <div style={{ flex: 1 }}><div style={lbl}>{A.suggested}</div><span style={{ fontSize: 28, fontWeight: 700, lineHeight: "34px" }} className="lynia-tabular">$3.86</span></div>
      <Muted s={12} style={{ textAlign: "right", maxWidth: 120 }}>{A.sugNote}</Muted>
    </Row>
    <Row gap={6} style={{ justifyContent: "center" }}><AIc n="Check" s={15} c="var(--accent-text)" /><Muted>{A.kept}</Muted></Row>
  </Live>;
}

/* 14a · 14b — rate */
function Rate({ W, H, low }) {
  return <Live W={W} H={H} title={A.tDelivered} f={.14} map={{ rider: { t: 1 } }} ctaH={barH(1)}
    cta={<Bar row><GBtn ghost label={A.skip} /><div style={{ flex: 2, display: "flex" }}><GBtn label={A.submit} /></div></Bar>}>
    <Row gap={12}><IconDisc n="CircleCheck" tone="ok" s={40} /><div><H2>{A.delivered}</H2><Muted>{A.deliveredSub}</Muted></div></Row>
    <div style={{ height: 1, background: "var(--line)" }}></div>
    <Row><Avatar i="TM" photo s={36} /><span style={{ fontSize: 16, fontWeight: 700 }}>{A.rateQ}</span></Row>
    <div style={{ margin: "-6px 0 -4px -6px" }}><Stars n={low ? 2 : 4} /></div>
    <div style={{ fontSize: 13, fontWeight: 600 }}>{low ? A.whatWrong : A.whatWell} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {A.optional}</span></div>
    <Tags list={low ? [A.tn1, A.tn2, A.tn3, A.tn4] : [A.tg1, A.tg2, A.tg3, A.tg4]} on={low ? [0] : [0, 1]} />
    <Receipt />
  </Live>;
}

const RatedLine = () => <Row gap={6}><Muted>{A.youRated}</Muted>{[1, 2, 3, 4, 5].map(i => <AIc key={i} n="Star" s={14} c={i <= 4 ? "var(--accent)" : "var(--line)"} fill={i <= 4 ? "var(--accent)" : "none"} />)}</Row>;

/* 15 — rated, undo, receipt */
function Rated({ W, H }) {
  return <Live W={W} H={H} title={A.tDelivered} f={.14} map={{ rider: { t: 1 } }} ctaH={barH(1)} cta={<Bar><GBtn label={A.home} /></Bar>}
    toast={<AToast text={A.rated} icon="CircleCheck" action={`${A.undo} · 0:09`} actionIcon="Undo2" bottom={barH(1) + 10} />}>
    <Row gap={12}><IconDisc n="CircleCheck" tone="ok" s={40} /><div><H2>{A.delivered}</H2><RatedLine /></div></Row>
    <Receipt />
  </Live>;
}

/* 16 — completed (opened later) */
function Completed({ W, H }) {
  return <Live W={W} H={H} title={A.tComplete} f={.2} ctaH={barH(1)} cta={<Bar><GBtn label={A.sendAgain} icon="RefreshCw" /></Bar>}>
    <div><H2>Delivered Tue 30 Sep, 09:31</H2><RatedLine /></div>
    <Receipt />
    <TextLink label={A.getHelp} icon="LifeBuoy" center />
  </Live>;
}

/* 17 — not delivered */
function NotDelivered({ W, H }) {
  return <Live W={W} H={H} title={A.tNotDel} f={.22} map={{ rider: { t: .92 } }} ctaH={barH(2)}
    cta={<Bar><GBtn label={A.callRider} icon="Phone" /><GBtn ghost label={A.sendAgain} icon="RefreshCw" /></Bar>}>
    <Row gap={12}><IconDisc n="CircleAlert" tone="danger" s={40} /><H2>{A.notDel}</H2></Row>
    <div style={{ background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 14px" }}><div style={lbl}>{A.notDelReason}</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{A.notDelReasonV}</div></div>
    <Muted s={14}>{A.notDelBody}</Muted>
    <RiderCard buttons={false} />
  </Live>;
}

/* 18 — cancelled by you / rider / LyniaGo */
function Cancelled({ W, H, who = "you" }) {
  const t = { you: [A.cxYou, A.cxYouR], rider: [A.cxRider, A.cxRiderR], lynia: [A.cxLynia, A.cxLyniaR] }[who];
  const ly = who === "lynia";
  return <Live W={W} H={H} title={A.tCancelled} f={.3} map={{ dim: true }} ctaH={barH(ly ? 2 : 1)}
    cta={<Bar><GBtn label={A.sendAgain} icon="RefreshCw" />{ly ? <GBtn ghost label={S.call} icon="Phone" /> : null}</Bar>}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", paddingTop: 4 }}>
      <IconDisc n="Ban" />
      <H2>{t[0]}</H2>
      <Muted s={14}><b style={{ color: "var(--ink)" }}>{A.reasonP}:</b> {t[1]}</Muted>
    </div>
    {ly ? null : <Row gap={6} style={{ justifyContent: "center" }}><AIc n="Banknote" s={15} c="var(--muted)" /><Muted>{A.nothingOwed}</Muted></Row>}
  </Live>;
}

Object.assign(window, { Live, Finding, Offers, Track, Handoff, Cancel, Help, Retry, Rate, Rated, Completed, NotDelivered, Cancelled });
