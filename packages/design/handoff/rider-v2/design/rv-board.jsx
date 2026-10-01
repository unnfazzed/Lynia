/* Rider v2 — Jobs board, make an offer, gates, food offer. */
function Board({ W, H, mode = "default" }) {
  const foodOff = mode === "foodOff" || mode === "emptyFoodOff";
  const empty = mode === "empty" || mode === "emptyFoodOff";
  const full = mode === "full";
  const sheetTop = full ? MT + 16 : empty ? Math.round(H * .44) : Math.round(H * .5);
  const conn = mode === "stale" ? "re" : "on";
  const offers = mode === "offers" || mode === "withdrawn";
  const toast = { notChosen: R.notChosen, taken: R.taken, bidExpired: R.bidExpired, withdrawn: R.withdrawn }[mode];
  return <AFrame W={W} H={H}>
    <MintTop W={W} conn={conn} loc="Samora Machel Ave" />
    <BoardMap W={W} top={MT} h={sheetTop - MT + 18} jobs={empty ? [] : mode === "taken" ? RD.jobs.slice(1) : RD.jobs} sel={empty || mode === "taken" ? -1 : 0} quiet={false} />
    <Sheet top={sheetTop} ctaH={TAB}>
      {empty ? <>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><IconDisc n="Inbox" s={48} /><div style={{ flex: 1 }}><H2>{R.emptyT}</H2></div></div>
        <Muted s={14}>{R.emptyB}{foodOff ? "" : " " + R.emptyFood}</Muted>
        <div style={{ background: "var(--surface)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{R.whyQuiet}</div><div style={{ fontSize: 13, lineHeight: "19px" }}>{R.whyQuietB}</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><AIc n="MapPin" s={16} c="var(--accent-text)" />{R.busyLine}</div>
      </> : <>
        {mode === "notifOff" ? <div style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--danger)", borderRadius: 12, padding: "6px 6px 6px 12px" }}><AIc n="Bell" s={18} c="var(--danger)" /><span style={{ flex: 1, fontSize: 13, lineHeight: "18px", fontWeight: 600 }}>{R.notifOff}</span><SmBtn kind="fill" label={R.turnOn} /></div> : null}
        {mode === "stale" ? <Notice icon="WifiOff" text={R.staleB} /> : null}
        {mode === "loadFail" ? <Notice icon="WifiOff" text={R.loadFail} /> : null}
        {offers ? <><Lbl>{R.yourOffers}</Lbl>{mode === "withdrawn" ? null : <JobCard j={RD.jobs[0]} offer />}<Lbl style={{ marginTop: 4 }}>{R.nearbyJobs}</Lbl></> : null}
        {offers ? null : <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{mode === "taken" ? "3 parcels near you" : R.nearYou}</span><span style={{ fontSize: 12, color: "var(--muted)" }}>{R.nearest}</span></div>}
        {offers || mode === "loadFail" ? null : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><AIc n="MapPin" s={15} c="var(--accent-text)" />{R.busyLine}</div>
          {foodOff ? null : <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}><AIc n="Utensils" s={15} c="var(--muted)" />{R.foodRings}</div>}
        </div>}
        {mode === "loadFail" ? <><Skel /><Skel /></> : <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: mode === "stale" ? .6 : 1 }}>
          {(mode === "taken" || offers ? RD.jobs.slice(1) : RD.jobs).map((j, i) => <JobCard key={j.id} j={j} sel={i === 0 && !offers && mode !== "taken"} />)}
        </div>}
      </>}
    </Sheet>
    {toast ? <AToast text={toast} icon={mode === "withdrawn" ? "Check" : "CircleAlert"} action={mode === "withdrawn" ? R.undo : null} actionIcon="Undo2" bottom={TAB + 10} /> : null}
    <TabBar tab={0} />
    {mode === "picked" ? <MSheet icon="CircleCheck" iconTone="ok" title={R.picked} body={R.pickedB} buttons={<GBtn label={R.openJob} icon="ArrowRight" />} /> : null}
  </AFrame>;
}

