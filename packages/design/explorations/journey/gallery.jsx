/* LyniaGo — ALL SCREENS gallery. Four categories in reading order: Customer → Rider → Merchant →
   Admin. Bands run by journey stage with both services in the same act, each tile carrying a service
   tag chip; exceptions & edge sit at the end of each category. Band + tile data lives in
   gallery-map.js (window.GMAP); badges are generated (C1·1, R2·3, M4·1, A1). Mounts to #root. */

const SOURCES = () => ({ LJ: window.LJ || {}, RC: Object.assign({}, window.RC || {}), RJ: window.RJ || {}, RR: window.RR || {}, RJM: window.RJM || {}, RM: window.RM || {} });
const { Icon } = window.LyniaDesignSystem_94c56a;
const GMAP = window.GMAP || { CUSTOMER: [], RIDER: [], MERCHANT: [] };

const PHONE_W = 300, PHONE_H = 600, PHONE_H_TALL = 720, PHONE_H_MAX = 1600, PHONE_H_DISPLAY = 780;
const TALL = new Set(["home", "home_launcher", "board", "board_empty", "money", "active_parcel", "active_food", "offer_food", "offer_parcel", "notifications", "account", "handoff", "gate_topup", "offline"]);
const TW = 1024, TH = 680, TS = 0.52; // merchant tablet frames
const ACCENT_BG = new Set(["splash", "force_update"]);

const ADMIN = [
  ["index.html", "Overview dashboard", "Key pilot metrics, needs-attention queue, recent orders."],
  ["orders.html", "Orders — monitor & detail", "Status filters, order timeline, fare adjust / refund / cancel."],
  ["riders.html", "Riders — directory & profile", "Trips, strikes, cooldown, cash owed; suspend / lift."],
  ["customers.html", "Customers — directory & profile", "Masked contact, spend & cancel pattern, flag / ban."],
  ["cash.html", "Cash & settlements", "Rider-collected fares, weekly commission settlement."],
  ["kyc.html", "KYC — queue & review", "Didit checks, document viewer, approve / decline."],
  ["issues.html", "Issues — disputes", "Lost-parcel dispute: OTP evidence, resolve with refund / strike."],
];

/* ── frames ── */
function Phone({ id, render, accent, h = PHONE_H }) {
  let body;
  try { body = render ? render() : null; }
  catch (e) { body = <div style={{ padding: 20, fontSize: 12, color: "var(--danger)" }}>Failed to render “{id}”</div>; }
  if (!render) body = <div style={{ padding: 20, fontSize: 12, color: "var(--muted)" }}>Screen “{id}” not found.</div>;
  return (
    <div style={{ width: PHONE_W, height: h, borderRadius: 28, border: "7px solid #14181b", overflow: "hidden", position: "relative", background: accent ? "var(--accent)" : "var(--surface)", boxShadow: "0 12px 34px rgba(20,24,27,.20)" }}>
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 92, height: 18, background: "#14181b", borderRadius: "0 0 11px 11px", zIndex: 30 }} />
      <div data-body style={{ height: "100%", overflow: "hidden" }}>{body}</div>
    </div>
  );
}

function TabletFrame({ id, render }) {
  let body;
  try { body = render ? render() : null; } catch (e) { body = <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }}>Failed to render "{id}": {String(e.message || e)}</div>; }
  if (!render) body = <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>Screen "{id}" not built yet.</div>;
  return (
    <div style={{ width: TW * TS, height: TH * TS, borderRadius: 14, border: "8px solid #14181b", overflow: "hidden", position: "relative", background: "var(--bg)", boxShadow: "0 12px 34px rgba(20,24,27,.20)" }}>
      <div style={{ width: TW, height: TH, transform: `scale(${TS})`, transformOrigin: "top left", overflow: "hidden" }}>{body}</div>
    </div>
  );
}

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

/* Service tag chip — how a reviewer tells the two services apart inside one band. */
function Tag({ tag }) {
  if (!tag) return null;
  const food = tag === "FOOD", both = tag === "BOTH";
  const fg = both ? "var(--muted)" : food ? "var(--highlight-ink)" : "var(--accent-text)";
  const bg = both ? "var(--surface)" : food ? "var(--highlight-wash)" : "var(--accent-wash)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: bg, color: fg, borderRadius: 5, padding: "2px 5px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em" }}>
      {both ? null : <Icon name={food ? "utensils" : "package"} size={9} color={fg} />}
      {tag}
    </span>
  );
}

