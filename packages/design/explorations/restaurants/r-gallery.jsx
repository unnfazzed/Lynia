/* LyniaGo Restaurants vertical — screen gallery. Static mockups only: customer + rider phones and
   merchant tablet screens, grouped by journey act. Band data lives in r-gallery-data.js (shared
   with the all-screens gallery). Mounts to #root. */

const RCg = window.RC || {}, RMg = window.RM || {}, RRg = window.RR || {};
const { Icon } = window.LyniaDesignSystem_94c56a;

const PW = 300, PH = 600, PH_TALL = 720, TW = 1024, TH = 680, TS = 0.52;
const TALL = new Set(["home"]); // the root home is a full-height screen: 600px clips its venue rail

const { CUSTOMER, MERCHANT, RIDER } = window.RGD;

function Phone({ id, render, h = PH }) {
  let body;
  try { body = render ? render() : null; } catch (e) { body = <div style={{ padding: 20, fontSize: 12, color: "var(--danger)" }}>Failed to render “{id}”: {String(e.message || e)}</div>; }
  if (!render) body = <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Screen “{id}” not built yet.</div>;
  return (
    <div style={{ width: PW, height: h, borderRadius: 28, border: "7px solid #14181b", overflow: "hidden", position: "relative", background: "var(--bg)", boxShadow: "0 12px 34px rgba(20,24,27,.20)" }}>
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 92, height: 18, background: "#14181b", borderRadius: "0 0 11px 11px", zIndex: 30 }} />
      <div style={{ height: "100%", overflow: "hidden" }}>{body}</div>
    </div>
  );
}

function TabletFrame({ id, render }) {
  let body;
  try { body = render ? render() : null; } catch (e) { body = <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }}>Failed to render “{id}”: {String(e.message || e)}</div>; }
  if (!render) body = <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>Screen “{id}” not built yet.</div>;
  return (
    <div style={{ width: TW * TS, height: TH * TS, borderRadius: 14, border: "8px solid #14181b", overflow: "hidden", position: "relative", background: "var(--bg)", boxShadow: "0 12px 34px rgba(20,24,27,.20)" }}>
      <div style={{ width: TW, height: TH, transform: `scale(${TS})`, transformOrigin: "top left", overflow: "hidden" }}>{body}</div>
    </div>
  );
}

/* Tiles mount only when they scroll near the viewport — 90+ frames at once is too much DOM for a
   cheap laptop (and for the screenshot pipeline). ?all=1 force-mounts everything for review tools
   that render in a hidden document, where IntersectionObserver never fires. */
const FORCE_ALL = /[?&]all=1/.test(location.search);
function useNear(ref, margin = "700px") {
  const [near, setNear] = React.useState(FORCE_ALL);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (!("IntersectionObserver" in window) || document.visibilityState === "hidden") { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return near;
}

function Tile({ id, badge, title, render, wide }) {
  const ph = TALL.has(id) ? PH_TALL : PH;
  const W = wide ? TW * TS : PW, Hh = wide ? TH * TS : ph;
  const ref = React.useRef(null);
  const near = useNear(ref);
  return (
    <div style={{ width: W }} ref={ref}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, height: 24, marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--on-accent)", background: "var(--accent-text)", borderRadius: 5, padding: "2px 6px", fontVariantNumeric: "tabular-nums" }}>{badge}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</span>
      </div>
      {near ? (wide ? <TabletFrame id={id} render={render} /> : <Phone id={id} render={render} h={ph} />)
        : <div style={{ width: W, height: Hh, borderRadius: wide ? 14 : 28, background: "#dfe4e7" }} />}
    </div>
  );
}

function Band({ title, sub, tiles, source, wide }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</div>
        {sub ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, maxWidth: 780, lineHeight: 1.5 }}>{sub}</div> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
        {tiles.map(([id, badge, t2]) => <Tile key={badge + id} id={id} badge={badge} title={t2} render={source[id]} wide={wide} />)}
      </div>
    </div>
  );
}

const count = (bands) => bands.reduce((n, b) => n + b[2].length, 0);

function Section({ anchor, label, blurb, source, bands, tint, wide, device }) {
  return (
    <section id={anchor} style={{ padding: "34px 40px 8px", scrollMarginTop: 68 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6, paddingBottom: 14, borderBottom: "2px solid var(--line)" }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: tint }} />
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{label}</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{count(bands)} screens · {device}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: 520, textAlign: "right", lineHeight: 1.5 }}>{blurb}</span>
      </div>
      <div style={{ height: 22 }} />
      {bands.map(([t, s, tiles]) => <Band key={t} title={t} sub={s} tiles={tiles} source={source} wide={wide} />)}
    </section>
  );
}

function App() {
  const c = count(CUSTOMER), m = count(MERCHANT), r = count(RIDER);
  const nav = (href, label, n) => (
    <a href={href} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "var(--ink)", textDecoration: "none", padding: "6px 12px", borderRadius: 999, background: "var(--surface)" }}>
      {label}<span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{n}</span>
    </a>
  );
  return (
    <div>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--bg)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 18, padding: "0 24px", height: 60 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="26" height="26" viewBox="0 0 96 96" aria-hidden="true"><polygon points="28,6 58,32 38,42" fill="var(--accent)" /><polygon points="90,26 14,52 48,60" fill="var(--accent)" /><polygon points="90,26 48,60 42,84" fill="var(--accent-700)" /></svg>
          <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 18 }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Restaurants vertical</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{c + m + r} screens · static, no interaction</span>
        <span style={{ flex: 1 }} />
        <nav style={{ display: "flex", gap: 8 }}>
          {nav("#customer", "Customer", c)}{nav("#merchant", "Merchant", m)}{nav("#rider", "Rider", r)}
          <a href="../../RESTAURANTS-DECISIONS.md" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, color: "var(--accent-text)", textDecoration: "none", padding: "6px 12px", borderRadius: 999, background: "var(--accent-wash)" }}>
            Decisions<Icon name="arrow-right" size={13} color="var(--accent-text)" />
          </a>
        </nav>
      </header>
      <Section anchor="customer" label="Customer" device="Expo · 320–360dp" tint="var(--accent)" source={RCg} bands={CUSTOMER}
        blurb="Discover → menu → cart → checkout → pay-after-accept → track → code hand-off → rate, with every exception path the lifecycle allows." />
      <Section anchor="merchant" label="Merchant" device="web · tablet-first 1024×680" tint="var(--ink)" source={RMg} bands={MERCHANT} wide
        blurb="A new Next.js dashboard for a cheap Android tablet in a noisy kitchen: unmissable queue, evidence-bearing pickup confirms, honest connection state." />
      <Section anchor="rider" label="Rider" device="Expo · rider role" tint="var(--accent-700)" source={RRg} bands={RIDER}
        blurb="Auto-dispatch offers with the float rule made visible, the mirrored pay-merchant moment, code capture, and the return-to-restaurant leg." />
      <div style={{ height: 40 }} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
