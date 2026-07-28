/* LyniaGo — Google Play store assets. Frameless, Airbnb-style marketing screenshots
   built from the REAL app-screen renderers (window.LJ) + a feature graphic and app icon.
   Mounts a pannable review canvas to #root. */

const { Icon: DSIcon } = window.LyniaDesignSystem_94c56a;
const LJ = window.LJ;

/* ── mockup geometry ── */
const SW = 1080, SH = 1920;                  // Google Play phone screenshot
const SCALE = 2.4;                            // device-pixel upscale — bigger, hero-forward UI
const LOGICAL_W = 360, STATUS_H = 36, SCREEN_H = 760;
const LOGICAL_H = STATUS_H + SCREEN_H;
const DISP_W = Math.round(LOGICAL_W * SCALE);
const DISP_H = Math.round(LOGICAL_H * SCALE);
const PHONE_LEFT = Math.round((SW - DISP_W) / 2);
const PHONE_TOP = 548;
const MINT = "#e9f8ef";
const GREEN = "#00b14f";
const DGREEN = "#006630";
const GOLD = "#f2b705";
const INK = "#14181b";
const MUTED = "#5b6670";

/* ── contextual line icons (Lucide, inline — marketing asset, not the app bundle) ── */
const ICONS = {
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
};
function CtxIcon({ name, size = 52, stroke = DGREEN }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke, strokeWidth: 1.85, strokeLinecap: "round", strokeLinejoin: "round",
    dangerouslySetInnerHTML: { __html: ICONS[name] },
  });
}

