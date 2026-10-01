/* After Send v2 — every stage of the one order screen (map on top, sheet below). v1 functions, extended with v2 variants. */
/* fs = system font scale preview (1 or 1.3). f = peek (share of space under the header); fS = peek used at font scale > 1. */
function Live({ W, H, title, help, f = .32, fS, fs = 1, map = {}, cta, ctaH = 0, toast, banner, overlay, showHit, children }) {
  const ff = fs > 1 && fS != null ? fS : f;
  const top = HDR + Math.round((H - HDR) * ff);
  return <AFrame W={W} H={H}>
    <FontScale k={fs}>
      <AMap W={W} sheetTop={top} {...map} />
      <AHeader title={title} help={help} />
      {banner}
      <Sheet top={top} ctaH={ctaH} showHit={showHit}>{children}</Sheet>
      {cta}{toast}{overlay}
    </FontScale>
  </AFrame>;
}
const Row = ({ children, gap = 10, align = "center", style }) => <div style={{ display: "flex", alignItems: align, gap, ...style }}>{children}</div>;
const Stop = ({ b, children }) => <Row gap={8} align="flex-start"><span style={{ height: 18, display: "flex", alignItems: "center" }}>{b ? <Sq s={10} /> : <Dot s={10} />}</span><Muted s={13}>{children}</Muted></Row>;
const InkBanner = ({ text }) => <div style={{ position: "absolute", left: 0, right: 0, top: HDR, zIndex: 21, background: "var(--ink)", color: "#fff", padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", fontSize: 13, lineHeight: "18px" }}><span className="sc2-spin" style={{ width: 16, height: 16, flex: "none" }}></span><span>{text}</span></div>;
const OkNote = ({ text, style }) => <Row gap={8} align="flex-start" style={{ background: "var(--accent-wash)", borderRadius: "var(--radius-input)", padding: "10px 12px", ...style }}><AIc n="CircleCheck" s={18} c="var(--accent-text)" /><span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, color: "var(--accent-text)", textWrap: "pretty" }}>{text}</span></Row>;
const retryToast = (text, bottom) => <AToast text={text} action={A.tryAgain} actionIcon="RefreshCw" bottom={bottom} />;

/* 1 · 1b · 2 · 5 — finding. v2 modes: raising (2.5) · raiseFail (2.6) · notifyOn / notifyFail (2.8) · cancelling (2.22b) */
function Finding({ W, H, mode = "new", fs, showHit }) {
  const none = mode.startsWith("none") || mode.startsWith("notify"), raised = mode === "raised", cx = mode === "cancel" || mode === "cancelling";
  const ctaH = cx ? barH(1, true) : barH(1);
  const busy = mode === "cancelling";
  return <Live W={W} H={H} fs={fs} showHit={showHit} title={none ? A.tNoOnline : A.tFinding} f={.34} map={{ rings: !none }} ctaH={ctaH}
    toast={mode === "raiseFail" ? retryToast(A.raiseFail, ctaH + 10) : null}
    cta={cx ? <Bar hint={A.cancelReqQ} row><GBtn ghost danger label={A.yesCancel} loading={busy} /><GBtn label={A.keepLooking} disabled={busy} /></Bar> : <Bar><GBtn ghost label={A.cancelReq} icon="X" /></Bar>}>
    <Row style={{ justifyContent: "space-between" }} align="flex-start"><H2>{A.finding}</H2><Countdown t={none ? "1:05" : raised ? "0:52" : "1:24"} /></Row>
    <Progress pct={none ? 72 : raised ? 58 : 93} />
    <Row gap={6}><AIc n="Bike" s={16} c="var(--muted)" /><Muted>{none ? A.seen0 : A.seen}</Muted></Row>
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 10px 10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={lbl}>{A.yourPrice}</div>
        <Row gap={8} align="baseline"><span style={{ fontSize: 28, fontWeight: 700, lineHeight: "34px" }} className="lynia-tabular">{raised ? "$3.86" : "$3.36"}</span>{raised ? <span style={{ fontSize: 13, color: "var(--muted)", textDecoration: "line-through" }}>{A.was}</span> : null}</Row>
        <Row gap={5}><AIc n="Banknote" s={14} c="var(--muted)" /><Muted s={12}>{A.cash}</Muted></Row>
      </div>
      {none ? null : <SmBtn label={A.plus} loading={mode === "raising"} />}
    </div>
    {raised ? <OkNote text={A.raised} /> : null}
    {none ? <>
      <Notice icon="Clock" text={<><b>{A.noOnline}</b> {A.noOnlineHint}</>} />
      {mode === "notifyOn" ? <Row gap={8} style={{ minHeight: 44 }}><AIc n="CircleCheck" s={16} c="var(--accent-text)" /><span style={{ fontSize: 14, lineHeight: "20px", color: "var(--ink)" }}>{A.notifyOn}</span></Row>
        : mode === "notifyFail" ? <Row gap={8} align="flex-start" style={{ minHeight: 44 }}><AIc n="CircleAlert" s={16} c="var(--muted)" /><Muted s={14}>{A.notifyFail}</Muted></Row>
        : <TextLink label={A.notify} icon="Bell" />}
    </> : <><Muted>{A.offersHere}</Muted><Skel /></>}
  </Live>;
}

