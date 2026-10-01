/* Steps 2–4, sending, offline, send-again, account on hold */
function Scroll({ top, bottom, offset = 0, children }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, bottom, overflow: "hidden" }}>
    <div style={{ padding: "12px 16px 24px", marginTop: -offset }}>{children}</div>
  </div>;
}

/* mode: empty | typing | max | badphone */
function Step2({ W, H, mode }) {
  const kb = mode === "typing" ? kbH(W) : 0;
  const ctaH = mode === "empty" ? 102 : 76;
  const filled = mode !== "empty";
  const offset = mode === "typing" ? 84 : mode === "badphone" ? 9999 : mode === "max" ? 60 : 0;
  const items = mode === "max"
    ? ["Documents envelope", "Phone charger", "School shoes", "Bread (2 loaves)", "Rice 2kg", "Cooking oil 2L", "Sugar 2kg", "Soap bars", "Exercise books", "Medicine bag"]
    : mode === "typing" ? ["Documents env"] : filled ? ["Documents envelope"] : [""];
  const body = <>
    <RouteStrip W={W} />
    <div style={{ ...fieldLbl, fontSize: 15, marginBottom: 8 }}>{S.whatSend}</div>
    {mode === "max" ? items.slice(7).map((d, i) => <ItemCard key={i} desc={d} qty={i === 2 ? 1 : 2} removable />) : items.map((d, i) => <ItemCard key={i} desc={d} focus={mode === "typing"} />)}
    {mode === "max"
      ? <Notice icon="Package" text={S.maxItems} style={{ marginBottom: 16 }} />
      : <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--accent-text)", marginBottom: 10 }}><Ic n="Plus" s={18} c="var(--accent-text)" />{S.addItem}</div>}
    <Field label={S.note} ph={S.notePh} multi value={filled && mode !== "typing" ? "Blue gate opposite the pharmacy. Ask for Rita." : ""} />
    <Field label={S.sender} value={PH.me} hint={S.senderHint} />
    {mode === "empty"
      ? <Field label={S.rcpt} ph="+263 77 000 0000" hint={S.rcptHint}><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}><Chip label="Rita · 071 555 0090" /><Chip label="Mum · 077 812 3344" /></div></Field>
      : <Field label={S.rcpt} value={mode === "badphone" ? PH.bad : PH.rcpt} err={mode === "badphone" ? S.rcptErr : null} focus={mode === "badphone"} hint={S.rcptHint} />}
  </>;
  const ref = React.useRef(null);
  React.useEffect(() => { if (mode === "badphone" && ref.current) { const el = ref.current, c = el.firstChild; c.style.marginTop = -(c.scrollHeight - el.clientHeight) + "px"; } }, [mode, W, H]);
  return <Frame W={W} H={H}>
    <Header step={2} />
    <div ref={ref} style={{ position: "absolute", left: 0, right: 0, top: 113, bottom: ctaH + kb, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 16px", marginTop: mode === "badphone" ? 0 : -offset }}>{body}</div>
    </div>
    <CTA label={S.next} disabled={mode !== "max" && mode !== "typing"} hint={mode === "empty" ? S.need2 : null} bottom={kb} />
    {kb ? <Keyboard W={W} /> : null}
  </Frame>;
}

/* mode: suggested | low | high */
function Step3({ W, H, mode }) {
  const val = { suggested: 3.36, low: 2.0, high: 33.6 }[mode];
  const pos = (v) => Math.min(1, Math.max(0, v / 6));
  const small = W < 340;
  return <Frame W={W} H={H}>
    <Header step={3} />
    <Scroll top={113} bottom={76}>
      <RouteStrip W={W} />
      <div style={{ textAlign: "center" }}>
        <div style={{ ...fieldLbl, fontSize: 15 }}>{S.yourPrice}</div>
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "2px 12px", borderRadius: "var(--radius-input)" }}>
          <span className="lynia-tabular" style={{ fontSize: small ? 48 : 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-.02em", color: mode === "suggested" ? "var(--ink)" : "var(--ink)", borderBottom: "2px dashed var(--line)" }}>${val.toFixed(2)}</span>
          <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, display: "flex", gap: 4, alignItems: "center" }}><Ic n="Pencil" s={12} c="var(--muted)" />{S.tapType}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, margin: "14px 0 18px" }}>
        <div style={{ flex: 1 }}><Btn label={S.minus} ghost /></div>
        <div style={{ flex: 1 }}><Btn label={S.plus} ghost /></div>
      </div>
      <div style={{ position: "relative", height: 8, background: "var(--line)", borderRadius: 4, margin: "0 6px 12px" }}>
        <div style={{ position: "absolute", left: pos(2.96) * 100 + "%", width: (pos(3.8) - pos(2.96)) * 100 + "%", top: 0, bottom: 0, background: "var(--accent)", borderRadius: 4 }}></div>
        <div style={{ position: "absolute", left: pos(val) * 100 + "%", top: -5, width: 18, height: 18, marginLeft: -9, borderRadius: "50%", background: "var(--ink)", border: "3px solid #fff", boxSizing: "border-box", boxShadow: "var(--shadow-card)" }}></div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: "18px", marginBottom: 14 }}>
        <span style={{ flex: 1, color: "var(--ink)" }}>{S.band}</span><span style={{ color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{S.km}</span>
      </div>
      {mode === "low" ? <Notice icon="TriangleAlert" text={S.low} tone="warn" style={{ marginBottom: 12 }} /> : null}
      {mode === "high" ? <Notice icon="TriangleAlert" text={S.high} tone="warn" style={{ marginBottom: 12 }} /> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="Banknote" s={18} c="var(--accent-text)" />{S.cash}</div>
    </Scroll>
    <CTA label={S.review} />
  </Frame>;
}

function SumBlock({ title, meta, children }) {
  return <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-input)", padding: "0 6px 8px 12px", marginBottom: 6, background: "var(--bg)" }}>
    <div style={{ display: "flex", alignItems: "center", height: 34 }}>
      <span style={{ ...lbl, flex: 1, textTransform: "uppercase" }}>{title}{meta ? <span style={{ textTransform: "none", fontWeight: 400 }}> · {meta}</span> : null}</span>
      <span style={{ height: 44, display: "flex", alignItems: "center", gap: 4, padding: "0 8px", fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="Pencil" s={14} c="var(--accent-text)" />{S.edit}</span>
    </div>
    <div style={{ fontSize: 14, lineHeight: "20px", paddingRight: 6 }}>{children}</div>
  </div>;
}
const Line = ({ m, children, muted }) => <div style={{ display: "flex", alignItems: "center", gap: 8, color: muted ? "var(--muted)" : "var(--ink)" }}>{m}<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span></div>;

/* mode: summary | sending | failed | offline | again */
function Step4({ W, H, mode }) {
  const banner = mode === "offline" ? <Notice icon="WifiOff" text={S.offline} style={{ marginBottom: 10 }} />
    : mode === "again" ? <Notice icon="History" text={S.again} style={{ marginBottom: 10, background: "var(--accent-wash)", border: "none" }} /> : null;
  const ctaH = mode === "offline" ? 150 : 124;
  return <Frame W={W} H={H}>
    <Header step={4} />
    <Scroll top={113} bottom={ctaH}>
      {banner}
      <SumBlock title={S.sumRoute} meta={S.km}>
        <Line m={<Dot s={10} />}><b>{ADDR.a}</b></Line>
        <Line m={<Sq s={10} />}><b>{ADDR.b}</b></Line>
      </SumBlock>
      <SumBlock title={S.sumItems}>
        <div>Documents envelope × 1</div><div>Phone charger × 2</div>
      </SumBlock>
      <SumBlock title={S.sumNote}><div style={{ color: "var(--ink)" }}>Blue gate opposite the pharmacy. Ask for Rita.</div></SumBlock>
      <SumBlock title={S.sumPhones}>
        <div><span style={{ color: "var(--muted)" }}>{S.you}: </span>{PH.me}</div>
        <div><span style={{ color: "var(--muted)" }}>{S.recipient}: </span>{PH.rcpt}</div>
      </SumBlock>

    </Scroll>
    {mode === "failed" ? <Toast text={S.failed} action={S.retry} bottom={ctaH + 10} /> : null}
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--bg)", padding: "4px 16px 12px", boxShadow: "var(--shadow-sheet)", zIndex: 25 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 48 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...lbl, textTransform: "uppercase" }}>{S.sumPrice}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="lynia-tabular" style={{ fontSize: 22, fontWeight: 700, lineHeight: "26px" }}>$3.36</span><span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "var(--accent-text)", whiteSpace: "nowrap" }}><Ic n="Banknote" s={15} c="var(--accent-text)" />{S.cash}</span></div>
        </div>
        <span style={{ height: 44, display: "flex", alignItems: "center", gap: 4, padding: "0 4px", fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><Ic n="Pencil" s={14} c="var(--accent-text)" />{S.edit}</span>
      </div>
      {mode === "offline" ? <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: "2px 0 8px", lineHeight: "18px" }}>{S.offlineCta}</div> : <div style={{ height: 8 }}></div>}
      <Btn label={mode === "sending" ? S.sending : S.send} loading={mode === "sending"} disabled={mode === "offline"} />
    </div>
  </Frame>;
}

function Hold({ W, H }) {
  return <Frame W={W} H={H}>
    <Header step={1} bar={false} />
    <div style={{ position: "absolute", left: 24, right: 24, top: 77, bottom: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
      <span style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic n="Ban" s={32} c="var(--danger)" /></span>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px" }}>{S.holdT}</div>
      <div style={{ fontSize: 15, lineHeight: "22px", color: "var(--muted)", textWrap: "pretty" }}>{S.holdB}</div>
    </div>
    <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <Btn label={S.call} icon="Phone" />
      <Btn label={S.home} ghost />
    </div>
  </Frame>;
}

Object.assign(window, { Scroll, Step2, Step3, Step4, Hold });