function Tile({ id, badge, title, tag, render, wide }) {
  const ref = React.useRef(null);
  const near = useNear(ref);
  /* Frames fit their screen: the body is measured (and re-measured as async content — map tiles,
     photos — lands) and the frame grows until nothing is cut, up to a sane ceiling. The seed list
     just avoids one reflow for screens we already know are full-height. */
  const [h, setH] = React.useState(TALL.has(id) ? PHONE_H_TALL : PHONE_H);
  React.useEffect(() => {
    if (!near || wide) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let lastDelta = Infinity, stalls = 0;
    /* Measure the screen's own scroll container only — never every descendant: children written with
       `min-height:100%` overflow their parent by a constant amount, so an additive loop over all of
       them never converges. Growth also stops as soon as a step fails to reduce the overflow, so a
       screen with a border-box slip stays at a readable size instead of walking to the ceiling. */
    const fit = () => {
      const body = el.querySelector("[data-body]");
      if (!body || stalls >= 2) return;
      const scroller = [...body.querySelectorAll("*")].find((n) => {
        const oy = getComputedStyle(n).overflowY;
        return (oy === "auto" || oy === "scroll") && n.clientHeight > 100;
      });
      const delta = Math.max(body.scrollHeight - body.clientHeight, scroller ? scroller.scrollHeight - scroller.clientHeight : 0);
      if (delta <= 2) { lastDelta = delta; return; }
      if (delta >= lastDelta) { stalls += 1; if (stalls >= 2) return; }
      lastDelta = delta;
      setH((prev) => Math.min(PHONE_H_MAX, prev + delta + 2));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    const ro = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    if (ro) { const b = el.querySelector("[data-body]"); if (b) { ro.observe(b); [...b.querySelectorAll("*")].forEach((n) => { if (n.clientHeight > 200) ro.observe(n); }); } }
    const timers = [120, 700, 2000].map((ms) => setTimeout(fit, ms));
    window.addEventListener("load", fit);
    return () => { if (ro) ro.disconnect(); timers.forEach(clearTimeout); window.removeEventListener("load", fit); cancelAnimationFrame(raf); };
  }, [near, wide]);
  /* A screen taller than a real phone is shown as a zoomed-out phone: the frame keeps the screen's
     true height (nothing is cut) and the whole bezel is scaled so no tile is taller than
     PHONE_H_DISPLAY — aspect intact, rows even. */
  const k = wide ? 1 : Math.min(1, PHONE_H_DISPLAY / h);
  const W = wide ? TW * TS : Math.round(PHONE_W * k), Hh = wide ? TH * TS : Math.round(h * k);
  return (
    <div style={{ width: W }} ref={ref}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 24, marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--on-accent)", background: "var(--accent-text)", borderRadius: 5, padding: "2px 6px", fontVariantNumeric: "tabular-nums" }}>{badge}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <Tag tag={tag} />
      </div>
      {near ? (wide ? <TabletFrame id={id} render={render} /> : (
        <div style={{ width: W, height: Hh, position: "relative" }}>
          <div style={{ width: PHONE_W, height: h, transform: k < 1 ? `scale(${k})` : "none", transformOrigin: "top left" }}>
            <Phone id={id} render={render} accent={ACCENT_BG.has(id)} h={h} />
          </div>
        </div>
      )) : <div style={{ width: W, height: Hh, borderRadius: wide ? 14 : 28, background: "#dfe4e7" }} />}
    </div>
  );
}

function Band({ prefix, n, title, sub, tiles, sources, wide }) {
  return (
    <div id={`${prefix}${n}`} style={{ marginBottom: 40, scrollMarginTop: 108 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{prefix}{n}</span>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</div>
        </div>
        {sub ? <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, maxWidth: 780 }}>{sub}</div> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-start" }}>
        {tiles.map(([src, id, t, tag], i) => (
          <Tile key={src + id + i} id={id} badge={`${prefix}${n}·${i + 1}`} title={t} tag={tag} render={(sources[src] || {})[id]} wide={wide} />
        ))}
      </div>
    </div>
  );
}

function Category({ anchor, prefix, label, blurb, bands, sources, tint, wide }) {
  const total = bands.reduce((n, b) => n + b[2].length, 0);
  return (
    <section id={anchor} style={{ padding: "34px 40px 8px", scrollMarginTop: 68 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6, paddingBottom: 14, borderBottom: "2px solid var(--line)" }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: tint }} />
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{label}</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{total} screens</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: 520, textAlign: "right" }}>{blurb}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 0 20px" }}>
        {bands.map(([t], i) => (
          <a key={t} href={`#${prefix}${i + 1}`} style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", textDecoration: "none", background: "var(--surface)", borderRadius: 999, padding: "5px 11px" }}>
            <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{prefix}{i + 1}</span> {t}
          </a>
        ))}
      </div>
      {bands.map(([t, s, tiles], i) => <Band key={t} prefix={prefix} n={i + 1} title={t} sub={s} tiles={tiles} sources={sources} wide={wide} />)}
    </section>
  );
}