/* 3 · 4 — offers. v2: list (any rider can be first) · busy / slow (2.9) · raised (2.7) · late (2.10) */
function Offers({ W, H, race, list, busy = -1, slow, raised, late, fs }) {
  const L = list || (race ? [RIDERS.t, RIDERS.k] : [RIDERS.f, RIDERS.t, RIDERS.k]);
  const n = { 1: A.offers1, 2: A.offers2, 3: A.offers }[L.length];
  return <Live W={W} H={H} fs={fs} title={A.tChoose} f={.16} fS={.12} ctaH={barH(1)} cta={<Bar><GBtn ghost label={A.cancelReq} icon="X" disabled={busy >= 0} /></Bar>}
    toast={race ? <AToast text={A.taken} icon="CircleAlert" bottom={barH(1) + 10} /> : null}>
    <Row style={{ justifyContent: "space-between" }}><H2>{n}</H2>{late ? <span style={{ height: 28, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", borderRadius: "var(--radius-pill)", background: "var(--ink)", color: "#fff", fontSize: 13, fontWeight: 700, flex: "none" }} className="lynia-tabular"><AIc n="Timer" s={14} c="#fff" />{A.chooseIn} 0:12</span> : <Countdown t={race ? "1:22" : raised ? "0:44" : "1:23"} />}</Row>
    {late ? <Notice icon="Clock" text={A.timeUp} /> : <Row style={{ marginTop: -4 }}>
      <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontSize: 13, color: "var(--muted)" }}>{A.yourPrice.charAt(0) + A.yourPrice.slice(1).toLowerCase()} </span><b style={{ fontSize: 15 }} className="lynia-tabular">{raised ? "$3.86" : "$3.36"}</b>{raised ? <span style={{ fontSize: 13, color: "var(--muted)", textDecoration: "line-through", marginLeft: 6 }}>{A.was}</span> : null}<Muted s={12}>{A.cash}</Muted></div>
      <SmBtn label={A.plus} disabled={busy >= 0} />
    </Row>}
    {raised ? <OkNote text={A.raised} style={{ marginTop: -4 }} /> : null}
    {L.map((o, i) => <OfferCard key={o.n} o={raised && o.over ? { ...o, over2: true } : o} best={i === 0} busy={i === busy} off={busy >= 0 && i !== busy} slow={slow} />)}
    <Muted s={12}>{A.bestWhy}</Muted>
  </Live>;
}

/* 6 · 7 · 9 · 19 — tracking. v2: nofix (2.12) · issuing (2.14) · noPhone (2.15) · sos (2.18) · saved (2.4) · rider card variants */
function Track({ W, H, stage = "pickup", overlay, fs, issuing, noPhone, sos, rc = {}, showHit, cta, ctaH }) {
  const pick = stage === "pickup" || stage === "nofix", nofix = stage === "nofix", paused = stage === "paused", off = stage === "offline", saved = stage === "saved";
  const banner = off ? <InkBanner text={A.offline} /> : saved ? <InkBanner text={A.savedCopy} /> : null;
  const rider = nofix || saved ? null : pick ? { at: [.13, .72] } : { t: paused || off ? .45 : .55 };
  const stack = fs > 1 ? true : undefined;
  return <Live W={W} H={H} fs={fs} showHit={showHit} title={pick || saved ? A.tOnWay : A.tToDrop} help f={.3} fS={.26} banner={banner} overlay={overlay} cta={cta} ctaH={ctaH}
    map={{ rider, paused: paused || off }}>
    {paused ? <Notice tone="warn" icon="TriangleAlert" text={A.gpsPaused} /> : null}
    {sos ? <OkNote text={A.sosSent} /> : null}
    {nofix ? <div><H2>{A.noFix}</H2><Muted style={{ marginTop: 2 }}>{A.noFixSub}</Muted><div style={{ marginTop: 4 }}><Stop>{ADDR.a}</Stop></div></div>
      : saved ? <div><H2>{A.tOnWay}</H2><Row gap={6} style={{ marginTop: 4 }}><AIc n="WifiOff" s={14} c="var(--muted)" /><Muted>{A.savedAt}</Muted></Row></div>
      : <div><H2>{pick ? A.etaPickup : A.etaDrop}</H2><div style={{ marginTop: 4 }}><Stop b={!pick}>{pick ? ADDR.a : ADDR.b}</Stop></div></div>}
    <StepTrack cur={pick || saved ? 0 : 2} />
    {!pick && !saved ? <Row style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: 8 }}>
      <span style={{ width: 52, height: 52, borderRadius: 8, flex: "none", background: "repeating-linear-gradient(45deg, var(--surface) 0 6px, var(--line) 6px 7px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 9, color: "var(--muted)" }}>photo</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{A.photo}</div><Muted s={12}>{A.photoSub}</Muted></div>
      <SmBtn label={A.view} icon="Camera" />
    </Row> : null}
    <RiderCard noPhone={noPhone} {...rc} />
    <CodeCard offline={off || saved} W={W} stack={stack} issuing={issuing} />
    {sos ? <TextLink label={A.sosAgain} icon="Phone" c="var(--danger)" center /> : <GMapsRow />}
    <TextLink label={pick ? A.cancelFree : A.cancelOrder} icon="X" c="var(--muted)" center />
  </Live>;
}

/* 8 — hand-off */
function Handoff({ W, H, fs }) {
  return <Live W={W} H={H} fs={fs} title={A.tHandoff} help f={.17} fS={.14} map={{ rider: { t: .88 } }} ctaH={barH(1)} cta={<Bar><GBtn label={A.shareCode} icon="Share2" /></Bar>}>
    <div><H2>{A.atDrop}</H2><div style={{ marginTop: 4 }}><Stop b>{ADDR.b}</Stop></div></div>
    <StepTrack cur={2} />
    <CodeBig W={W} />
    <RiderCard />
  </Live>;
}

/* 10a · 10b — cancel. v2: no reason pre-selected (2.23) · sel = picked chip · busy / fail (2.22) */
function Cancel({ W, H, after, sel = [], busy, fail }) {
  return <Live W={W} H={H} title={after ? A.tToDrop : A.tOnWay} help f={.3} map={{ rider: after ? { t: .55 } : { at: [.13, .72] }, dim: true }} ctaH={barH(2)}
    toast={fail ? retryToast(A.cancelFail, barH(2) + 10) : null}
    cta={<Bar><GBtn label={A.keep} disabled={busy} /><GBtn ghost danger label={after ? A.cancelAnyway : A.cancelYes} loading={busy} /></Bar>}>
    <H2>{A.cancelQ}</H2>
    {after ? <Notice tone="warn" icon="TriangleAlert" text={A.cancelWarn} /> : <Row gap={8}><AIc n="CircleCheck" s={18} c="var(--accent-text)" /><span style={{ fontSize: 14, lineHeight: "20px" }}>{A.cancelFreeBody}</span></Row>}
    <div style={{ fontSize: 13, fontWeight: 600 }}>{A.reason}</div>
    <Tags list={[A.r1, A.r2, A.r3, A.r4]} on={sel} />
  </Live>;
}

/* 11 — Get help over a live trip */
function HelpRow({ icon, t, s, danger }) {
  return <Row gap={12} style={{ minHeight: 60, borderTop: "1px solid var(--line)" }}>
    <IconDisc n={icon} s={40} tone={danger ? "danger" : "ok"} />
    <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: danger ? "var(--danger)" : "var(--ink)" }}>{t}</div><Muted s={12}>{s}</Muted></div>
    <AIc n="ChevronRight" s={18} c="var(--muted)" />
  </Row>;
}
const Scrim = () => <div style={{ position: "absolute", inset: 0, background: "rgba(20,24,27,.45)", zIndex: 40 }}></div>;
function Panel({ children, pad = "0 16px 12px" }) {
  return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 41, background: "var(--bg)", borderRadius: "16px 16px 0 0", padding: pad }}><Grabber />{children}</div>;
}
function Help({ W, H }) {
  const ov = <><Scrim /><Panel>
    <H2>{A.helpT}</H2><Muted style={{ margin: "2px 0 8px" }}>{A.helpSub}</Muted>
    <HelpRow icon="Phone" t={A.emergency} s={A.emergencySub} danger />
    <HelpRow icon="Phone" t={A.support} s={A.supportSub} />
    <HelpRow icon="Share2" t={A.shareTrip} s={A.shareTripSub} />
    <HelpRow icon="CircleAlert" t={A.report} s={A.reportSub} />
    <div style={{ display: "flex", marginTop: 8 }}><GBtn ghost label={A.close} /></div>
  </Panel></>;
  return <Track W={W} H={H} stage="drop" overlay={ov} />;
}

