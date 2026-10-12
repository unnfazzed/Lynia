/* lyniago.com app screens (2026-10). Composed from the app's own kits: sc2-kit (Send Compose v2), as-kit (After Send v2), rv-kit (Rider v2) + components/shell/TabBar.jsx.
   Every visible "rider" is shown as "biker" (ledger D-101). */
const W = 360, H = 720;

/* ── copy: rider → biker (visible strings only) ── */
Object.assign(A, { tChoose: "Choose a biker", tOnWay: "Biker on the way", cash: "Cash to your biker", codeHelp: "Give this code to the recipient. The biker enters it at hand-off." });

/* ── status bar: 9:41 + signal + battery ── */
function SysIcons({ c }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 1.5, height: 10 }}>{[4, 6, 8, 10].map(h => <i key={h} style={{ width: 3, height: h, background: c, borderRadius: 1 }}></i>)}</span>
    <span style={{ width: 20, height: 10, border: `1.5px solid ${c}`, borderRadius: 3, padding: 1, boxSizing: "border-box", display: "inline-flex" }}><i style={{ width: "84%", background: c, borderRadius: 1 }}></i></span>
  </span>;
}
function Status941({ bg = "var(--bg)", c = "var(--ink)" }) {
  return <div style={{ height: 24, display: "flex", alignItems: "center", padding: "0 16px 0 20px", fontSize: 12, fontWeight: 600, background: bg, color: c, position: "relative", zIndex: 30 }} className="lynia-tabular"><span style={{ flex: 1 }}>9:41</span><SysIcons c={c} /></div>;
}
window.Status = () => <Status941 />;
window.RStatus = ({ bg }) => <Status941 bg={bg} />;

/* ── map place labels (the kit map is abstract; labels name the Harare streets) ── */
function Places({ list, top = 0 }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, bottom: 0, pointerEvents: "none", zIndex: 3 }}>
    {list.map(([t, x, y, road]) => <span key={t} style={{ position: "absolute", left: x, top: y, fontSize: road ? 10 : 11, fontWeight: road ? 600 : 700, letterSpacing: road ? 0 : ".06em", textTransform: road ? "none" : "uppercase", color: "var(--muted)", whiteSpace: "nowrap", textShadow: "0 0 3px #fff, 0 0 3px #fff" }}>{t}</span>)}
  </div>;
}
const Scr = ({ children }) => <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)" }}>{children}</div>;

/* ───────── 1 · Send a parcel · step 1 Where ───────── */
const SEND_TOP = 24 + 52 + 37 + 1;
function AddrCard({ flat }) {
  return <div style={{ background: "var(--bg)", borderRadius: 14, boxShadow: flat ? "none" : "0 1px 4px rgba(20,24,27,.08), 0 2px 12px rgba(20,24,27,.06)", border: flat ? "1px solid var(--line)" : "none", overflow: "hidden" }}>
    <AddrRow kind="a" value={ADDR.a} meta={S.fromGps} />
    <AddrRow kind="b" value="Avondale Shops" divider />
  </div>;
}
function SendWhere() {
  return <Scr>
    <Status941 />
    <Header step={1} />
    <MapBox W={W} H={H} top={SEND_TOP} a={[.74, .48]} b={[.22, .34]} route labels />
    <Places top={SEND_TOP} list={[["Belgravia", 226, 146], ["Avondale", 22, 166], ["George Rd", 128, 176, 1], ["Samora Machel Ave", 104, 252, 1], ["Milton Park", 24, 296], ["Harare CBD", 190, 340]]} />
    <div style={{ position: "absolute", left: 12, right: 12, top: SEND_TOP + 8, zIndex: 15 }}><AddrCard /></div>
    <CTA label={S.next} />
  </Scr>;
}

/* ───────── 2 · Offers (Choose a biker) ───────── */
const OFF_TOP = 180;
const FARAI = RIDERS.f, TENDAI = RIDERS.t, KUDZAI = RIDERS.k;
function Offers() {
  return <Scr>
    <AHeader title={A.tChoose} help />
    <AMap W={W} sheetTop={OFF_TOP} a={[.74, .66]} b={[.22, .3]} />
    <Places top={HDR} list={[["Avondale", 18, 8], ["Harare CBD", 160, 74], ["Samora Machel Ave", 20, 94, 1]]} />
    <Sheet top={OFF_TOP}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={lbl}>{A.yourPrice}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px" }} className="lynia-tabular">$3.36</span><span style={{ fontSize: 13, color: "var(--muted)" }}>{A.cash}</span></div>
        </div>
        <SmBtn label={A.plus} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Countdown t="1:24" /><div style={{ flex: 1 }}><Progress pct={58} /></div></div>
      <div style={{ fontSize: 17, fontWeight: 700, lineHeight: "22px" }}>{A.offers}</div>
      <OfferCard o={FARAI} best />
      <OfferCard o={TENDAI} />
      <OfferCard o={KUDZAI} />
    </Sheet>
  </Scr>;
}

