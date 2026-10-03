import React from "react";

/* Tab-bar v1 (handoff/tab-bar-v1) — floating pill bar with solid vector glyphs.
   Geometry is the spec: change values here AND in handoff/tab-bar-v1/README.md together. */
export const TAB_BAR_H = 60;       // the pill itself
export const TAB_BAR_GAP = 12;     // side + bottom float margin
export const TAB_BAR_SPACE = 72;   // TAB_BAR_H + TAB_BAR_GAP — content pads by this + 16 (+ safe-area inset)

export const APP_TABS = [
  { id: "home", glyph: "home", label: "Home" },
  { id: "orders", glyph: "orders", label: "Orders" },
  { id: "acct", glyph: "account", label: "Account" },
];
export const RIDER_TABS = [
  { id: "jobs", glyph: "jobs", label: "Jobs" },
  { id: "money", glyph: "money", label: "Money" },
  { id: "acct", glyph: "account", label: "Account" },
];

/* Solid vector glyphs, 24 grid. "f" = filled shape, "c" = knockout (transparent when idle, painted with
   the detail colour when active), "t" = fill drawn on top of the detail layer. */
const GLYPHS = {
  home: [
    ["path", "f", { d: "M3 10.2a1.5 1.5 0 0 1 .54-1.15l7.5-6.3a1.5 1.5 0 0 1 1.92 0l7.5 6.3a1.5 1.5 0 0 1 .54 1.15V19.5A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5Z" }],
    ["rect", "c", { x: 9.75, y: 13.5, width: 4.5, height: 8, rx: 1.25 }],
  ],
  orders: [
    ["path", "f", { d: "M5.5 2.5h13A1.5 1.5 0 0 1 20 4v17.2l-2.67-1.6-2.66 1.6L12 19.6l-2.67 1.6-2.66-1.6L4 21.2V4a1.5 1.5 0 0 1 1.5-1.5Z" }],
    ["rect", "c", { x: 8, y: 7, width: 8, height: 2, rx: 1 }],
    ["rect", "c", { x: 8, y: 11, width: 8, height: 2, rx: 1 }],
    ["rect", "c", { x: 8, y: 15, width: 4.5, height: 2, rx: 1 }],
  ],
  account: [
    ["circle", "f", { cx: 12, cy: 7.75, r: 4.75 }],
    ["path", "f", { d: "M3.5 20.2c0-4.1 3.8-6.7 8.5-6.7s8.5 2.6 8.5 6.7a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8Z" }],
    ["path", "c", { d: "M10 13.75h4L12 17.5Z" }],
  ],
  jobs: [
    ["rect", "f", { x: 2, y: 3, width: 8.5, height: 6.5, rx: 1.5 }],
    ["rect", "c", { x: 5.5, y: 3, width: 1.5, height: 2.5 }],
    ["rect", "f", { x: 2, y: 10.75, width: 13.5, height: 3.75, rx: 1.875 }],
    ["path", "f", { d: "M13.4 13.9 16.1 4.4a1 1 0 0 1 .96-.73H20a1 1 0 0 1 0 2h-2.2l-2.4 8.5Z" }],
    ["path", "f", { d: "M14.3 12.7l1.7-.9 3.6 6-1.7 1Z" }],
    ["circle", "f", { cx: 5.5, cy: 18.25, r: 3 }],
    ["circle", "c", { cx: 5.5, cy: 18.25, r: 1.25 }],
    ["circle", "f", { cx: 18.75, cy: 18.25, r: 3 }],
    ["circle", "c", { cx: 18.75, cy: 18.25, r: 1.25 }],
  ],
  money: [
    ["path", "f", { d: "M4.5 6.2 15.6 2.9a1.5 1.5 0 0 1 1.9 1.1l.5 2Z" }],
    ["rect", "f", { x: 2.5, y: 6, width: 19, height: 15, rx: 3 }],
    ["rect", "c", { x: 14.5, y: 11, width: 7, height: 5, rx: 2.5 }],
    ["circle", "t", { cx: 17, cy: 13.5, r: 1.25 }],
  ],
};

