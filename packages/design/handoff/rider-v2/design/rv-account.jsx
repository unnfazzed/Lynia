/* Rider v2 — Account (rider + customer siblings), role switch, history, Settings, Bike & documents, Help. */
function RiderAccount({ W, H, risk, offset = 0, over }) {
  return <AFrame W={W} H={H}>
    <MintTop W={W} />
    <Body offset={offset}>
      <IdentityCard />
      <Seg opts={[R.sideCustomer, R.sideRider]} on={1} icons={["ShoppingBag", "Bike"]} />
      <Muted s={12} style={{ textAlign: "center", marginTop: -4 }}>{R.switchHint}</Muted>
      <Standing risk={risk} />
      <Card>{[["History", R.rJobHist, R.rJobHistS], ["Bell", R.rNotif, null, R.rNotifS], ["MessageCircle", R.rHelp, R.rHelpS], ["Settings", R.rSettings, R.rSettingsS]].map(([ic, l, s, v], i) => <Row key={l} first={i === 0} icon={ic} label={l} sub={s} value={v} tone={v ? "ok" : null} />)}</Card>
    </Body>
    <TabBar tab={2} />
    {over}
  </AFrame>;
}
/* state: rider | none | progress | review | failed | verified */
function BecomeCard({ state }) {
  const d = { none: ["Bike", "ok", R.becomeT, R.becomeB, R.startKyc], progress: ["IdCard", "ok", R.kycProgT, R.kycProgB, R.continueKyc], review: ["Hourglass", "calm", R.kycReviewT, R.kycReviewB], failed: ["IdCard", "danger", R.kycFailT, R.kycFailB, R.tryKyc] }[state];
  return <div style={{ borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10, background: state === "none" || state === "progress" ? "var(--accent-wash)" : "var(--bg)", border: state === "failed" ? "1px solid var(--danger)" : state === "review" ? "1px solid var(--line)" : "none" }}>
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", border: d[1] === "danger" ? "1.5px solid var(--danger)" : "none", boxSizing: "border-box" }}><AIc n={d[0]} s={22} c={d[1] === "danger" ? "var(--danger)" : d[1] === "ok" ? "var(--accent-text)" : "var(--muted)"} /></span>
      <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 700, lineHeight: "22px" }}>{d[2]}</div><div style={{ fontSize: 13, lineHeight: "19px", color: "var(--ink)", marginTop: 2, textWrap: "pretty" }}>{d[3]}</div></div></div>
    {state === "progress" ? <Progress pct={66} /> : null}
    {d[4] ? <div style={{ display: "flex" }}><SmBtn kind="fill" flex={1} label={d[4]} icon="ArrowRight" /></div> : null}
  </div>;
}
function CustomerAccount({ W, H, state = "rider" }) {
  const toggle = state === "rider" || state === "verified";
  return <AFrame W={W} H={H}>
    <MintTop W={W} customer loc="12 Samora Machel Ave" />
    <Body>
      <IdentityCard customer />
      {toggle ? <><Seg opts={[R.sideCustomer, R.sideRider]} on={0} icons={["ShoppingBag", "Bike"]} />
        {state === "verified" ? <Notice icon="CircleCheck" text={R.kycOkT + ". " + R.kycOkB} style={{ background: "var(--accent-wash)", border: "none" }} /> : <Muted s={12} style={{ textAlign: "center", marginTop: -4 }}>{R.switchHint}</Muted>}</> : <BecomeCard state={state} />}
      <Card>{[["Receipt", R.rTripHist, R.rTripHistS], ["Bell", R.rNotif, null, R.rNotifS], ["MessageCircle", R.rHelp, R.rHelpS], ["Settings", R.rSettings, R.rSettingsC]].map(([ic, l, s, v], i) => <Row key={l} first={i === 0} icon={ic} label={l} sub={s} value={v} tone={v ? "ok" : null} />)}</Card>
    </Body>
    <TabBar tab={2} customer />
  </AFrame>;
}
function SwitchSheet({ W, H, active }) {
  return <RiderAccount W={W} H={H} over={active
    ? <MSheet icon="Package" iconTone="ok" title={R.swJobT} body={R.swJobB} buttons={<><GBtn label={R.swGo} icon="ArrowLeftRight" /><GBtn ghost label={R.swJobBack} /></>} />
    : <MSheet icon="ArrowLeftRight" title={R.swT} body={R.swB} buttons={<><GBtn label={R.swGo} /><GBtn ghost label={R.swStay} /></>} />} />;
}

