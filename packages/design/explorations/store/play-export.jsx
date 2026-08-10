/* LyniaGo — Google Play export lab. Linear mobile method (short label + one device frame + minimal
   light backdrop), built from the REAL designed app screens (window.RC / window.LJ) inside the
   gallery's phone frame. Lays out phone / 7in / 10in shots + feature graphic + app icon at EXACT
   Play dimensions for 1:1 capture. Mounts to #root. */

const RC = window.RC || {};
const LJ = window.LJ || {};

const INK = "#14181b", MUTED = "#5b6670", BACKDROP = "#f6f7f8";
const DGREEN = "#006630", GREEN = "#00b14f", AGREEN = "#009d3b";

/* the six store slots → the real screen that already exists in the kit */
const SHOTS = [
  { file: "01-home",        pre: "One ",       accent: "app",     render: () => RC.home && RC.home() },
  { file: "02-restaurants", pre: "Order ",     accent: "food",    render: () => RC.list && RC.list() },
  { file: "03-menu-cart",   pre: "Your ",      accent: "cart",    render: () => RC.cart && RC.cart() },
  { file: "04-tracking",    pre: "Track ",     accent: "live",    render: () => LJ.track_active && LJ.track_active() },
  { file: "05-send-parcel", pre: "Send ",      accent: "parcels", render: () => LJ.home_pins && LJ.home_pins() },
  { file: "06-payment",     pre: "Pay your ",  accent: "way",     render: () => RC.checkout_cash && RC.checkout_cash() },
];

/* device shot geometry: exact Play dims + a frame scale + label size per device */
const DEVICES = {
  phone: { pre: "ph",  W: 1080, H: 1920, fs: 1.72, lbl: 74,  lblTop: 128, stageTop: 262 },
  t7:    { pre: "t7",  W: 1200, H: 2133, fs: 1.9,  lbl: 82,  lblTop: 156, stageTop: 300 },
  t10:   { pre: "t10", W: 1620, H: 2880, fs: 2.56, lbl: 110, lblTop: 212, stageTop: 400 },
};

/* Neutral frameless screen — no device bezel, no notch. Soft rounded corners + a light hairline
   and shadow so the screen still reads as a screen on the backdrop, without implying iOS/Android. */
const LW = 384, LH = 816;

function PhoneFrame({ children }) {
  return (
    <div style={{
      width: LW, height: LH, borderRadius: 40, background: "#fff", overflow: "hidden",
      position: "relative", boxSizing: "border-box", border: "1px solid rgba(20,24,27,.06)",
      boxShadow: "0 40px 70px -24px rgba(20,24,27,.26), 0 8px 22px -10px rgba(20,24,27,.16)",
    }}>{children}</div>
  );
}

function Shot({ dev, shot }) {
  let body;
  try { body = shot.render() || <div style={{ padding: 24, color: MUTED }}>“{shot.file}” unavailable</div>; }
  catch (e) { body = <div style={{ padding: 24, color: "var(--danger)", fontSize: 13 }}>{shot.file}: {String(e.message || e)}</div>; }
  return (
    <div id={dev.pre + "-" + shot.file.slice(0, 2)} style={{ position: "relative", width: dev.W, height: dev.H, background: BACKDROP, overflow: "hidden", fontFamily: "var(--font-sans)", flex: "none" }}>
      {/* faint green grounding glow behind the device */}
      <div style={{ position: "absolute", left: "50%", top: "56%", width: "120%", height: "70%", transform: "translate(-50%,-50%)", background: "radial-gradient(ellipse at center, rgba(0,177,79,.06), rgba(0,177,79,0) 62%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: dev.lblTop, textAlign: "center", fontWeight: 700, fontSize: dev.lbl, letterSpacing: "-.02em", color: INK, lineHeight: 1 }}>
        {shot.pre}<b style={{ color: DGREEN, fontWeight: 700 }}>{shot.accent}</b>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: dev.stageTop, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `scale(${dev.fs})` }}><PhoneFrame>{body}</PhoneFrame></div>
      </div>
    </div>
  );
}

/* ── app tile (from assets/brand/lyniago-icon.svg) — full bleed, opaque ── */
function AppTile({ px }) {
  return (
    <svg width={px} height={px} viewBox="0 0 128 128" style={{ display: "block" }}>
      <rect width="128" height="128" fill="#00B14F" />
      <g transform="translate(16,16)">
        <polygon points="28,6 58,32 38,42" fill="#fff" />
        <polygon points="90,26 14,52 48,60" fill="#fff" />
        <polygon points="90,26 48,60 42,84" fill="#fff" opacity=".62" />
        <path d="M90 26 L48 60" stroke="#00B14F" strokeWidth="2.4" fill="none" />
        <path d="M70.5 30.2 L81.5 43.8" stroke="#00B14F" strokeWidth="2.4" fill="none" />
      </g>
    </svg>
  );
}