function RRoute() {
  return <div style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--line)", borderRadius: 12, padding: 6 }}>
    <div style={{ width: 64, height: 56, position: "relative", borderRadius: 8, overflow: "hidden", flex: "none" }}><MapBox W={64} H={56} a={[.22, .3]} b={[.78, .72]} route labels={false} /></div>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
      <Stop k="a" name={RD.jobs[0].a} s={13} /><Stop k="b" name={RD.jobs[0].b} s={13} />
      <span style={{ fontSize: 12, color: "var(--muted)" }} className="lynia-tabular">0.8 km {R.toPickup} · 3.1 km {R.trip}</span>
    </div>
  </div>;
}
/* mode: default | over | sending | fail */
function Offer({ W, H, mode = "default" }) {
  const sm = W < 340, val = mode === "over" ? 6.0 : 3.2, pos = (v) => Math.min(1, Math.max(0, v / 7));
  const barHt = 22 + 52 * 2 + 8;
  return <AFrame W={W} H={H}>
    <AHeader title={R.tOffer} />
    <Body top={RHDR} bottom={barHt} pad="12px 16px 24px" gap={0}>
      <RRoute />
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>{R.senderAsking} <b style={{ color: "var(--ink)" }} className="lynia-tabular">$3.00</b></div>
        <div style={{ ...fieldLbl, fontSize: 15, marginTop: 6, marginBottom: 0 }}>{R.yourFare}</div>
        <span className="lynia-tabular" style={{ display: "inline-block", fontSize: sm ? 48 : 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-.02em", borderBottom: "2px dashed var(--line)" }}>${val.toFixed(2)}</span>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, display: "flex", gap: 4, alignItems: "center", justifyContent: "center" }}><AIc n="Pencil" s={12} c="var(--muted)" />{R.tapType}</div>
      </div>
      <div style={{ display: "flex", gap: 10, margin: "12px 0 16px" }}><GBtn ghost label={R.minus} /><GBtn ghost label={R.plus} /></div>
      <div style={{ position: "relative", height: 8, background: "var(--line)", borderRadius: 4, margin: "0 6px 10px" }}>
        <div style={{ position: "absolute", left: pos(2.8) * 100 + "%", width: (pos(3.6) - pos(2.8)) * 100 + "%", top: 0, bottom: 0, background: "var(--accent)", borderRadius: 4 }}></div>
        <div style={{ position: "absolute", left: pos(val) * 100 + "%", top: -5, width: 18, height: 18, marginLeft: -9, borderRadius: "50%", background: "var(--ink)", border: "3px solid #fff", boxSizing: "border-box", boxShadow: "var(--shadow-card)" }}></div>
      </div>
      <div style={{ fontSize: 13, lineHeight: "18px", marginBottom: 12 }}>{R.band}</div>
      {mode === "over" ? <Notice icon="TriangleAlert" tone="warn" text={R.overB} style={{ marginBottom: 12 }} /> : null}
      <div style={{ ...fieldLbl }}>{R.thereIn}</div>
      <div style={{ display: "flex", gap: 8 }}>{[5, 10, 15, 20].map(m => <span key={m} style={{ flex: 1, height: 44, borderRadius: "var(--radius-pill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, boxSizing: "border-box", background: m === 10 ? "var(--accent-wash)" : "var(--bg)", border: m === 10 ? "1.5px solid var(--accent-text)" : "1px solid var(--line)", color: m === 10 ? "var(--accent-text)" : "var(--ink)", whiteSpace: "nowrap" }} className="lynia-tabular">{m} {R.min}</span>)}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: "16px" }}>{R.etaHint}</div>
      <Notice icon="CircleAlert" text={R.oneOffer} style={{ marginTop: 14 }} />
    </Body>
    {mode === "fail" ? <AToast text={R.sendFail} action={R.tryAgain} actionIcon="RefreshCw" bottom={barHt + 10} /> : null}
    <RBar>
      <GBtn label={mode === "sending" ? R.sending : mode === "over" ? "Send offer · $6.00" : R.sendOffer} loading={mode === "sending"} />
      <GBtn ghost label={R.skip} disabled={mode === "sending"} />
    </RBar>
  </AFrame>;
}

/* Gate definitions: [icon, tone, title, body, facts, factTone, primary, ghost, bridge] */
const GATES = {
  notRider: ["Bike", "ok", R.gNotRiderT, R.gNotRiderB, null, null, [R.becomeRider, "ArrowRight"], null, true],
  pending: ["Hourglass", "calm", R.gPendingT, R.gPendingB, [[R.gPendingK, R.gPendingV]], null, null, null, true],
  unfinished: ["IdCard", "calm", R.gUnfinishedT, R.gUnfinishedB, null, null, [R.finishId, "ArrowRight"], null, true],
  failed: ["IdCard", "danger", R.gFailedT, R.gFailedB, [[R.gFailedK, R.gFailedV]], null, [R.tryAgain, "Camera"], [R.whatsappSupport, "MessageCircle"]],
  failed2: ["IdCard", "danger", R.gFailed2T, R.gFailed2B, null, null, [R.whatsappSupport, "MessageCircle"], null, true],
  expired: ["IdCard", "danger", R.gExpiredT, R.gExpiredB, null, null, [R.reverify, "Camera"], null, true],
  cantOpen: ["WifiOff", "calm", R.gCantOpenT, R.gCantOpenB, null, null, [R.tryAgain, "RefreshCw"], [R.whatsappSupport, "MessageCircle"]],
  gps: ["MapPin", "danger", R.gGpsT, R.gGpsB, null, null, [R.openLoc, "Settings"], [R.gpsOn, "Check"]],
  area: ["MapPin", "calm", R.gAreaT, R.gAreaB, [[R.gAreaK, R.gAreaV]], null, null, null, true],
  cooldown: ["Clock", "calm", R.gCoolT, R.gCoolB, [[R.gCoolK, R.gCoolV]], null, null, [R.rJobHist, "History"], true],
  hold: ["CircleAlert", "danger", R.gHoldT, R.gHoldB, [[R.gHoldK, R.gHoldV]], "danger", [R.callSupport, "Phone"], null, true],
  suspended: ["Ban", "danger", R.gSuspT, R.gSuspB, [[R.gSuspK, R.gSuspV]], "danger", [R.callSupport, "Phone"], null, true],
  banned: ["Ban", "danger", R.gBanT, R.gBanB, null, null, null, [R.callSupport, "Phone"], true],
  topup: ["Wallet", "danger", R.gTopT, R.gTopB, [[R.gTopK, R.gTopV], [R.gTopK2, R.gTopV2]], "danger", [R.goTopUp, "Plus"], null],
  update: ["Download", "calm", R.gUpdateT, R.gUpdateB, null, null, [R.update, "Download"], null, false],
};
function GateScreen({ W, H, g }) {
  const d = GATES[g];
  return <Gate W={W} H={H} icon={d[0]} tone={d[1]} title={d[2]} body={d[3]} facts={d[4]} factTone={d[5]} primary={d[6]} ghost={d[7]} bridge={d[8]} tabless={g === "update"} />;
}

/* Food offer — mode: default | upfront | low | expired */
function FoodHeader() {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 20, background: "var(--bg)" }}><RStatus />
    <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderBottom: "1px solid var(--line)", fontSize: 16, fontWeight: 700 }}><AIc n="Utensils" s={17} c="var(--accent-text)" />{R.tFoodOffer}</div></div>;
}
function FoodOffer({ W, H, mode = "default" }) {
  if (mode === "expired") return <AFrame W={W} H={H}><FoodHeader />
    <div style={{ position: "absolute", left: 0, right: 0, top: RHDR, bottom: 74, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 24px", textAlign: "center" }}>
      <IconDisc n="Clock" s={72} /><div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px" }}>{R.expT}</div><div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{R.expB}</div>
    </div>
    <RBar><GBtn label={R.backBoard} /></RBar></AFrame>;
  const up = mode === "upfront", low = mode === "low";
  const barHt = 22 + 52 * 2 + 8 + 26, sheetTop = Math.round(H * (up ? (H < 700 ? .2 : .26) : .4));
  return <AFrame W={W} H={H}>
    <FoodHeader />
    <JobMap W={W} sheetTop={sheetTop} stage="pickup" />
    <Sheet top={sheetTop} ctaH={barHt}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Countdown t={low ? "0:08" : "0:42"} /><div style={{ flex: 1 }}><Progress pct={low ? 13 : 70} /></div></div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ alignSelf: "flex-start" }}><JTag t="food" /></span>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "26px" }}>{R.foodFrom}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">{R.foodMeta}</div>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}><div style={{ fontSize: 12, color: "var(--muted)" }}>{R.foodFare}</div><div style={{ fontSize: 28, fontWeight: 700, lineHeight: "34px" }} className="lynia-tabular">$3.20</div></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{up ? null : <Stop k="a" name={R.foodFrom} s={14} />}<Stop k="b" name={R.foodTo} s={14} /></div>
      {up ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>{[[R.payKitchen, "$12.50"], [R.collectDoor, "$15.70"]].map(([k, v]) => <div key={k} style={{ flex: 1, background: "var(--surface)", borderRadius: 12, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "var(--muted)" }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700 }} className="lynia-tabular">{v}</div></div>)}</div>
        <Muted>{R.payKitchenB}</Muted>
      </div> : null}
    </Sheet>
    <RBar hint={R.passHint}><GBtn label={R.accept} /><GBtn ghost label={R.pass} /></RBar>
  </AFrame>;
}

Object.assign(window, { Board, Offer, RRoute, GATES, GateScreen, FoodOffer, FoodHeader });