/* Faux-3D illustrations, 32 grid. Tones: L light/top, M mid/front, D dark/side, G gold, C coral,
   N mint, W white. Idle swaps every tone for the neutral set. */
const ILLUS = {
  home: [
    ["polygon", "D", { points: "18,15 26,11 26,23 18,27" }],
    ["rect", "M", { x: 5, y: 15, width: 13, height: 12 }],
    ["polygon", "C", { points: "11.5,6.5 19.5,2.5 27,11.5 19,15.5" }],
    ["polygon", "L", { points: "3.5,16 11.5,6.5 19.5,16" }],
    ["rect", "G", { x: 9.5, y: 20, width: 4, height: 7, rx: 1 }],
    ["polygon", "S", { points: "20.5,17.5 23.5,16 23.5,19.5 20.5,21" }],
  ],
  orders: [
    ["path", "G", { d: "M10 12V8.5a3.5 3.5 0 0 1 7 0V12", fill: "none", strokeWidth: 2, strokeLinecap: "round", stroke: "G" }],
    ["polygon", "L", { points: "6,12 12,9 26,9 20,12" }],
    ["polygon", "D", { points: "20,12 26,9 26,25 20,28" }],
    ["rect", "M", { x: 6, y: 12, width: 14, height: 16 }],
    ["rect", "W", { x: 8.5, y: 16.5, width: 9, height: 7, rx: 1 }],
    ["rect", "C", { x: 10, y: 18.5, width: 6, height: 1.5, rx: 0.75 }],
    ["rect", "S", { x: 10, y: 21, width: 4, height: 1.5, rx: 0.75 }],
  ],
  account: [
    ["path", "M", { d: "M5 28c0-6 4.9-10 11-10s11 4 11 10Z" }],
    ["path", "D", { d: "M16 18c6.1 0 11 4 11 10H16Z" }],
    ["path", "N", { d: "M13 18.4 16 22l3-3.6A11 11 0 0 0 16 18a11 11 0 0 0-3 .4Z" }],
    ["circle", "L", { cx: 16, cy: 10.5, r: 6 }],
    ["path", "M", { d: "M16 4.5a6 6 0 0 1 0 12a7.5 7.5 0 0 0 0-12Z" }],
  ],
  jobs: [
    ["rect", "S", { x: 1, y: 15, width: 3.5, height: 1.5, rx: 0.75 }],
    ["rect", "N", { x: 0.5, y: 19, width: 4, height: 1.5, rx: 0.75 }],
    ["polygon", "L", { points: "6,11 16,7 26,11 16,15" }],
    ["polygon", "M", { points: "6,11 16,15 16,28 6,23.5" }],
    ["polygon", "D", { points: "16,15 26,11 26,23.5 16,28" }],
    ["polygon", "G", { points: "10.5,8.8 20.5,12.8 20.5,17 18,18 18,13.8 8,9.8" }],
  ],
  money: [
    ["circle", "G", { cx: 24.5, cy: 8.5, r: 4.5 }],
    ["circle", "C", { cx: 24.5, cy: 8.5, r: 2, opacity: 0.55 }],
    ["polygon", "N", { points: "6.5,13 19.5,7 22,12 9,18" }],
    ["rect", "M", { x: 3.5, y: 12, width: 22, height: 16, rx: 3 }],
    ["rect", "L", { x: 3.5, y: 12, width: 22, height: 3.5, rx: 1.75 }],
    ["rect", "D", { x: 17, y: 17.5, width: 10.5, height: 6.5, rx: 3.25 }],
    ["circle", "G", { cx: 21, cy: 20.75, r: 1.5 }],
  ],
};
const ILLUS_ON = { L: "var(--illus-light)", M: "var(--illus-mid)", D: "var(--illus-dark)", G: "var(--illus-gold)", C: "var(--illus-coral)", N: "var(--illus-mint)", S: "var(--illus-sky)", W: "var(--bg)" };
const ILLUS_IDLE = { L: "var(--illus-idle-light)", M: "var(--illus-idle-mid)", D: "var(--illus-idle-dark)", G: "var(--illus-idle-light)", C: "var(--illus-idle-mid)", N: "var(--illus-idle-light)", S: "var(--illus-idle-light)", W: "var(--bg)" };
/* Illustrated variant: the active pill takes the matching Home tile tint, ringed in its ink. */
const TAB_TINT = {
  home: ["var(--tile-mint)", "var(--accent-illus)"],
  orders: ["var(--tile-peach)", "var(--coral-ink)"],
  account: ["var(--tile-lilac)", "var(--rider-accent)"],
  jobs: ["var(--tile-mint)", "var(--accent-illus)"],
  money: ["var(--tile-sun)", "var(--sun-ink)"],
};

