/* LyniaGo — support / onboarding / edge flows kit.
   A gallery of the peripheral screens the core courier kit doesn't cover: first-run onboarding,
   permission priming, notifications centre, help, settings, and the system/edge states
   (suspended, force-update, no-GPS, generic error). Built from the design-system bundle. */

const D = window.LyniaDesignSystem_94c56a;
const { Button, Card, Field, StatusPill, EmptyState, Icon, Heading, Sub, Label } = D;

/* Dove mark (creases only ≥32px, per brand rule) */
function Dove({ size = 40, on = "green" }) {
  const fill = on === "green" ? "#fff" : "var(--accent)";
  const keel = on === "green" ? "rgba(255,255,255,.62)" : "var(--accent-700)";
  const crease = on === "green" ? "var(--accent)" : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polygon points="28,6 58,32 38,42" fill={fill} />
      <polygon points="90,26 14,52 48,60" fill={fill} />
      <polygon points="90,26 48,60 42,84" fill={keel} />
      {size >= 32 ? <path d="M90 26 L48 60 M70.5 30.2 L81.5 43.8" stroke={crease} strokeWidth="2.4" fill="none" /> : null}
    </svg>
  );
}
function Wordmark({ size = 22, color = "var(--ink)" }) {
  return <span style={{ fontFamily: "var(--font-wordmark)", fontWeight: 600, fontSize: size, color }}>Lynia<span style={{ color: "var(--accent-700)" }}>Go</span></span>;
}

/* Phone frame with a caption */
function Phone({ label, children, bg = "var(--surface)" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ width: 300, height: 620, background: bg, borderRadius: 30, border: "9px solid #14181b", overflow: "hidden", position: "relative", boxShadow: "0 14px 40px rgba(20,24,27,.22)" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 96, height: 20, background: "#14181b", borderRadius: "0 0 12px 12px", zIndex: 30 }} />
        <div style={{ height: "100%", overflowY: "auto" }}>{children}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-sans)" }}>{label}</div>
    </div>
  );
}
const Pad = ({ children, style }) => <div style={{ padding: "var(--space-screen)", minHeight: "100%", boxSizing: "border-box", ...style }}>{children}</div>;
/* Pushed-screen header — DS AppBar is the source of truth; the local render is the fallback for a
   bundle compiled before AppBar existed. */
const Top = ({ title, onBack }) => (D.AppBar ? (
  <div style={{ marginBottom: 6, marginLeft: -12, marginRight: -12, paddingTop: 6 }}>
    <D.AppBar title={title} back={onBack !== false} transparent />
  </div>
) : (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingTop: 14 }}>
    {onBack !== false ? <Icon name="chevron-right" size={20} color="var(--ink)" style={{ transform: "rotate(180deg)" }} /> : null}
    <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-sans)", letterSpacing: "-0.02em" }}>{title}</span>
  </div>
));

/* Full-screen system state — DS SystemState is the source of truth; `brand` passes the dove in as
   the mark slot so the brand mark stays in this kit. Local render is the stale-bundle fallback. */
function SystemState({ tone = "white", icon, title, message, primary, secondary, brand }) {
  const green = tone === "green";
  const mark = brand ? <Dove size={56} on={green ? "green" : "white"} /> : undefined;
  if (D.SystemState) return <D.SystemState tone={tone} icon={icon} mark={mark} title={title} message={message} primary={primary} secondary={secondary} />;
  return (
    <Pad style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 4, background: green ? "var(--accent)" : "var(--bg)" }}>
      {brand ? <div style={{ marginBottom: 12 }}>{mark}</div> : (
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: green ? "rgba(255,255,255,.16)" : "var(--surface)", display: "grid", placeItems: "center", marginBottom: 14 }}>
          <Icon name={icon} size={34} color={green ? "#fff" : "var(--accent-text)"} />
        </div>
      )}
      <div style={{ fontSize: 19, fontWeight: 700, color: green ? "#fff" : "var(--ink)", fontFamily: "var(--font-sans)" }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: green ? "rgba(255,255,255,.9)" : "var(--muted)", maxWidth: 230, fontFamily: "var(--font-sans)" }}>{message}</div>
      <div style={{ alignSelf: "stretch", marginTop: 18 }}>
        {primary ? (green
          ? <button style={{ width: "100%", minHeight: 52, borderRadius: 999, border: "none", background: "#fff", color: "var(--accent-700)", fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>{primary}</button>
          : <Button label={primary} />) : null}
        {secondary ? <Button label={secondary} variant="ghost" /> : null}
      </div>
    </Pad>
  );
}

window.LyniaSupport = { Dove, Wordmark, Phone, Pad, Top, SystemState, D };