/* ── feature graphic 1024×500: wordmark lockup + tagline, real tracking screen entering right ── */
function Feature() {
  let track;
  try { track = LJ.track_active ? LJ.track_active() : null; } catch (e) { track = null; }
  return (
    <div id="feature" style={{ position: "relative", width: 1024, height: 500, background: BACKDROP, overflow: "hidden", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", paddingLeft: 74, flex: "none" }}>
      <div style={{ position: "absolute", left: "32%", top: "50%", width: "80%", height: "80%", transform: "translate(-50%,-50%)", background: "radial-gradient(ellipse at center, rgba(0,177,79,.07), rgba(0,177,79,0) 60%)" }} />
      <div style={{ position: "relative", zIndex: 3, maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
          <span style={{ width: 60, height: 60 }}><AppTile px={60} /></span>
          <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 52, letterSpacing: ".3px", color: INK, lineHeight: 1 }}>Lynia<span style={{ color: AGREEN }}>Go</span></span>
        </div>
        <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-.02em", color: INK, lineHeight: 1.1 }}>Packages &amp; food,<br /><b style={{ color: DGREEN }}>delivered.</b></div>
        <div style={{ fontSize: 19, fontWeight: 600, color: MUTED, marginTop: 14 }}>Order food or send a parcel — track it live.</div>
      </div>
      <div style={{ position: "absolute", right: -40, top: "50%", transform: "translateY(-50%) scale(.92)", zIndex: 1 }}>
        <PhoneFrame>{track}</PhoneFrame>
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: INK, letterSpacing: "-.3px" }}>{title}</div>
      <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>{children}</div>
    </div>
  );
}

/* The mocks pass <image-slot> drop-slots as photos. For a photo-less store asset we swap each slot
   for a plain <img> tinted-initial tile (the card's designed no-photo look). Plain <img> — no custom
   element / shadow DOM — so html-to-image captures it reliably; a MutationObserver re-applies the
   swap if React re-renders and restores a slot. */
function tileURL(initial, circle) {
  const c = document.createElement("canvas");
  c.width = 300; c.height = circle ? 300 : 200;
  const x = c.getContext("2d");
  x.fillStyle = "#e9f8ef";
  x.fillRect(0, 0, c.width, c.height);
  if (initial) {
    x.fillStyle = "#006630"; x.globalAlpha = 0.5;
    x.font = "800 " + (circle ? 130 : 96) + "px Inter, system-ui, sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(initial, c.width / 2, c.height / 2 + 6);
  }
  return c.toDataURL("image/png");
}
/* Appetising food photos (Foodish repo, copied into _food/ — local files, so they load in the
   sandbox and rasterize cleanly in html-to-image). Restaurant-named slots get a real photo
   (best cuisine match, else a stable rotation by name); generic dish/cover/drink slots keep the
   clean tinted-initial tile. */
const FOOD = [
  "butter-chicken-1.jpg", "butter-chicken-2.jpg", "butter-chicken-3.jpg",
  "rice-1.jpg", "rice-2.jpg", "rice-3.jpg",
  "biryani-1.jpg", "biryani-2.jpg", "biryani-3.jpg",
  "burger-1.jpg", "burger-2.jpg", "burger-3.jpg",
  "dosa-1.jpg", "dosa-2.jpg", "pizza-1.jpg", "pizza-2.jpg",
];
const REST_MATCH = [
  [/sadza republic/i, "rice-1.jpg"], [/huku/i, "butter-chicken-2.jpg"],
  [/msasa|caf/i, "dosa-1.jpg"], [/kombi/i, "biryani-1.jpg"],
  [/spice/i, "butter-chicken-1.jpg"], [/burger/i, "burger-1.jpg"],
  [/mama/i, "rice-2.jpg"], [/pizza/i, "pizza-1.jpg"],
];
function foodURL(name) {
  for (const [re, f] of REST_MATCH) if (re.test(name)) return "_food/" + f;
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return "_food/" + FOOD[s % FOOD.length];
}
/* Neutralize the status bar: blank the clock / carrier / battery so the shots carry no fake
   system indicators. Keep the bar element (height + background) so layout is unchanged. */
function clearStatusBars() {
  document.querySelectorAll("div").forEach((n) => {
    const t = (n.textContent || "").trim();
    if (/^09:41/.test(t) && t.length < 24 && n.getBoundingClientRect().height < 60 && n.children.length) {
      while (n.firstChild) n.removeChild(n.firstChild);
    }
  });
}
function fillSlots() {
  document.querySelectorAll("image-slot").forEach((sl) => {
    const ph = sl.getAttribute("placeholder") || "";
    const m = ph.match(/[—-]\s*(.+)$/);
    const name = m && !/^cover|banner|dish|photo$/i.test(m[1].trim()) ? m[1].trim() : "";
    const circle = sl.getAttribute("shape") === "circle";
    const img = document.createElement("img");
    img.alt = "";
    img.src = name ? foodURL(name) : tileURL("", circle);
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" + (circle ? "border-radius:50%;" : "");
    sl.replaceWith(img);
  });
}

function App() {
  React.useEffect(() => {
    const apply = () => { fillSlots(); clearStatusBars(); };
    apply();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
    const ts = [300, 800, 1600, 2800].map((d) => setTimeout(apply, d));
    const mo = new MutationObserver(() => { if (document.querySelector("image-slot")) fillSlots(); clearStatusBars(); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { ts.forEach(clearTimeout); mo.disconnect(); };
  }, []);
  return (
    <div style={{ padding: 60, display: "flex", flexDirection: "column", gap: 64, background: "#d9dde0", minHeight: "100vh", width: "max-content" }}>
      <Group title="Phone · 1080×1920">{SHOTS.map((s) => <Shot key={"ph" + s.file} dev={DEVICES.phone} shot={s} />)}</Group>
      <Group title="7-inch tablet · 1200×2133">{SHOTS.map((s) => <Shot key={"t7" + s.file} dev={DEVICES.t7} shot={s} />)}</Group>
      <Group title="10-inch tablet · 1620×2880">{SHOTS.map((s) => <Shot key={"t10" + s.file} dev={DEVICES.t10} shot={s} />)}</Group>
      <Group title="Feature graphic · 1024×500  +  App icon · 512×512">
        <Feature />
        <div id="icon" style={{ flex: "none" }}><AppTile px={512} /></div>
      </Group>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