/* 12 — no match: one-tap retry. v2: busy / fail (2.21) */
function Retry({ W, H, busy, fail }) {
  return <Live W={W} H={H} title={A.tNoRider} f={.26} map={{ dim: true }} ctaH={barH(2)}
    toast={fail ? retryToast(A.sendFail, barH(2) + 10) : null}
    cta={<Bar><GBtn label={A.sendAgainAt} icon="RefreshCw" loading={busy} /><GBtn ghost label={A.editOrder} icon="Pencil" disabled={busy} /></Bar>}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", paddingTop: 4 }}>
      <IconDisc n="Clock" />
      <H2>{A.noTook}</H2>
      <Muted s={14}>{A.noTookSub}</Muted>
    </div>
    <Row style={{ background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 14px" }}>
      <div style={{ flex: 1 }}><div style={lbl}>{A.suggested}</div><span style={{ fontSize: 28, fontWeight: 700, lineHeight: "34px" }} className="lynia-tabular">$3.86</span></div>
      <Muted s={12} style={{ textAlign: "right", maxWidth: 120 }}>{A.sugNote}</Muted>
    </Row>
    <Row gap={6} style={{ justifyContent: "center" }}><AIc n="Check" s={15} c="var(--accent-text)" /><Muted>{A.kept}</Muted></Row>
  </Live>;
}

/* 13 (v2 redraw, 2.20) — rider cancelled before pickup. The order is ALREADY reopened at the same price: it's a finding state with a reason line. */
function RiderCancelled({ W, H }) {
  return <Live W={W} H={H} title={A.tRiderCx} f={.3} map={{ rings: true }} ctaH={barH(2)}
    cta={<Bar><GBtn label={A.raiseTo} icon="Plus" /><GBtn ghost label={A.cancelReq} icon="X" /></Bar>}>
    <Row gap={12}><IconDisc n="Bike" s={40} /><div style={{ flex: 1 }}><H2>{A.riderCx}</H2><Muted>{A.riderCxSub}</Muted></div></Row>
    <div style={{ height: 1, background: "var(--line)" }}></div>
    <Row style={{ justifyContent: "space-between" }}><span style={{ fontSize: 15, fontWeight: 700 }}>{A.stillFinding}</span><Countdown t="1:24" /></Row>
    <Progress pct={93} />
    <Row style={{ background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 14px" }}>
      <div style={{ flex: 1 }}><div style={lbl}>{A.yourPrice}</div><span style={{ fontSize: 28, fontWeight: 700, lineHeight: "34px" }} className="lynia-tabular">$3.36</span></div>
      <Muted s={12} style={{ textAlign: "right", maxWidth: 130 }}>{A.fasterAt}</Muted>
    </Row>
  </Live>;
}

/* 14a · 14b — rate. v2: fail (2.24) keeps stars + tags */
function Rate({ W, H, low, fs, fail }) {
  return <Live W={W} H={H} fs={fs} title={A.tDelivered} f={.14} fS={.1} map={{ rider: { t: 1 } }} ctaH={barH(1)}
    toast={fail ? retryToast(A.rateFail, barH(1) + 10) : null}
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

/* v2: the stars always carry their word ("Good"), never icon-only */
const RatedLine = () => <Row gap={6}><Muted>{A.youRated}</Muted><Row gap={1}>{[1, 2, 3, 4, 5].map(i => <AIc key={i} n="Star" s={14} c={i <= 4 ? "var(--accent)" : "var(--line)"} fill={i <= 4 ? "var(--accent)" : "none"} />)}</Row><span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)" }}>{A.rl4}</span></Row>;

/* 15 — rated, undo, receipt */
function Rated({ W, H }) {
  return <Live W={W} H={H} title={A.tDelivered} f={.14} map={{ rider: { t: 1 } }} ctaH={barH(1)} cta={<Bar><GBtn label={A.home} /></Bar>}
    toast={<AToast text={A.rated} icon="CircleCheck" action={`${A.undo} · 0:09`} actionIcon="Undo2" bottom={barH(1) + 10} />}>
    <Row gap={12}><IconDisc n="CircleCheck" tone="ok" s={40} /><div><H2>{A.delivered}</H2><RatedLine /></div></Row>
    <Receipt />
  </Live>;
}

/* 16 / 2.26 — completed (opened later). v2: unrated (2.25) · receipt variants (2.27) */
function Completed({ W, H, unrated, rv }) {
  return <Live W={W} H={H} title={A.tComplete} f={.2} ctaH={barH(1)} cta={<Bar><GBtn label={A.sendAgain} icon="RefreshCw" /></Bar>}>
    <div><H2>Delivered Tue 30 Sep, 09:31</H2>{unrated ? null : <RatedLine />}</div>
    {unrated ? <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
      <Row><Avatar i="TM" photo s={36} /><div><div style={{ fontSize: 15, fontWeight: 700 }}>{A.rateLater}</div><Muted s={12}>{A.rateLaterSub}</Muted></div></Row>
      <div style={{ marginLeft: -6 }}><Stars n={0} s={32} /></div>
    </div> : null}
    <Receipt {...(rv || {})} />
    <TextLink label={A.getHelp} icon="LifeBuoy" center />
  </Live>;
}

/* 17 — not delivered. v2: reason r (1–4) + tries (2.29) */
function NotDelivered({ W, H, r = 1, tries = 3, fs }) {
  return <Live W={W} H={H} fs={fs} title={A.tNotDel} f={.22} fS={.16} map={{ rider: { t: .92 } }} ctaH={barH(2)}
    cta={<Bar><GBtn label={A.callRider} icon="Phone" /><GBtn ghost label={A.sendAgain} icon="RefreshCw" /></Bar>}>
    <Row gap={12}><IconDisc n="CircleAlert" tone="danger" s={40} /><H2>{A.notDel}</H2></Row>
    <div style={{ background: "var(--surface)", borderRadius: "var(--radius-input)", padding: "10px 14px" }}><div style={lbl}>{A.notDelReason}</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 2, lineHeight: "20px" }}>{A["nr" + r]} · {tries === 1 ? A.tries1 : `${tries} ${A.triesN}`}</div></div>
    <Muted s={14}>{A["nb" + r]}</Muted>
    <RiderCard buttons={false} />
  </Live>;
}

/* 18 — cancelled by you / rider / LyniaGo. v2: noReason (2.30) · lynia "specific" | "generic" (2.31) */
function Cancelled({ W, H, who = "you", noReason, ly = "default" }) {
  const lyR = { default: A.cxLyniaR, specific: A.cxLyniaSpecific, generic: null }[ly];
  const t = { you: [A.cxYou, noReason ? null : A.cxYouR], rider: [A.cxRider, A.cxRiderR], lynia: [A.cxLynia, lyR] }[who];
  const isLy = who === "lynia";
  return <Live W={W} H={H} title={A.tCancelled} f={.3} map={{ dim: true }} ctaH={barH(isLy ? 2 : 1)}
    cta={<Bar><GBtn label={A.sendAgain} icon="RefreshCw" />{isLy ? <GBtn ghost label={S.call} icon="Phone" /> : null}</Bar>}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", paddingTop: 4 }}>
      <IconDisc n="Ban" />
      <H2>{t[0]}</H2>
      {t[1] ? <Muted s={14}><b style={{ color: "var(--ink)" }}>{A.reasonP}:</b> {t[1]}</Muted> : null}
      {isLy && ly === "specific" ? <Muted s={14}>{A.cxLyniaGeneric}</Muted> : null}
      {isLy && ly === "generic" ? <Muted s={14}>{A.cxLyniaGeneric}</Muted> : null}
    </div>
    {isLy ? null : <Row gap={6} style={{ justifyContent: "center" }}><AIc n="Banknote" s={15} c="var(--muted)" /><Muted>{A.nothingOwed}</Muted></Row>}
  </Live>;
}

Object.assign(window, { Live, Row, Stop, InkBanner, OkNote, retryToast, Scrim, Panel, HelpRow, Finding, Offers, Track, Handoff, Cancel, Help, Retry, RiderCancelled, Rate, Rated, RatedLine, Completed, NotDelivered, Cancelled });