/* ───────── 3 · Biker on the way (state 6) ───────── */
const WAY_TOP = 270;
function OnWay() {
  return <Scr>
    <AHeader title={A.tOnWay} help />
    <AMap W={W} sheetTop={WAY_TOP} a={[.72, .5]} b={[.2, .22]} rider={{ at: [.46, .7] }} />
    <Places top={HDR} list={[["Avondale", 18, 10], ["Milton Park", 20, 120], ["Harare CBD", 262, 158], ["Samora Machel Ave", 120, 84, 1]]} />
    <Sheet top={WAY_TOP}>
      <div style={{ fontSize: 17, fontWeight: 700, lineHeight: "22px" }}>{A.etaPickup}</div>
      <StepTrack cur={0} />
      <RiderCard photo={false} />
      <CodeCard />
    </Sheet>
  </Scr>;
}

/* ───────── 4 · Splash 1a Sun & orbit (loading, no steps card) ───────── */
function Splash() {
  const ay = Math.round(H * .44);
  const blob = (s) => <i style={{ position: "absolute", borderRadius: "50%", ...s }}></i>;
  return <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: "#00B14F", color: "#fff", fontFamily: "var(--font-sans)" }}>
    <Status941 bg="transparent" c="#fff" />
    {blob({ width: 74, height: 74, background: "#FF6B4A", left: 28, top: H * .13 })}
    {blob({ width: 34, height: 34, background: "#FF8AC5", right: 40, top: H * .21 })}
    {blob({ width: 54, height: 54, background: "#3EC1F3", right: -8, top: ay + 64 })}
    {blob({ width: 150, height: 150, background: "#4B2FBF", left: -62, bottom: -56 })}
    <div style={{ position: "absolute", left: W / 2, top: ay, width: 0, height: 0 }}>
      <div style={{ position: "absolute", left: -110, top: -110, width: 220, height: 220, borderRadius: "50%", background: "#FFD23F" }}></div>
      <div style={{ position: "absolute", left: -136, top: -136, width: 272, height: 272, borderRadius: "50%", border: "2px dashed rgba(255,255,255,.5)", boxSizing: "border-box", transform: "rotate(60deg)" }}>
        <i style={{ position: "absolute", left: "50%", top: -11, marginLeft: -11, width: 22, height: 22, borderRadius: "50%", background: "#FF6B4A", boxShadow: "0 0 0 5px #fff" }}></i>
      </div>
      <svg style={{ position: "absolute", left: -60, top: -70 }} width="128" height="128" viewBox="0 0 96 96"><polygon points="28,6 58,32 38,42" fill="#00B14F"></polygon><polygon points="90,26 14,52 48,60" fill="#00B14F"></polygon><polygon points="90,26 48,60 42,84" fill="#009D3B"></polygon><path d="M90 26 L48 60 M70.5 30.2 L81.5 43.8" stroke="#FFD23F" strokeWidth="2.4" fill="none"></path></svg>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: ay + 152, textAlign: "center", fontFamily: "Fredoka, var(--font-sans)", fontWeight: 600, fontSize: 40, lineHeight: 1, letterSpacing: "-.01em" }}>Lynia<span style={{ color: "#D6F5E2" }}>Go</span></div>
  </div>;
}