/** Faux-3D tab illustration (32 grid). Full colour when active, neutral set when idle. */
export function TabIllus({ name, size = 28, idle = false, style }) {
  const pal = idle ? ILLUS_IDLE : ILLUS_ON;
  const parts = ILLUS[name] || ILLUS.home;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      {parts.map(([t, tone, a], i) => {
        const p = { key: i, ...a };
        if (a.stroke) { p.stroke = pal[a.stroke]; } else { p.fill = pal[tone]; }
        return React.createElement(t, { ...p, style: { transition: "fill 300ms ease, stroke 300ms ease" } });
      })}
    </svg>
  );
}

let _gid = 0;
/** Solid vector glyph. Knockouts are transparent, or painted with `detail` (two-tone active state). */
export function TabGlyph({ name, size = 24, color = "currentColor", detail, style }) {
  const [id] = React.useState(() => "tg" + ++_gid);
  const parts = GLYPHS[name] || GLYPHS.home;
  const fills = parts.filter((p) => p[1] === "f").map(([t, , a], i) => React.createElement(t, { key: "f" + i, ...a }));
  const cuts = parts.filter((p) => p[1] === "c").map(([t, , a], i) => React.createElement(t, { key: "c" + i, ...a, fill: "#000" }));
  const tops = parts.filter((p) => p[1] === "t").map(([t, , a], i) => React.createElement(t, { key: "t" + i, ...a }));
  const details = detail ? parts.filter((p) => p[1] === "c").map(([t, , a], i) => React.createElement(t, { key: "d" + i, ...a })) : null;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0, ...style }}>
      {cuts.length ? <defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff" />{cuts}</mask></defs> : null}
      <g fill={color} mask={cuts.length ? `url(#${id})` : undefined} style={{ transition: "fill 300ms ease" }}>{fills}</g>
      {details ? <g fill={detail}>{details}</g> : null}
      {tops.length ? <g fill={color} style={{ transition: "fill 300ms ease" }}>{tops}</g> : null}
    </svg>
  );
}

/* Badge geometry: 16px core + 2px --bg ring = 20px box (dot: 8 + 2 ring = 12). Anchored to the cell,
   left edge at cell centre + 4px, top 0 / 4px — overlaps the glyph's top-right corner. */
/* One-shot keyframes (≤200ms). Injected once; never looped. */
let _kf = false;
function ensureKeyframes() {
  if (_kf || typeof document === "undefined") return;
  _kf = true;
  const el = document.createElement("style");
  el.setAttribute("data-tabbar-v1", "");
  el.textContent = "@keyframes tbGlyphPop{0%{transform:scale(.92)}100%{transform:scale(1)}}@keyframes tbIllusPop{0%{transform:translateY(0) scale(.94)}100%{transform:translateY(-2px) scale(1.08)}}@keyframes tbBadgePop{0%{transform:scale(.4)}65%{transform:scale(1.15)}100%{transform:scale(1)}}";
  document.head.appendChild(el);
}

