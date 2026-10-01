/* Rider v2 — Money tab + Top up. */
const LEDGER = [
  ["Package", "Parcel · Eastgate → Avenues", "Fare · cash · 09:31", "+$3.20"],
  ["Wallet", "Commission · 10%", "From balance · 09:31", "−$0.32"],
  ["Utensils", "Food · Mama's Kitchen → Avondale", "Fare · cash · 08:50", "+$2.80", "food"],
  ["Wallet", "Commission · 10%", "From balance · 08:50", "−$0.28", "food"],
  ["Plus", "Top-up · EcoCash", "To balance · 08:02", "+$5.00"],
];
/* mode: default | week | foodOff | low | floor | owes | zero | empty | pendingOk | pendingWait | pendingFail */
function Money({ W, H, mode = "default", offset = 0 }) {
  const foodOff = mode === "foodOff", empty = mode === "empty", week = mode === "week";
  const bal = { low: "$2.40", floor: "$0.60", owes: "−$1.20" }[mode] || "$7.60";
  const danger = mode === "floor" || mode === "owes", low = mode === "low";
  const pend = { pendingOk: ["CircleCheck", R.pendingOk], pendingWait: ["Hourglass", R.pendingWait], pendingFail: ["CircleAlert", R.pendingFail] }[mode];
  const rows = LEDGER.filter(r => !(foodOff && r[4]));
  return <AFrame W={W} H={H}>
    <MintTop W={W} />
    <Body offset={offset}>
      {pend ? <Notice icon={pend[0]} text={pend[1]} style={mode === "pendingOk" ? { background: "var(--accent-wash)", border: "none" } : undefined} /> : null}
      <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <Lbl>{R.earnings}</Lbl>
        <Seg opts={[R.today, R.week]} on={week ? 1 : 0} h={44} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 40, fontWeight: 700, lineHeight: "46px", letterSpacing: "-.02em" }} className="lynia-tabular">{empty ? "$0.00" : week ? "$86.20" : "$18.40"}</span><span style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)" }}>{empty ? "0 jobs" : week ? R.jobs31 : R.jobs6}</span></div>
        {empty || foodOff ? null : <div style={{ display: "flex", gap: 8 }}>{[[week ? "26" : "5", R.parcels, "Package"], [week ? "5" : "1", R.foodF, "Utensils"]].map(([n, l, ic]) => <span key={l} style={{ flex: 1, height: 36, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", background: "var(--surface)", borderRadius: 10, fontSize: 13, fontWeight: 600 }} className="lynia-tabular"><AIc n={ic} s={15} c="var(--muted)" />{n} {l.toLowerCase()}</span>)}</div>}
        {week ? <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 56 }}>{[9.6, 14.2, 12.8, 0, 16.4, 14.8, 18.4].map((v, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}><span style={{ width: "100%", height: Math.max(2, v * 2.2), borderRadius: 4, background: i === 6 ? "var(--accent)" : "var(--accent-wash)" }}></span><span style={{ fontSize: 11, color: i === 6 ? "var(--ink)" : "var(--muted)", fontWeight: i === 6 ? 700 : 400 }}>{"MTWTFSS"[i]}</span></div>)}</div> : null}
        <Muted s={12}>{empty ? R.emptyMoneyB : R.earnHint}</Muted>
      </Card>
      <div style={{ borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 8, background: danger ? "var(--danger-wash)" : "var(--bg)", border: danger ? "none" : low ? "1px solid var(--danger)" : "1px solid var(--line)" }}>
        <Lbl c={danger ? "var(--danger-ink)" : undefined}>{R.balanceL}</Lbl>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1, fontSize: 28, fontWeight: 700, color: danger ? "var(--danger-ink)" : "var(--ink)" }} className="lynia-tabular">{bal}</span><SmBtn kind="fill" icon="Plus" label={R.topUp} /></div>
        <div style={{ fontSize: 13, lineHeight: "19px", color: danger ? "var(--danger-ink)" : "var(--ink)", fontWeight: danger || low ? 600 : 400, textWrap: "pretty" }}>{mode === "floor" ? R.floorB : mode === "owes" ? R.owesB : low ? R.lowB : mode === "zero" ? R.balanceB0 : R.balanceB}</div>
      </div>
      {empty ? null : foodOff ? <CashLine text="Cash with you now: $15.60. It's all yours." /> : <CashSplit title={R.cashNow} yours="$15.60" owed="$12.50" />}
      <Lbl style={{ marginTop: 4 }}>{R.history}</Lbl>
      {foodOff || empty ? null : <Chips list={[R.all, R.parcels, R.foodF]} />}
      {empty ? <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0" }}><IconDisc n="Receipt" s={44} /><div><div style={{ fontSize: 15, fontWeight: 700 }}>{R.emptyMoneyT}</div><Muted s={12}>{R.emptyMoneyB}</Muted></div></div>
        : <div><Lbl style={{ margin: "4px 0 2px", fontSize: 11 }}>{R.todayH}</Lbl>{rows.map((r, i) => <LRow key={i} first={i === 0} icon={r[0]} title={r[1]} meta={r[2]} amt={r[3]} />)}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, alignItems: "center", fontSize: 12, color: "var(--muted)", padding: "10px 0" }}><ASpin c="var(--muted)" s={12} />{R.loadsMore}</div></div>}
    </Body>
    <TabBar tab={1} />
  </AFrame>;
}