/* ── admin thumbnails ── */
const A_W = 1280, A_H = 800, A_SCALE = 0.375;
function AdminCard({ badge, file, title, sub }) {
  const href = "../../ui_kits/admin/" + file;
  return (
    <a href={href} target="_blank" rel="noopener" style={{ textDecoration: "none", color: "inherit", width: A_W * A_SCALE }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, height: 24, marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--on-accent)", background: "var(--accent-text)", borderRadius: 5, padding: "2px 6px" }}>{badge}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</span>
        <Icon name="arrow-right" size={13} color="var(--accent-text)" />
      </div>
      <div style={{ width: A_W * A_SCALE, height: A_H * A_SCALE, borderRadius: 12, overflow: "hidden", background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "0 12px 34px rgba(20,24,27,.16)", position: "relative" }}>
        <div style={{ height: 26, background: "#14181b", display: "flex", alignItems: "center", gap: 6, padding: "0 10px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#28c840" }} />
          <span style={{ marginLeft: 8, fontSize: 10.5, color: "rgba(255,255,255,.65)", fontWeight: 600 }}>lynia ops · {file}</span>
        </div>
        <div style={{ position: "relative", width: "100%", height: "calc(100% - 26px)", overflow: "hidden" }}>
          <iframe src={href} title={title} scrolling="no" tabIndex={-1} loading="lazy"
            style={{ width: A_W, height: A_H - 26 / A_SCALE, border: "none", transform: `scale(${A_SCALE})`, transformOrigin: "top left", pointerEvents: "none" }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>{sub}</div>
    </a>
  );
}

function count(bands) { return bands.reduce((n, b) => n + b[2].length, 0); }

function App() {
  const sources = SOURCES();
  const cCount = count(GMAP.CUSTOMER), rCount = count(GMAP.RIDER), mCount = count(GMAP.MERCHANT), aCount = ADMIN.length;
  const navItem = (href, label, n) => (
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
        <span style={{ fontSize: 15, fontWeight: 700 }}>All screens</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{cCount + rCount + mCount + aCount} mockups · Send + Food in one app · static, no interaction</span>
        <span style={{ flex: 1 }} />
        <nav style={{ display: "flex", gap: 8 }}>
          {navItem("#customer", "Customer", cCount)}
          {navItem("#rider", "Rider", rCount)}
          {navItem("#merchant", "Merchant", mCount)}
          {navItem("#admin", "Admin", aCount)}
        </nav>
      </header>

      <Category anchor="customer" prefix="C" label="Customer" tint="var(--accent)" bands={GMAP.CUSTOMER} sources={sources}
        blurb="One app: order food, send a parcel. Bands run by journey stage — both services in the same act, tagged per tile." />
      <Category anchor="rider" prefix="R" label="Rider" tint="var(--accent-700)" bands={GMAP.RIDER} sources={sources}
        blurb="One rider interface for both services: one job list with a service tag, one active job, one commission balance." />
      <Category anchor="merchant" prefix="M" label="Merchant" tint="var(--ink)" bands={GMAP.MERCHANT} sources={sources} wide
        blurb="The kitchen tablet: unmissable queue, accept & cook, evidence-bearing pickup confirms, menu editor, shop front." />

      <section id="admin" style={{ padding: "34px 40px 60px", scrollMarginTop: 68 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6, paddingBottom: 14, borderBottom: "2px solid var(--line)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--highlight)" }} />
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Admin</h2>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{aCount} pages</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: 460, textAlign: "right" }}>Desktop ops tool — thumbnails are live pages. Click any to open full size.</span>
        </div>
        <div style={{ height: 22 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 30 }}>
          {ADMIN.map(([f, t, s], i) => <AdminCard key={f} badge={`A${i + 1}`} file={f} title={t} sub={s} />)}
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