/* ───────── 5 · Biker Jobs board (J3, parcels only) ───────── */
const JOBS = [
  { id: 1, a: "Avondale Shops", b: "Harare CBD", to: "0.8 km", trip: "2.4 km", p: "$2.50", item: "Small package", x: .30, y: .36 },
  { id: 2, a: "Avondale", b: "Msasa", to: "1.6 km", trip: "6.1 km", p: "$4.00", item: "4 items", x: .70, y: .24 },
  { id: 3, p: "$3.10", x: .80, y: .70 },
];
function JobsMap({ top, h }) {
  return <div style={{ position: "absolute", left: 0, right: 0, top, height: h, overflow: "hidden" }}>
    <MapBox W={W} H={h}>
      <div style={{ position: "absolute", left: .2 * W - 54, top: .7 * h - 54, width: 108, height: 108, borderRadius: "50%", background: "color-mix(in oklab, var(--accent) 16%, transparent)", border: "1.5px dashed var(--accent)", boxSizing: "border-box", display: "flex", alignItems: "flex-end", justifyContent: "center" }}><span style={{ marginBottom: -10, background: "var(--accent-text)", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: "var(--radius-pill)", padding: "2px 8px", whiteSpace: "nowrap" }}>{R.busy}</span></div>
      {JOBS.map((j, i) => { const s = i === 0; return <div key={j.id} style={{ position: "absolute", left: j.x * W, top: j.y * h, transform: "translate(-50%,-11px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, zIndex: s ? 5 : 4 }}>
        <span style={{ width: s ? 24 : 20, height: s ? 24 : 20, borderRadius: "50%", background: "var(--accent)", border: "3px solid #fff", boxShadow: s ? "0 0 0 3px var(--accent-text), var(--shadow-card)" : "var(--shadow-card)", boxSizing: "border-box" }}></span>
        <span style={{ background: s ? "var(--ink)" : "var(--bg)", color: s ? "#fff" : "var(--ink)", borderRadius: "var(--radius-pill)", padding: "2px 8px", fontSize: 12, fontWeight: 700, boxShadow: "var(--shadow-card)" }} className="lynia-tabular">{j.p}</span>
      </div>; })}
      <RiderMarker x={W * .52} y={h * .52} label={R.you} />
    </MapBox>
  </div>;
}
function Board() {
  const top = Math.round(H * .5);
  const TB = window.__TB;
  return <Scr>
    <MintTop W={W} loc="Samora Machel Ave" />
    <JobsMap top={MT} h={top - MT + 18} />
    <Places top={MT} list={[["Avondale", 18, 14], ["Milton Park", 150, 230], ["Samora Machel Ave", 140, 108, 1]]} />
    <Sheet top={top} ctaH={0}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{R.nearYou}</span><span style={{ fontSize: 12, color: "var(--muted)" }}>{R.nearest}</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}><AIc n="MapPin" s={15} c="var(--accent-text)" />{R.busyLine}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><JobCard j={JOBS[0]} sel /><JobCard j={JOBS[1]} /></div>
    </Sheet>
    {TB ? <TB.TabBar role="rider" active="jobs" material="solid" style={{ zIndex: 30, boxShadow: "0 8px 24px rgba(20,24,27,.12), 0 2px 6px rgba(20,24,27,.08)" }} /> : null}
  </Scr>;
}

/* ───────── framing for export ───────── */
const SC = 476 / 360;
function PhoneCrop({ id, h, children }) {
  return <div id={id} style={{ width: 500, height: h, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 12, top: 12, width: 476, height: 720 * SC, borderRadius: 54, overflow: "hidden" }}><div style={{ width: W, height: H, transform: `scale(${SC})`, transformOrigin: "0 0" }}>{children}</div></div>
  </div>;
}
function Flat({ id, children }) {
  return <div id={id} style={{ width: 265, height: 530, overflow: "hidden" }}><div style={{ width: W, height: H, transform: `scale(${265 / 360})`, transformOrigin: "0 0" }}>{children}</div></div>;
}
function HL({ id, children }) {
  return <div id={id} style={{ width: 600, background: "#fff" }}><div style={{ width: 375, padding: "14px 16px", boxSizing: "border-box", zoom: 1.6, fontFamily: "var(--font-sans)", color: "var(--ink)" }}>{children}</div></div>;
}

const Lab = ({ t, s }) => <div style={{ font: "600 12px/1.4 ui-monospace,Menlo,monospace", color: "#5b6670", marginBottom: 8 }}>{t} <span style={{ opacity: .7 }}>{s}</span></div>;
const Cell = ({ t, s, children }) => <div><Lab t={t} s={s} />{children}</div>;
function App() {
  const [tb, setTb] = React.useState(!!window.__TB);
  React.useEffect(() => { if (!tb) window.TBReady.then(m => { window.__TB = m; setTb(true); }); }, []);
  return <div style={{ display: "flex", flexDirection: "column", gap: 48, padding: 40 }}>
    <section><h2 style={hd}>How it works · phone crops + highlights</h2>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Cell t="step-1-phone" s="500×605"><PhoneCrop id="step-1-phone" h={605}><SendWhere /></PhoneCrop></Cell>
        <Cell t="step-2-phone" s="500×537"><PhoneCrop id="step-2-phone" h={537}><Offers /></PhoneCrop></Cell>
        <Cell t="step-3-phone" s="500×537"><PhoneCrop id="step-3-phone" h={537}><OnWay /></PhoneCrop></Cell>
      </div>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start", marginTop: 32 }}>
        <Cell t="step-1-hl" s="600 wide"><HL id="step-1-hl"><AddrCard flat /></HL></Cell>
        <Cell t="step-2-hl" s="600 wide"><HL id="step-2-hl"><OfferCard o={FARAI} best /></HL></Cell>
        <Cell t="step-3-hl" s="600 wide"><HL id="step-3-hl"><CodeCard /></HL></Cell>
      </div>
    </section>
    <section><h2 style={hd}>Hero collage · flat screens 265×530 (export 1× + 2×)</h2>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <Cell t="app-splash"><Flat id="app-splash"><Splash /></Flat></Cell>
        <Cell t="app-send"><Flat id="app-send"><SendWhere /></Flat></Cell>
        <Cell t="app-tracking"><Flat id="app-tracking"><OnWay /></Flat></Cell>
        <Cell t="app-rider"><Flat id="app-rider">{tb ? <Board /> : null}</Flat></Cell>
      </div>
    </section>
  </div>;
}
const hd = { font: "700 20px/1.2 var(--font-sans)", letterSpacing: "-.02em", margin: "0 0 20px", color: "#14181b" };
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