function PushHeader({ title }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 20, background: "var(--bg)" }}><RStatus />
    <div style={{ height: 52, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 8px", borderBottom: "1px solid var(--line)" }}><span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="ChevronDown" s={22} c="var(--accent-text)" rot={90} />{A.back}</span><span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span><span></span></div></div>;
}
function JobHistory({ W, H }) {
  const rows = [["Package", "Eastgate → Glenara Ave", "Delivered · 09:31", "+$3.20"], ["Utensils", "Mama's Kitchen → Avondale", "Delivered · 08:50", "+$2.80"]];
  const y = [["Package", "Fife Ave → Belgravia", "Delivered · 17:40", "+$2.50"], ["Package", "Copacabana → Mbare", "You cancelled · 16:05 · strike", "No fare"], ["Package", "Avondale → Mt Pleasant", "Undelivered · 12:20", "+$1.50"], ["Utensils", "Sam's Grill → Borrowdale", "Delivered · 11:02", "+$3.60"]];
  return <AFrame W={W} H={H}>
    <PushHeader title={R.tJobHist} />
    <Body top={RHDR} bottom={0}>
      <div style={{ background: "var(--accent-wash)", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "var(--accent-text)" }} className="lynia-tabular">{R.histWeek}</div>
      <Chips list={[R.all, R.parcels, R.foodF]} />
      <div><Lbl style={{ fontSize: 11 }}>{R.todayH}</Lbl>{rows.map((r, i) => <LRow key={i} first={i === 0} icon={r[0]} title={r[1]} meta={r[2]} amt={r[3]} />)}</div>
      <div><Lbl style={{ fontSize: 11 }}>{R.yesterday}</Lbl>{y.map((r, i) => <LRow key={i} first={i === 0} icon={r[0]} title={r[1]} meta={r[2]} amt={r[3]} />)}</div>
    </Body>
  </AFrame>;
}
function TripHistory({ W, H }) {
  const rows = [["Package", "Eastgate Mall → 14 Glenara Ave", "Delivered · 30 Sep", "$3.36"], ["Utensils", "Mama's Kitchen · 2 items", "Delivered · 28 Sep", "$15.70"], ["Package", "Fife Ave → Belgravia", "Cancelled · 21 Sep · nothing paid", "$0.00"], ["Package", "Avondale Shops → Mt Pleasant", "Delivered · 14 Sep", "$4.00"]];
  return <AFrame W={W} H={H}>
    <PushHeader title={R.tTripHist} />
    <Body top={RHDR} bottom={0}><div>{rows.map((r, i) => <LRow key={i} first={i === 0} icon={r[0]} title={r[1]} meta={r[2]} amt={r[3]} />)}</div></Body>
  </AFrame>;
}

/* who: rider | customer · offset scrolls · off = notifications + location off */
function Settings({ W, H, who = "rider", offset = 0, off }) {
  const rider = who === "rider";
  const sec = (t) => <Lbl style={{ margin: "6px 4px -4px" }}>{t}</Lbl>;
  return <AFrame W={W} H={H}>
    <PushHeader title={R.tSettings} />
    <Body top={RHDR} bottom={0} offset={offset}>
      {sec(R.secAccount)}
      <Card>
        <Row first icon="User" label="Tendai Moyo" sub="+263 77 245 1180" chev={false} />
        <Row icon="Globe" label={R.sLang} value={R.sLangV} />
        <Row icon="FileText" label={R.sPrivacy} /><Row icon="FileText" label={R.sTerms} />
      </Card>
      {sec(R.secCustomer)}
      <Card>
        <Row first icon="Banknote" label={R.sPay} value={R.sPayV} chev={false} />
        <Row icon="Bell" label={R.sNotifC} value={off ? R.sOff : R.sOn} sub={off ? R.sNotifCOff : null} tone={off ? "warn" : null} />
      </Card>
      {rider ? <>{sec(R.secRider)}
        <Card>
          <Row first icon="Volume2" label={R.sAlerts} value={off ? R.sOff : R.sOn} tone={off ? "warn" : "ok"} sub={R.sAlertsS} chev={false}>
            {off ? <div style={{ marginTop: 8, background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 10, padding: "8px 10px", fontSize: 13, fontWeight: 600, lineHeight: "18px" }}>{R.sAlertsOff}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>{off ? <SmBtn kind="fill" flex={1} label={R.sOpenSettings} icon="Settings" /> : <><SmBtn flex={1} label={R.testPing} icon="Bell" /><SmBtn flex={1} label={R.testAlarm} icon="Volume2" /></>}</div>
          </Row>
          <Row icon="MapPin" label={R.sLoc} value={off ? R.sOff : R.sLocV} tone={off ? "warn" : null} sub={off ? null : R.sLocS}>
            {off ? <div style={{ marginTop: 8, background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 10, padding: "8px 10px", fontSize: 13, fontWeight: 600, lineHeight: "18px" }}>{R.sLocOff}</div> : null}
          </Row>
          <Row icon="Navigation" label={R.sNav} sub={R.sNavS} chev={false}><div style={{ marginTop: 8 }}><Seg opts={[R.gmaps, R.waze]} on={0} h={44} /></div></Row>
          <Row icon="Smartphone" label={R.sTopNum} sub={R.sTopNumV} />
          <Row icon="IdCard" label={R.sBike} sub={R.sBikeS} value={R.sBikeV} tone="ok" />
        </Card></> : null}
      <Card style={{ marginTop: 8 }}>
        <Row first icon="LogOut" label={R.sSignOut} chev={false} />
        <Row icon="Trash2" label={R.sDelete} sub={R.sDeleteS} danger chev={false} />
      </Card>
    </Body>
  </AFrame>;
}

function BikeDocs({ W, H }) {
  return <AFrame W={W} H={H}>
    <PushHeader title={R.tBike} />
    <Body top={RHDR} bottom={B1}>
      <Card>
        <Row first icon="IdCard" label={R.docId} sub={R.docIdV} tone="ok" value={R.verified} />
        <Row icon="User" label={R.docPhoto} sub={R.docPhotoV} tone="ok" value={R.verified} />
        <Row icon="Bike" label={R.docBike} sub={R.docBikeV} tone="ok" value={R.verified} />
        <Row icon="FileText" label={R.docLic} sub={R.docLicV} tone="warn" value="60 days" />
      </Card>
      <div style={{ border: "1px solid var(--danger)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: "19px" }}><AIc n="TriangleAlert" s={18} c="var(--danger)" />{R.docSoon}</div>
        <div style={{ display: "flex" }}><SmBtn flex={1} label={R.updatePhoto} icon="Camera" /></div>
      </div>
      <Muted s={13}>{R.bikeChange}</Muted>
    </Body>
    <RBar><GBtn ghost label={R.reverifyBike} icon="Camera" /></RBar>
  </AFrame>;
}
function HelpScreen({ W, H }) {
  return <AFrame W={W} H={H}>
    <PushHeader title={R.tHelp} />
    <Body top={RHDR} bottom={0}>
      <Card><Row first icon="MessageCircle" tone="ok" label={R.hWa} sub={R.hWaS} /><Row icon="Phone" label={R.hCall} sub={R.hCallS} /></Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, background: "var(--danger-wash)", borderRadius: 16, padding: "8px 14px" }}><AIc n="Siren" s={22} c="var(--danger-ink)" /><div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger-ink)" }}>{R.hSafety}</div><div style={{ fontSize: 12, color: "var(--danger-ink)" }}>{R.hSafetyS}</div></div><AIc n="Phone" s={18} c="var(--danger-ink)" /></div>
      <Lbl style={{ margin: "6px 4px -4px" }}>{R.hFaq.toUpperCase()}</Lbl>
      <Card><Row first label={R.hF1} /><Row label={R.hF2} /><Row label={R.hF3} /></Card>
    </Body>
  </AFrame>;
}
Object.assign(window, { RiderAccount, CustomerAccount, BecomeCard, SwitchSheet, PushHeader, JobHistory, TripHistory, Settings, BikeDocs, HelpScreen });