function Badge({ b, motion }) {
  if (!b) return null;
  const ring = { position: "absolute", boxSizing: "border-box", border: "2px solid var(--bg)", borderRadius: "var(--radius-pill)", pointerEvents: "none", transformOrigin: "0% 100%", animation: motion ? "tbBadgePop 160ms cubic-bezier(0.2, 0, 0, 1) both" : "none", boxShadow: "var(--shadow-badge)" };
  if (b.kind === "dot") return <span style={{ ...ring, left: "calc(50% + 6px)", top: 4, width: 12, height: 12, background: "var(--highlight)" }} />;
  const txt = { fontSize: 12, lineHeight: "16px", fontWeight: 700, fontVariantNumeric: "tabular-nums" };
  const box = { ...ring, left: "calc(50% + 4px)", top: 0, height: 20, minWidth: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "0 4px", ...txt };
  if (b.kind === "warn") return <span style={{ ...box, width: 20, padding: 0, background: "var(--highlight)", color: "var(--ink)" }}>!</span>;
  const n = b.n == null ? 1 : b.n;
  const label = n > 9 ? "9+" : String(n);
  if (b.kind === "live") return <span style={{ ...box, padding: "0 6px 0 5px", background: "var(--live-bar)", color: "var(--on-accent)" }}><span style={{ width: 6, height: 6, borderRadius: "var(--radius-pill)", background: "var(--illus-gold)" }} />{label}</span>;
  return <span style={{ ...box, background: "var(--cta-fill)", color: "var(--on-accent)" }}>{label}</span>;
}

function srBadge(tabId, b) {
  if (!b) return "";
  const n = b.n == null ? 1 : b.n;
  if (b.kind === "live") return n === 1 ? "1 active order" : `${n} active orders`;
  if (b.kind === "warn") return tabId === "money" ? "top-up needed" : "action needed";
  if (b.kind === "dot") return "action needed";
  if (b.kind === "count") return tabId === "jobs" ? (n === 1 ? "1 new job" : `${n} new jobs`) : `${n} new`;
  return "";
}

/* Glass material: 72% --bg + 24px blur + 180% saturate. Label/glyph contrast is computed against the
   tint alone, so 72% keeps --muted ≥ 4.5:1 over any backdrop. Falls back to solid --bg when the user
   asks for reduced transparency or more contrast, or the platform has no backdrop-filter. */
const GLASS_BG = "color-mix(in srgb, var(--bg) 72%, transparent)";
const GLASS_FX = "blur(24px) saturate(180%)";
function useGlass(want) {
  const q = () => {
    if (!want || typeof window === "undefined") return false;
    const css = window.CSS && CSS.supports && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")) && CSS.supports("background", GLASS_BG);
    const mm = (s) => window.matchMedia && window.matchMedia(s).matches;
    return !!css && !mm("(prefers-reduced-transparency: reduce)") && !mm("(prefers-contrast: more)") && !mm("(forced-colors: active)");
  };
  const [ok, setOk] = React.useState(q);
  React.useEffect(() => {
    if (!want || !window.matchMedia) { setOk(q()); return; }
    const ms = ["(prefers-reduced-transparency: reduce)", "(prefers-contrast: more)", "(forced-colors: active)"].map((s) => window.matchMedia(s));
    const on = () => setOk(q());
    ms.forEach((m) => m.addEventListener && m.addEventListener("change", on));
    on();
    return () => ms.forEach((m) => m.removeEventListener && m.removeEventListener("change", on));
  }, [want]);
  return ok;
}

/**
 * Bottom tab bar — floating pill, three tabs, the app root (never a product switcher).
 * Customer: Home · Orders · Account. Rider: Jobs · Money · Account. Hidden when the keyboard is open.
 */