/* ── clean Android status bar (drawn in the logical device, scaled with the screen) ── */
function StatusBar() {
  const glyph = { display: "flex", alignItems: "center" };
  return (
    <div style={{
      height: STATUS_H, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", background: "#fff", boxSizing: "border-box",
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums", letterSpacing: ".2px" }}>9:41</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={glyph} dangerouslySetInnerHTML={{ __html: '<svg width="17" height="12" viewBox="0 0 17 12" fill="#14181b"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>' }} />
        <span style={glyph} dangerouslySetInnerHTML={{ __html: '<svg width="16" height="12" viewBox="0 0 16 13" fill="none" stroke="#14181b" stroke-width="1.5" stroke-linecap="round"><path d="M1 4.4a11 11 0 0 1 14 0"/><path d="M3.5 7.2a7.1 7.1 0 0 1 9 0"/><path d="M6.1 9.9a3.2 3.2 0 0 1 3.8 0"/></svg>' }} />
        <span style={glyph} dangerouslySetInnerHTML={{ __html: '<svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.6" y="0.6" width="20.5" height="10.8" rx="2.6" stroke="#14181b" stroke-width="1.2"/><rect x="2.3" y="2.3" width="14" height="7.4" rx="1.2" fill="#14181b"/><rect x="22.4" y="3.7" width="1.8" height="4.6" rx="0.9" fill="#14181b"/></svg>' }} />
      </span>
    </div>
  );
}

/* ── one frameless device: logical 360-wide screen scaled up, top status bar, clipped ── */
function Device({ id, oy = 0 }) {
  let body;
  try { body = LJ[id] ? LJ[id]() : null; } catch (e) { body = <div style={{ padding: 16, fontSize: 13, color: MUTED }}>Screen “{id}” failed.</div>; }
  return (
    <div style={{
      position: "absolute", left: PHONE_LEFT, top: PHONE_TOP, width: DISP_W, height: DISP_H,
      borderRadius: "48px 48px 0 0", overflow: "hidden", background: "#fff",
      boxShadow: "0 40px 90px -24px rgba(20,24,27,.4), 0 8px 24px rgba(20,24,27,.1)",
    }}>
      <div style={{ width: LOGICAL_W, height: LOGICAL_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
        <StatusBar />
        <div style={{ position: "relative", width: LOGICAL_W, height: SCREEN_H, overflow: "hidden", background: "var(--surface)" }}>
          <div style={{ height: "100%", transform: oy ? `translateY(${oy}px)` : "none" }}>{body}</div>
        </div>
      </div>
    </div>
  );
}

/* ── floating callout card that straddles the top edge of the device (points into the app) ── */
function Callout({ c, dark }) {
  const W = 392;
  const overColor = c.tone === "gold" ? "#a9800a" : DGREEN;
  const chipBg = c.tone === "green" ? "var(--accent-wash)" : "var(--surface)";
  return (
    <div style={{ position: "absolute", left: (SW - W) / 2, top: PHONE_TOP - 34, width: W, zIndex: 5 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, background: "#fff", borderRadius: 22,
        padding: "17px 22px", boxShadow: "0 22px 48px -14px rgba(20,24,27,.32), 0 4px 12px rgba(20,24,27,.08)",
      }}>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: chipBg, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <DSIcon name={c.icon} size={27} color={DGREEN} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: ".07em", color: overColor, textTransform: "uppercase", marginBottom: 3 }}>{c.over}</div>
          <div style={{ fontSize: 23, fontWeight: 700, color: INK, lineHeight: 1.12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="lynia-tabular">{c.title}</div>
        </div>
      </div>
      {/* speech-bubble tail pointing down into the app */}
      <div style={{ width: 26, height: 26, background: "#fff", transform: "rotate(45deg)", margin: "-13px auto 0", borderRadius: 5, boxShadow: "6px 6px 12px -6px rgba(20,24,27,.18)" }} />
    </div>
  );
}

/* ── trust row (repeated, cash-market reassurance) ── */
function TrustRow({ dark }) {
  const chip = {
    display: "inline-flex", alignItems: "center", gap: 7, fontSize: 18, fontWeight: 600,
    padding: "9px 16px", borderRadius: 999,
    background: dark ? "rgba(255,255,255,.16)" : "#ffffff",
    color: dark ? "#ffffff" : MUTED,
    boxShadow: dark ? "none" : "0 2px 8px rgba(20,24,27,.05)",
    border: dark ? "1px solid rgba(255,255,255,.22)" : "1px solid rgba(20,24,27,.05)",
  };
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
      <span style={chip}><span style={{ color: GOLD, fontSize: 19 }}>★</span> 4.8 riders</span>
      <span style={chip}>Live GPS tracking</span>
      <span style={chip}>You set the price</span>
    </div>
  );
}

/* ── a single Play screenshot frame ── */
function Screenshot({ shot }) {
  const dark = !!shot.dark;
  const bg = dark ? GREEN : MINT;
  const h1Color = dark ? "#ffffff" : INK;
  const subColor = dark ? "rgba(255,255,255,.9)" : MUTED;
  return (
    <div style={{ position: "relative", width: SW, height: SH, background: bg, overflow: "hidden", fontFamily: "var(--font-sans)" }}>
      {/* grounding halo behind the device */}
      <div style={{
        position: "absolute", left: PHONE_LEFT - 40, top: PHONE_TOP + 40, width: DISP_W + 80, height: 520,
        borderRadius: "50%", background: dark ? "rgba(0,0,0,.14)" : "rgba(0,102,48,.07)", filter: "blur(46px)",
      }} />
      <div style={{ position: "absolute", top: 50, left: 90, right: 90, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{
          width: 96, height: 96, borderRadius: "50%", background: "#fff",
          display: "grid", placeItems: "center", marginBottom: 24,
          boxShadow: dark ? "0 12px 30px -8px rgba(0,0,0,.28)" : "0 10px 26px -8px rgba(0,102,48,.28)",
          border: dark ? "none" : "1px solid rgba(0,102,48,.1)",
        }}>
          <CtxIcon name={shot.icon} size={46} />
        </div>
        <h1 className={"shot-h" + (dark ? " on-green" : "")} style={{ margin: 0, fontSize: 52, fontWeight: 800, color: h1Color, lineHeight: 1.08, letterSpacing: "-1.4px", maxWidth: 840, textWrap: "balance" }}>{shot.h}</h1>
        <p style={{ margin: "16px 0 0", fontSize: 25, fontWeight: 500, color: subColor, lineHeight: 1.4, maxWidth: 680, textWrap: "balance" }}>{shot.s}</p>
        <TrustRow dark={dark} />
      </div>
      <Callout c={shot.c} dark={dark} />
      <Device id={shot.id} oy={shot.oy || 0} />
    </div>
  );
}

const HL = (base, em, tail) => <>{base}<em>{em}</em>{tail || ""}</>;

const SHOTS = [
  { id: "home_pins", icon: "send", oy: 0, label: "Send anything across town",
    h: HL("Send anything across ", "town"),
    s: "Drop two pins, name your price — a rider's on the way in minutes.",
    c: { icon: "map-pin", over: "Your route", title: "Eastgate → Avenues" } },
  { id: "home_expanded", icon: "package", oy: -8, label: "Say exactly what to collect",
    h: HL("Say exactly ", "what to collect"),
    s: "List every item and how many, so nothing gets left behind.",
    c: { icon: "package", over: "Parcel details", title: "2 items to collect" } },
  { id: "auction_counter", icon: "handshake", oy: -6, label: "You name the price",
    h: HL("You name the ", "price"),
    s: "Riders offer to carry it — accept the one that works for you.",
    c: { icon: "banknote", over: "Agreed fare", title: "$2.50 accepted", tone: "green" } },
  { id: "auction_live", icon: "users", oy: -14, label: "Pick the rider you like best",
    h: HL("Pick the ", "rider", " you like best"),
    s: "Compare price, rating and arrival time, then choose.",
    c: { icon: "user", over: "★ 4.8 · 132 trips", title: "Tendai M. · 6 min" } },
  { id: "track_active", icon: "navigation", oy: -6, label: "Follow it to the doorstep",
    h: HL("Follow it to the ", "doorstep"),
    s: "A live map and honest updates at every step of the trip.",
    c: { icon: "bike", over: "On the way", title: "Arriving in 7 min" } },
  { id: "delivered_rate", icon: "star", oy: -4, dark: true, label: "A tap to say thank you",
    h: HL("A tap to say ", "thank you"),
    s: "Rate your rider and help the best ones stand out.",
    c: { icon: "check", over: "Delivered", title: "Handed off safely", tone: "green" } },
];

/* ── brand app tile (from assets/brand/lyniago-icon.svg) ── */
function AppTile({ px, radius }) {
  return (
    <svg width={px} height={px} viewBox="0 0 128 128" style={{ display: "block", borderRadius: radius || 0 }}>
      <rect width="128" height="128" rx="0" fill="#00B14F" />
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

/* ── feature graphic 1024×500 ── */
function FeatureGraphic() {
  return (
    <div style={{ position: "relative", width: 1024, height: 500, background: MINT, overflow: "hidden", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", justifyContent: "center", gap: 46 }}>
      <div style={{ position: "absolute", left: 300, top: 90, width: 460, height: 460, borderRadius: "50%", background: "rgba(0,102,48,.06)", filter: "blur(50px)" }} />
      <div style={{ boxShadow: "0 24px 54px -16px rgba(0,102,48,.34)", borderRadius: 40, overflow: "hidden", flexShrink: 0, position: "relative" }}>
        <AppTile px={168} radius={40} />
      </div>
      <div style={{ maxWidth: 560, position: "relative" }}>
        <div style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: 64, color: INK, lineHeight: 1, letterSpacing: "-.5px" }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></div>
        <div style={{ fontSize: 27, fontWeight: 600, color: DGREEN, marginTop: 16, lineHeight: 1.25 }}>Send anything across town.</div>
        <div style={{ fontSize: 27, fontWeight: 500, color: MUTED, lineHeight: 1.3 }}>Name your price and track it to the door.</div>
      </div>
    </div>
  );
}

/* ── layout ── */
function AssetLabel({ children }) {
  return <div style={{ position: "absolute", whiteSpace: "nowrap", fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 700, color: INK, letterSpacing: "-.2px" }}>{children}</div>;
}

function App() {
  const X0 = 80, Y0 = 158, GAP = 96, LABEL_DY = 54;
  const shots = SHOTS.map((shot, i) => {
    const x = X0 + i * (SW + GAP);
    return (
      <React.Fragment key={shot.id}>
        <div style={{ position: "absolute", left: x, top: Y0 - LABEL_DY }}>
          <AssetLabel>{`${i + 1}. ${shot.label}`}</AssetLabel>
        </div>
        <div style={{ position: "absolute", left: x, top: Y0 - LABEL_DY + 26, fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: MUTED }}>Phone screenshot · 1080×1920</div>
        <div style={{ position: "absolute", left: x, top: Y0, borderRadius: 6, overflow: "hidden", boxShadow: "0 2px 0 rgba(20,24,27,.04)" }}>
          <Screenshot shot={shot} />
        </div>
      </React.Fragment>
    );
  });

  const row2Y = Y0 + SH + 200;
  const featX = X0;
  const iconX = X0 + 1024 + 140;

  return (
    <div style={{ position: "relative", width: X0 + SHOTS.length * (SW + GAP) + X0, height: row2Y + 620 }}>
      <div style={{ position: "absolute", left: X0, top: 24, fontFamily: "var(--font-sans)" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: "-.5px" }}>LyniaGo — Google Play store listing assets</div>
      </div>
      {shots}

      <div style={{ position: "absolute", left: featX, top: row2Y - LABEL_DY }}><AssetLabel>Feature graphic</AssetLabel></div>
      <div style={{ position: "absolute", left: featX, top: row2Y - LABEL_DY + 26, fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: MUTED }}>Store banner · 1024×500</div>
      <div style={{ position: "absolute", left: featX, top: row2Y, borderRadius: 6, overflow: "hidden" }}><FeatureGraphic /></div>

      <div style={{ position: "absolute", left: iconX, top: row2Y - LABEL_DY }}><AssetLabel>App icon</AssetLabel></div>
      <div style={{ position: "absolute", left: iconX, top: row2Y - LABEL_DY + 26, fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: MUTED }}>512×512 · full-bleed (store masks corners)</div>
      <div style={{ position: "absolute", left: iconX, top: row2Y, boxShadow: "0 20px 48px -18px rgba(20,24,27,.3)" }}><AppTile px={512} /></div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