function RStepBar({ step, labels }) {
  return <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>{labels.map((l, i) => { const n = i + 1, done = n < step, cur = n === step;
    return <div key={l} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, height: 22 }}><span style={{ width: 18, height: 18, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: done || cur ? "var(--accent-text)" : "var(--surface)", color: done || cur ? "#fff" : "var(--muted)", border: done || cur ? "none" : "1px solid var(--line)", boxSizing: "border-box" }}>{done ? <AIc n="Check" s={12} c="#fff" sw={3} /> : n}</span><span style={{ fontSize: 12, fontWeight: cur ? 700 : 600, color: cur ? "var(--ink)" : done ? "var(--accent-text)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</span></div>
      <div style={{ height: 3, borderRadius: 2, marginTop: 4, background: done || cur ? "var(--accent)" : "var(--line)" }}></div></div>; })}</div>;
}
function FlowHeader({ title, step, labels }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 20, background: "var(--bg)", borderBottom: "1px solid var(--line)" }}><RStatus />
    <div style={{ height: 52, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 8px" }}><span style={{ height: 44, display: "flex", alignItems: "center", gap: 2, fontSize: 15, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="ChevronDown" s={22} c="var(--accent-text)" rot={90} />{A.back}</span><span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span><span></span></div>
    {step ? <RStepBar step={step} labels={labels} /> : null}</div>;
}
const FH = 24 + 52 + 38 + 1;
const TSTEPS = [R.tsProvider, R.tsAmount, R.tsPhone, R.tsApprove];
/* step: provider | amount | phone | wait | ok | fail */
function TopUp({ W, H, step = "provider" }) {
  const n = { provider: 1, amount: 2, phone: 3, wait: 4 }[step];
  if (step === "ok" || step === "fail") return <Terminal W={W} H={H} icon={step === "ok" ? "CircleCheck" : "CircleAlert"} tone={step === "ok" ? "ok" : "danger"} title={step === "ok" ? R.okT : R.failT} body={step === "ok" ? R.okB : R.failB}
    primary={<GBtn label={step === "ok" ? R.backMoney : R.tryAgain} icon={step === "ok" ? null : "RefreshCw"} />} ghost={<GBtn ghost label={step === "ok" ? R.again : R.callSupport} icon={step === "ok" ? null : "Phone"} />} />;
  const opt = (name, on) => <div key={name} style={{ minHeight: 64, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderRadius: 12, border: on ? "2px solid var(--accent-text)" : "1px solid var(--line)", background: on ? "var(--accent-wash)" : "var(--bg)", boxSizing: "border-box" }}>
    <span style={{ width: 22, height: 22, borderRadius: "50%", border: on ? "7px solid var(--accent-text)" : "2px solid var(--line)", boxSizing: "border-box", background: "#fff" }}></span>
    <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{R.approveOnPhone}</div></div><AIc n="Smartphone" s={18} c="var(--muted)" /></div>;
  return <AFrame W={W} H={H}>
    <FlowHeader title={R.tTopUp} step={n} labels={TSTEPS} />
    {step === "wait" ? <div style={{ position: "absolute", left: 0, right: 0, top: FH, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 24px", textAlign: "center" }}>
      <span style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}><ASpin c="var(--accent-text)" s={32} /></span>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px" }}>{R.waitT}</div><div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{R.waitB}</div>
      <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: 10 }}><Countdown t="1:12" /><div style={{ flex: 1 }}><Progress pct={80} /></div></div>
    </div> : <>
      <Body top={FH} bottom={B1} pad="16px 16px 24px">
        {step === "provider" ? <><div style={fieldLbl}>{R.provider}</div>{opt("EcoCash", true)}{opt("InnBucks")}{opt("O'mari")}</> : null}
        {step === "amount" ? <><div style={{ textAlign: "center" }}><div style={{ ...fieldLbl, fontSize: 15 }}>{R.amount}</div><span style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, borderBottom: "2px dashed var(--line)" }} className="lynia-tabular">$5.00</span></div>
          <div style={{ display: "flex", gap: 8 }}>{["$2", "$5", "$10", "$20"].map(v => <span key={v} style={{ flex: 1, height: 44, borderRadius: "var(--radius-pill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, background: v === "$5" ? "var(--accent-wash)" : "var(--bg)", border: v === "$5" ? "1.5px solid var(--accent-text)" : "1px solid var(--line)", color: v === "$5" ? "var(--accent-text)" : "var(--ink)", boxSizing: "border-box" }} className="lynia-tabular">{v}</span>)}</div>
          <Muted>{R.amountHint}</Muted></> : null}
        {step === "phone" ? <Field label={R.phoneL} value="+263 77 245 1180" hint={R.phoneHint} focus /> : null}
      </Body>
      <RBar><GBtn label={step === "phone" ? R.requestCta : S.next} /></RBar>
    </>}
  </AFrame>;
}
Object.assign(window, { Money, TopUp, FlowHeader, RStepBar, FH });