export function TabBar({ active, role = "customer", tabs, badges = {}, dot, onTab, onReselect, inset = 0, hidden = false, reduceMotion = false, glyphStyle = "illustrated", material = "glass", previewPressed, previewFocus, style, ...rest }) {
  const list = tabs || (role === "rider" ? RIDER_TABS : APP_TABS);
  const cur = active ?? list[0].id;
  const idx = Math.max(0, list.findIndex((t) => t.id === cur));
  const [pressedS, setPressed] = React.useState(null);
  const [kbFocusS, setKbFocus] = React.useState(null);
  const pressed = previewPressed ?? pressedS;
  const kbFocus = previewFocus ?? kbFocusS;
  const kbRef = React.useRef(false);
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; }, []);
  ensureKeyframes();
  const glass = useGlass(material === "glass");
  const anim = !reduceMotion && mounted.current;
  const all = { ...(dot ? { [dot]: { kind: "dot" } } : null), ...badges };
  if (hidden) return null;
  const n = list.length;
  const move = reduceMotion ? "none" : "transform 420ms cubic-bezier(0.32, 0.72, 0, 1), background-color 300ms ease";
  const ill = glyphStyle === "illustrated";
  const tint = TAB_TINT[(list[idx] || {}).glyph] || TAB_TINT.home;
  const tap = (t) => { if (t.id === cur) { onReselect && onReselect(t.id); return; } onTab && onTab(t.id); };
  return (
    <div role="tablist" aria-label="Main" style={{ position: "absolute", left: TAB_BAR_GAP, right: TAB_BAR_GAP, bottom: TAB_BAR_GAP + inset, height: TAB_BAR_H, boxSizing: "border-box", padding: 4, display: "flex", background: glass ? GLASS_BG : "var(--bg)", backdropFilter: glass ? GLASS_FX : undefined, WebkitBackdropFilter: glass ? GLASS_FX : undefined, borderRadius: "var(--radius-pill)", zIndex: 20, fontFamily: "var(--font-sans)", ...style }}
      onKeyDown={() => { kbRef.current = true; }} onPointerDown={() => { kbRef.current = false; }} {...rest}>
      <span aria-hidden="true" style={{ position: "absolute", top: 4, left: 4, width: `calc((100% - 8px) / ${n})`, height: 52, borderRadius: "var(--radius-pill)", background: ill ? "var(--tile-mint)" : (pressed === cur ? "var(--cta-fill-pressed)" : "var(--cta-fill)"), transform: `translateX(${idx * 100}%)`, transition: move }} />
      {list.map((t, i) => {
        const on = t.id === cur;
        const b = all[t.id];
        const sr = [t.label, `tab, ${i + 1} of ${n}`, srBadge(t.id, b)].filter(Boolean).join(", ");
        const ink = on ? (ill ? "var(--ink)" : "var(--on-accent)") : "var(--muted)";
        return (
          <div key={t.id} role="tab" aria-selected={on} aria-label={sr} tabIndex={on ? 0 : -1}
            onClick={() => tap(t)}
            onPointerDown={() => setPressed(t.id)} onPointerUp={() => setPressed(null)} onPointerLeave={() => setPressed(null)} onPointerCancel={() => setPressed(null)}
            onFocus={() => kbRef.current && setKbFocus(t.id)} onBlur={() => setKbFocus(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(t); }
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const j = (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n; const el = e.currentTarget.parentNode.querySelectorAll('[role="tab"]')[j]; el && el.focus(); }
            }}
            style={{ flex: 1, minWidth: 0, height: 52, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: ill ? 2 : 4, borderRadius: "var(--radius-pill)", cursor: "pointer", outline: "none", WebkitTapHighlightColor: "transparent", userSelect: "none", background: pressed === t.id && !on ? "var(--surface)" : "transparent", transform: pressed === t.id ? "scale(0.97)" : "none", transition: reduceMotion ? "none" : (pressed === t.id ? "transform 160ms cubic-bezier(0.32, 0.72, 0, 1), background-color 160ms ease" : "transform 360ms cubic-bezier(0.32, 0.72, 0, 1), background-color 300ms ease"), boxShadow: kbFocus === t.id ? "0 0 0 2px var(--bg), 0 0 0 4px var(--ink)" : "none" }}>
            <span style={{ display: "block", willChange: "transform", transform: on ? (ill ? "translateY(-2px) scale(1.08)" : "scale(1)") : (ill ? "none" : "scale(0.96)"), transition: reduceMotion ? "none" : "transform 420ms cubic-bezier(0.32, 0.72, 0, 1)" }}>{ill ? <TabIllus name={t.glyph} idle={!on} /> : <TabGlyph name={t.glyph} color={ink} detail={on ? "var(--accent)" : undefined} />}</span>
            <span style={{ fontSize: 12, lineHeight: "16px", letterSpacing: 0, fontWeight: 700, color: ink, whiteSpace: "nowrap", transition: reduceMotion ? "none" : "color 300ms ease" }}>{t.label}</span>
            <Badge key={b ? b.kind + (b.n || "") : "none"} b={b} motion={anim} />
          </div>
        );
      })}
    </div>
  );
}
