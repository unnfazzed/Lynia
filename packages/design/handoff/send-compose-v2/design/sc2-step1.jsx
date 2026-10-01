/* Step 1 — Where */
function Frame({ W, H, children, bg = "var(--bg)" }) {
  return <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: bg, borderRadius: 18, boxShadow: "0 0 0 1px var(--line), 0 16px 40px rgba(20,24,27,.14)", fontFamily: "var(--font-sans)", color: "var(--ink)" }}><Status />{children}</div>;
}

/* mode: open | edit | nores | slow | limited | both | out | offline */
function Step1({ W, H, mode }) {
  const editing = ["edit", "nores", "slow", "limited"].includes(mode);
  const hdrH = editing ? 53 : 89;
  const top = 24 + hdrH;
  const both = mode === "both" || mode === "out";
  const kb0 = editing ? kbH(W) : 0;
  const a = mode === "out" ? [.28, .56] : both ? [.26, .42] : editing ? [.3, (H - kb0 - 44 + 12 - top) / (H - top)] : [.32, .5];
  const b = mode === "out" ? [.78, .75] : both ? [.72, .7] : null;
  const typed = mode === "nores" ? "14 Glenaraa" : "14 Glenara";
  const kb = editing ? kbH(W) : 0;
  const cardTop = top + 8, cardBottom = cardTop + 117;
  const ddMax = H - kb - cardBottom - 44;
  let dd = null;
  if (editing) {
    let mid;
    if (mode === "edit") mid = [<SugRow key="1" icon="MapPin" title="14 Glenara Avenue" sub="Avenues, Harare" />, <SugRow key="2" icon="MapPin" title="Glenara Avenue North" sub="Highlands, Harare" />, <SugRow key="3" icon="MapPin" title="Glen Lorne Shops" sub="Glen Lorne, Harare" />];
    if (mode === "nores") mid = [<div key="n" style={{ padding: "12px 14px", fontSize: 13, lineHeight: "18px", color: "var(--muted)", borderTop: "1px solid var(--line)" }}>{S.noRes}</div>];
    if (mode === "slow") mid = [<div key="s" style={{ padding: "8px 14px 0", fontSize: 12, fontWeight: 600, color: "var(--muted)", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 6 }}><span className="sc2-spin sc2-spin-sm"></span>{S.slow}</div>, <SugRow key="k1" skeleton />, <SugRow key="k2" skeleton />];
    if (mode === "limited") mid = [<div key="l" style={{ padding: "10px 14px", fontSize: 12, lineHeight: "17px", color: "var(--muted)", borderTop: "1px solid var(--line)", display: "flex", gap: 6 }}><Ic n="WifiOff" s={14} c="var(--muted)" />{S.limited}</div>, <SugRow key="g" icon="MapPin" title="14 Glenara Avenue, Harare" />];
    dd = <div style={{ maxHeight: ddMax, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <SugRow icon="Navigation" title={S.useCur} action />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{mid}</div>
      <SugRow icon="MapPin" title={S.tapMap} action />
    </div>;
  }
  const ctaH = mode === "open" ? 102 : 76;
  return <Frame W={W} H={H}>
    <Header step={1} bar={!editing} />
    <MapBox W={W} H={H} top={top} a={[a[0], a[1]]} b={b} route={both} labels={!editing} offline={mode === "offline"}>
      {mode === "open" ? <div style={{ position: "absolute", left: "50%", top: (H - top) * .5 + 40, transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", borderRadius: "var(--radius-pill)", padding: "6px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{S.mapHintDrop}</div> : null}
    </MapBox>
    <div style={{ position: "absolute", left: 12, right: 12, top: cardTop, zIndex: 18, background: "var(--bg)", borderRadius: 14, boxShadow: editing ? "var(--shadow-menu)" : "var(--shadow-card)", overflow: "hidden" }}>
      <AddrRow kind="a" value={mode === "out" ? ADDR.a : ADDR.a} meta={mode === "open" ? S.fromGps : null} />
      {editing ? <AddrRow kind="b" edit typed={typed} divider /> : <AddrRow kind="b" value={both ? (mode === "out" ? ADDR.far : ADDR.b) : null} out={mode === "out"} divider />}
      {dd}
    </div>
    {!editing ? <MapPill label={S.useLoc} icon="Navigation" bottom={ctaH + 12} /> : null}
    {both && mode !== "out" ? <MapPill label={S.km} left={12} bottom={ctaH + 12} dark /> : null}
    {mode === "out" ? <div style={{ position: "absolute", left: 12, right: 12, top: cardBottom + 14, zIndex: 18 }}><Notice icon="MapPin" text={S.outArea} style={{ background: "var(--bg)", boxShadow: "var(--shadow-card)", border: "none" }} /></div> : null}
    {editing ? <Keyboard W={W} /> : <CTA label={S.next} disabled={mode !== "both"} hint={mode === "open" ? S.needDrop : null} />}
  </Frame>;
}

Object.assign(window, { Frame, Step1 });
