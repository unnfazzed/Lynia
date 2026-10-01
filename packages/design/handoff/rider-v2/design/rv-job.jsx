/* Rider v2 — the active job (rider-side mirror of After Send) + exceptions. */
function JobShell({ W, H, title, help = true, mapStage, sheetH, barHt, bar, children, over, toast, paused }) {
  const sheetTop = Math.max(RHDR + 96, H - barHt - sheetH);
  return <AFrame W={W} H={H}>
    <AHeader title={title} help={help} />
    {mapStage ? <JobMap W={W} sheetTop={sheetTop} stage={mapStage} paused={paused} /> : null}
    <Sheet top={sheetTop} ctaH={barHt}>{children}</Sheet>
    {toast}
    {bar}
    {over}
  </AFrame>;
}
const B1 = 74, B1h = 100;

/* Parcel — stage: toPickup | verify | verifyDone | toDrop | offline | offlineLong | restored | helpSent */
function ParcelJob({ W, H, stage = "toPickup", over }) {
  const pick = stage === "toPickup" || stage === "verify" || stage === "verifyDone";
  if (stage === "verify" || stage === "verifyDone") {
    const ok = stage === "verifyDone";
    return <JobShell W={W} H={H} title={R.tAtPickup} mapStage="atA" sheetH={372} barHt={ok ? B1 : B1h}
      bar={<RBar hint={ok ? null : R.needPhoto}><GBtn label={R.collectedCta} disabled={!ok} /></RBar>}>
      <RSteps cur={0} />
      <div style={{ fontSize: 18, fontWeight: 700 }}>{R.checkItems}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, border: "1px solid var(--line)", borderRadius: 12, padding: "0 12px" }}>
        <span style={{ width: 26, height: 26, borderRadius: 6, background: ok ? "var(--accent-text)" : "var(--bg)", border: ok ? "none" : "2px solid var(--line)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>{ok ? <AIc n="Check" s={16} c="#fff" sw={3} /> : null}</span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{R.item1}</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--line)", borderRadius: 12, padding: 10 }}>
        <span style={{ width: 56, height: 56, borderRadius: 8, flex: "none", background: ok ? "repeating-linear-gradient(45deg, var(--surface) 0 5px, var(--line) 5px 6px)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n={ok ? "Image" : "Camera"} s={22} c="var(--muted)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{ok ? R.photoSaved : R.photoNeed}</div><Muted s={12}>{R.photoNeedB}</Muted></div>
        <SmBtn label={ok ? R.retake : R.takePhoto} icon="Camera" kind={ok ? "ghost" : "fill"} />
      </div>
      <ProblemLink />
    </JobShell>;
  }
  const notice = { offline: <Notice icon="WifiOff" text={R.offlineJob} />, offlineLong: <Notice icon="WifiOff" tone="warn" text={R.offlineLong} />, restored: <Notice icon="History" text={R.restored} style={{ background: "var(--accent-wash)", border: "none" }} /> }[stage];
  return <JobShell W={W} H={H} title={pick ? R.tToPickup : R.tToDrop} mapStage={pick ? "pickup" : "drop"} sheetH={notice ? 410 : 340} barHt={B1} over={over}
    toast={stage === "helpSent" ? <AToast text={R.helpSent} icon="Check" bottom={B1 + 10} /> : null}
    bar={<RBar><GBtn label={pick ? R.atPickupCta : R.atDropCta} /></RBar>}>
    {notice}
    <RSteps cur={pick ? 0 : 2} />
    {pick ? <StopCard k="a" name={RD.jobs[0].a} who={R.sender} dist={R.away4} /> : <StopCard k="b" name={RD.jobs[0].b} who={R.recipient} dist={R.away12} />}
    <CashLine text={R.cashParcel} />
    <ProblemLink />
  </JobShell>;
}

/* Pickup photo — mode: camera | preview | uploading | failed */
function PickupPhoto({ W, H, mode = "camera" }) {
  const barHt = B1 + 60;
  if (mode === "failed") return <ParcelJob W={W} H={H} stage="verifyDone" />;
  return <AFrame W={W} H={H}>
    <AHeader title={R.tPhoto} />
    <div style={{ position: "absolute", left: 0, right: 0, top: RHDR, bottom: mode === "camera" ? 0 : barHt, background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "78%", aspectRatio: "4/3", borderRadius: 12, background: "repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 8px, rgba(255,255,255,.12) 8px 9px)", border: mode === "camera" ? "2px dashed rgba(255,255,255,.6)" : "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>{mode === "camera" ? "camera viewfinder" : "parcel photo"}</div>
      {mode === "camera" ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span style={{ width: 72, height: 72, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,.4)", backgroundClip: "padding-box", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}><AIc n="Camera" s={28} c="var(--ink)" /></span>
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{R.takePhoto}</span>
        <span style={{ color: "#fff", fontSize: 12, opacity: .85, padding: "0 24px", textAlign: "center" }}>{R.photoNeedB}</span>
      </div> : null}
    </div>
    {mode === "camera" ? null : <RBar><GBtn label={mode === "uploading" ? R.photoUploading : R.usePhoto} loading={mode === "uploading"} icon="Check" /><GBtn ghost label={R.retake} icon="Camera" disabled={mode === "uploading"} /></RBar>}
  </AFrame>;
}

/* Hand-off code — mode: typing | wrong | last | locked | offline ; food adds cash split */
function CodeEntry({ W, H, mode = "typing", food }) {
  const locked = mode === "locked", kb = locked ? 0 : 216;
  const barHt = locked ? B1h : B1;
  return <AFrame W={W} H={H}>
    <AHeader title={R.tArriving} help />
    <Body top={RHDR} bottom={kb + barHt} pad="14px 16px 16px" gap={12}>
      <RSteps cur={2} />
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px", textWrap: "pretty" }}>{locked ? R.lockedT : food ? "Ask Nyasha for the delivery code" : R.codeT}</div>
      <Muted s={14} style={{ marginTop: -6 }}>{locked ? R.lockedB : R.codeB}</Muted>
      <CodeBoxes W={W} digits={mode === "typing" ? "4182" : "418299"} err={mode === "wrong" || mode === "last"} locked={locked} />
      {mode === "wrong" ? <Err text={R.triesLeft} /> : mode === "last" ? <Err text={R.triesLast} /> : null}
      {mode === "offline" ? <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", fontSize: 13, color: "var(--muted)" }}><AIc n="WifiOff" s={14} c="var(--muted)" />{R.offlineCode}</div> : null}
      {food ? <CashSplit title={R.collectFood} /> : <CashLine text={R.cashParcel} />}
    </Body>
    <RBar bottom={kb} hint={locked ? R.newCodeWait : null}>{locked ? <GBtn label={R.askResend} icon="Phone" /> : <GBtn label={R.confirmCta} disabled={mode === "typing"} />}</RBar>
    {locked ? null : <Numpad W={W} />}
  </AFrame>;
}

function Done({ W, H, food }) {
  return <AFrame W={W} H={H}>
    <AHeader title={R.tDone} />
    <Body top={RHDR} bottom={B1} pad="20px 16px 24px" gap={14}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}><IconDisc n="CircleCheck" tone="ok" s={64} /><div style={{ fontSize: 22, fontWeight: 700 }}>{R.doneT}</div></div>
      <div style={{ background: "var(--accent-wash)", borderRadius: 16, padding: "12px 16px", display: "flex", alignItems: "baseline" }}><span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}>{R.doneEarn}</span><span style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-text)" }} className="lynia-tabular">+$3.20</span></div>
      <div style={{ padding: "0 4px" }}>
        <KV k={R.doneCash} v="$3.20" />
        {food ? <KV k={R.lReturned} v="$12.50" /> : null}
        <KV k={R.doneComm} v="−$0.32" />
      </div>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{food ? "How was Nyasha?" : R.rateSender}</div><Stars n={0} s={32} /><Muted s={12}>{A.optional}</Muted>
      </div>
    </Body>
    <RBar><GBtn label={R.nextJobs} /></RBar>
  </AFrame>;
}

/* Food — stage: toKitchen | atKitchen | toCustomer | returnCash */
function FoodJob({ W, H, stage = "toKitchen", over }) {
  if (stage === "returnCash") return <AFrame W={W} H={H}>
    <AHeader title={R.tReturn} help />
    <div style={{ position: "absolute", left: 0, right: 0, top: RHDR, bottom: B1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 20px", textAlign: "center" }}>
      <IconDisc n="Banknote" s={72} /><div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px" }}>{R.returnT}</div><div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{R.returnB}</div>
      <div style={{ alignSelf: "stretch", textAlign: "left" }}><CashSplit title={R.cashNow} /></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink)" }}><ASpin c="var(--accent-text)" s={14} />{R.returnWait}</div>
    </div>
    <RBar><GBtn ghost label={R.callKitchen} icon="Phone" /></RBar>
  </AFrame>;
  const kit = stage !== "toCustomer";
  const steps = [R.stPickup, R.stCollected, R.stDrop, R.stDone];
  if (stage === "atKitchen") return <JobShell W={W} H={H} title={R.tAtKitchen} mapStage="atA" sheetH={360} barHt={B1} bar={<RBar><GBtn label={R.paidCta} /></RBar>}>
    <RSteps cur={0} labels={steps} />
    <StopCard k="a" name={R.foodFrom} who={R.kitchenReady} here food={R.food} />
    <div style={{ border: "1.5px solid var(--ink)", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}><AIc n="Banknote" s={20} c="var(--ink)" /><span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{R.payNow}</span></div>
    <Muted>{R.collectFoodB}</Muted>
    <ProblemLink />
  </JobShell>;
  return <JobShell W={W} H={H} title={kit ? R.tToKitchen : R.tToDrop} mapStage={kit ? "pickup" : "drop"} sheetH={kit ? 330 : 380} barHt={B1} over={over}
    bar={<RBar><GBtn label={kit ? R.atKitchenCta : R.atDropCta} /></RBar>}>
    <RSteps cur={kit ? 0 : 2} labels={steps} />
    {kit ? <StopCard k="a" name={R.foodFrom} who={R.kitchenReady} dist={R.away4} food={R.food} /> : <StopCard k="b" name={R.foodTo} who={R.customer} dist={R.away12} food={R.food} />}
    {kit ? <CashLine text={R.payKitchenB} /> : <CashSplit title={R.collectFood} />}
    <ProblemLink />
  </JobShell>;
}

/* Problem sheet (also opened by the header Help pill). pickup = before collection (cancel/drop available). */
function ProblemSheet({ W, H, pickup, food }) {
  const rows = pickup ? [["XCircle", food ? R.pDrop : R.pCancel, food ? R.pDropS : R.pCancelS]] : [["PhoneOff", R.pReach, R.pReachS], ["Package", R.pDeliver, R.pDeliverS]];
  const over = <MSheet title={R.probT} body={R.probSub}>
    <Card>{[...rows, ["MessageCircle", R.pHelp, R.pHelpS], ["Flag", R.pReport, R.pReportS]].map(([ic, l, s], i) => <Row key={l} first={i === 0} icon={ic === "XCircle" ? "X" : ic === "Flag" ? "TriangleAlert" : ic} label={l} sub={s} />)}</Card>
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, background: "var(--danger-wash)", borderRadius: 12, padding: "8px 12px" }}><AIc n="Siren" s={22} c="var(--danger-ink)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger-ink)" }}>{R.sos}</div><div style={{ fontSize: 12, color: "var(--danger-ink)" }}>{R.sosS}</div></div><AIc n="ChevronRight" s={18} c="var(--danger-ink)" /></div>
    <GBtn ghost label={R.close} />
  </MSheet>;
  return food ? <FoodJob W={W} H={H} stage={pickup ? "toKitchen" : "toCustomer"} over={over} /> : <ParcelJob W={W} H={H} stage={pickup ? "toPickup" : "toDrop"} over={over} />;
}

function CantReach({ W, H }) {
  return <JobShell W={W} H={H} title={R.tArriving} mapStage="at" sheetH={380} barHt={B1h} bar={<RBar hint={R.undelHint}><GBtn ghost danger label={R.markUndel} disabled /></RBar>}>
    <RSteps cur={2} />
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}><IconDisc n="PhoneOff" s={48} /><H2 style={{ flex: 1 }}>{R.reachT}</H2></div>
    <Muted s={14}>{R.reachB}</Muted>
    <div style={{ background: "var(--surface)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 13, fontWeight: 600 }} className="lynia-tabular"><span style={{ flex: 1 }}>{R.reachWait}</span><span style={{ color: "var(--muted)", fontWeight: 400 }}>{R.reachCalls}</span></div><Progress pct={66} />
    </div>
    <div style={{ display: "flex", gap: 8 }}><SmBtn flex={1} kind="fill" label={R.call} icon="Phone" /><SmBtn flex={1} label={R.whatsapp} icon="MessageCircle" /></div>
  </JobShell>;
}
function Undelivered({ W, H }) {
  return <ParcelJob W={W} H={H} stage="toDrop" over={<MSheet title={R.undelT}>
    <Tags list={[R.u1, R.u2, R.u3, R.u4, R.u5]} on={[0]} />
    <Notice icon="Package" text={R.undelNext} />
    <GBtn label={R.undelSend} />
  </MSheet>} />;
}
function Terminal({ W, H, icon, tone, title, body, note, primary, ghost }) {
  const n = ghost ? 2 : 1, barHt = 22 + n * 52 + (n - 1) * 8;
  return <AFrame W={W} H={H}>
    <AHeader title={title.length > 22 ? R.tDone : title} />
    <div style={{ position: "absolute", left: 0, right: 0, top: RHDR, bottom: barHt, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 24px", textAlign: "center" }}>
      <IconDisc n={icon} tone={tone} s={72} /><div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px" }}>{title}</div><div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{body}</div>
      {note ? <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><AIc n="ShieldCheck" s={16} c="var(--accent-text)" />{note}</div> : null}
    </div>
    <RBar>{primary}{ghost}</RBar>
  </AFrame>;
}
function CancelSheet({ W, H, final, food }) {
  const over = food ? <MSheet title={R.dropT} body={R.dropB} buttons={<><GBtn label={R.cxKeep} /><GBtn ghost danger label={R.dropYes} /></>} />
    : <MSheet title={R.cxT} body={R.cxB} buttons={<><GBtn label={R.cxKeep} /><GBtn ghost danger label={final ? R.cxYesFinal : R.cxYes} /></>}>
      {final ? <div style={{ background: "var(--danger-wash)", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "var(--danger-ink)" }}><AIc n="TriangleAlert" s={18} c="var(--danger-ink)" />{R.cxFinal}</div>
        : <Notice icon="CircleAlert" text={R.cxStrike} />}
    </MSheet>;
  return food ? <FoodJob W={W} H={H} stage="toKitchen" over={over} /> : <ParcelJob W={W} H={H} stage="toPickup" over={over} />;
}
function SosConfirm({ W, H }) {
  return <ParcelJob W={W} H={H} stage="toDrop" over={<MSheet icon="Siren" iconTone="danger" title={R.sosT} body={R.sosB} buttons={<>
    <div style={{ height: 52, borderRadius: "var(--radius-pill)", background: "var(--danger)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 700 }}><AIc n="Phone" s={18} c="#fff" />{R.sosCall}</div>
    <GBtn ghost label={R.sosCancel} /></>} />} />;
}

Object.assign(window, { JobShell, ParcelJob, PickupPhoto, CodeEntry, Done, FoodJob, ProblemSheet, CantReach, Undelivered, Terminal, CancelSheet, SosConfirm });
