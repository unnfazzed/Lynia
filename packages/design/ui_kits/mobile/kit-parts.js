/* Lynia mobile UI kit — composites over the design-system bundle (window.LyniaDesignSystem_94c56a).
   FauxMap is a stylised placeholder (not real tiles): percent-coordinate pins, tap-to-pin, and a
   route line that follows the pins — the DT5 map-anchored home is built on it. Recreation, not
   production code. */

const DS = window.LyniaDesignSystem_94c56a;
const { Button, Card, Field, StatusPill, Stepper, EmptyState, Heading, Sub, Label, SkeletonList, Icon } = DS;

/* ── Pin — percent coords ── */
function Pin({ x, y, color, label }) {
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-100%)", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: color, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}>{label}</div>
      <div style={{ width: 2, height: 8, background: color }} />
    </div>
  );
}

/* ── Faux map ──
   pins: { a: {x,y}|null, b: {x,y}|null } in PERCENT. onTap(pt) fires with percent coords.
   rider: show the bike marker interpolated a→b by riderPos (0..1). fill: stretch to parent. */
const DEFAULT_PINS = { a: { x: 20, y: 24 }, b: { x: 78, y: 74 } };
function FauxMap({ height = 190, fill = false, pins = DEFAULT_PINS, rider = false, riderPos = 0.5, onTap, paused = false }) {
  const a = pins.a, b = pins.b;
  const rx = a && b ? a.x + (b.x - a.x) * riderPos : 50;
  const ry = a && b ? a.y + (b.y - a.y) * riderPos : 50;
  return (
    <div
      onClick={onTap ? (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onTap({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
      } : undefined}
      style={{
        position: "relative",
        height: fill ? "100%" : height,
        borderRadius: fill ? 0 : "var(--radius-input)",
        overflow: "hidden",
        cursor: onTap ? "crosshair" : "default",
        background:
          "repeating-linear-gradient(0deg,#eef1f3 0 1px,transparent 1px 34px)," +
          "repeating-linear-gradient(90deg,#eef1f3 0 1px,transparent 1px 40px)," +
          "linear-gradient(135deg,#f2f5f6,#e9edf0)",
        border: fill ? "none" : "1px solid var(--line)",
      }}
    >
      {a && b ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <path
            d={`M ${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.55} ${a.y}, ${a.x + (b.x - a.x) * 0.45} ${b.y}, ${b.x} ${b.y}`}
            fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="0.8 2.6" strokeLinecap="round" opacity="0.75" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }}
          />
        </svg>
      ) : null}
      {a ? <Pin x={a.x} y={a.y} color="var(--accent)" label="A" /> : null}
      {b ? <Pin x={b.x} y={b.y} color="var(--danger)" label="B" /> : null}
      {rider && a && b ? (
        <div style={{ position: "absolute", left: `${rx}%`, top: `${ry}%`, transform: "translate(-50%,-50%)", width: 30, height: 30, borderRadius: "50%", background: paused ? "var(--muted)" : "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.3)", opacity: paused ? 0.7 : 1 }}>
          <Icon name="bike" size={16} color="#fff" />
        </div>
      ) : null}
      {paused ? (
        <div style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--ink)", color: "#fff", borderRadius: "var(--radius-pill)", padding: "5px 10px", fontSize: 11, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: 0.7 }} /> Live paused — reconnecting…
        </div>
      ) : null}
    </div>
  );
}

/* ── Offer card — composite over Card (the customer's bid row). ── */
function OfferCard({ o, recommended, onChoose }) {
  return (
    <Card accent={recommended} style={recommended ? { borderColor: "var(--highlight)" } : undefined}>
      {recommended ? <div style={{ fontSize: 10, fontWeight: 700, color: "var(--highlight-ink)", letterSpacing: 0.5, marginBottom: 3 }}>★ RECOMMENDED</div> : null}
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{o.name}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }} className="lynia-tabular">★ {o.rating} · {o.trips} trips · ETA {o.eta} min</div>
      <div style={{ fontSize: 20, fontWeight: 700, margin: "4px 0" }} className="lynia-tabular">${o.fare}</div>
      <Button label="Choose this rider" onClick={onChoose} />
    </Card>
  );
}

/* ── Sort chips (segmented pills) ── */
function SortChips({ value, onChange }) {
  const modes = [["best", "Best match"], ["cheapest", "Cheapest"], ["fastest", "Fastest"], ["rated", "Top rated"]];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--space-sm)" }}>
      {modes.map(([k, lbl]) => {
        const on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            minHeight: 36, padding: "0 14px", borderRadius: "var(--radius-pill)",
            border: `1px solid ${on ? "var(--accent-text)" : "var(--line)"}`, background: on ? "var(--accent-wash)" : "var(--bg)",
            color: on ? "var(--accent-text)" : "var(--muted)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{lbl}</button>
        );
      })}
    </div>
  );
}

/* ── Pin-target segmented toggle (DT5): selected colour == the pin being placed ── */
function PinToggle({ target, onChange, hasPickup, hasDrop }) {
  const opts = [
    ["pickup", "Pickup", "var(--accent)", hasPickup],
    ["drop", "Drop-off", "var(--danger)", hasDrop],
  ];
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface)", borderRadius: "var(--radius-pill)", padding: 4 }}>
      {opts.map(([k, lbl, color, done]) => {
        const on = target === k;
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            flex: 1, minHeight: 36, border: "none", borderRadius: "var(--radius-pill)",
            background: on ? color : "transparent", color: on ? "#fff" : "var(--muted)",
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {done ? <Icon name="check" size={14} color={on ? "#fff" : "var(--accent-text)"} /> : null}
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

/* ── MapSheet (DT5): the bottom sheet over the full-bleed map. Two snap states: peek / expanded.
   Tap the handle (or the chevron) to toggle — real drag physics are device-gated (DT5). ── */
function MapSheet({ expanded, onToggle, children, footer }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10,
      background: "var(--bg)", borderRadius: "20px 20px 0 0", boxShadow: "var(--shadow-sheet)",
      display: "flex", flexDirection: "column", maxHeight: expanded ? "88%" : "58%",
    }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse the sheet" : "Expand for more details"}
        style={{ background: "none", border: "none", padding: "10px 0 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
      >
        <span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }} />
      </button>
      <div style={{ overflowY: "auto", padding: "4px var(--space-screen) 0" }}>{children}</div>
      {footer ? <div style={{ padding: "0 var(--space-screen) var(--space-md)" }}>{footer}</div> : null}
    </div>
  );
}

/* Best-match ranking (port of @lynia/shared offer-ranking.ts, D-d). Blends price/rating/ETA so a
   cheap-but-slow-and-poorly-rated offer doesn't automatically win. Returns indexes best-first. */
const OFFER_WEIGHTS = { price: 0.45, rating: 0.35, eta: 0.2 };
const NEW_RIDER_RATING_SCORE = 0.5;
function normv(value, min, max, lowerIsBetter) {
  if (max <= min) return 0.5;
  const t = (value - min) / (max - min);
  return lowerIsBetter ? 1 - t : t;
}
function rankOffers(offers) {
  // offers: [{ offeredFare, ratingAvg, ratingCount, etaMinutes }]
  if (offers.length === 0) return [];
  const fares = offers.map((o) => o.offeredFare);
  const etas = offers.map((o) => o.etaMinutes);
  const rated = offers.filter((o) => o.ratingCount > 0).map((o) => o.ratingAvg);
  const fMin = Math.min(...fares), fMax = Math.max(...fares);
  const eMin = Math.min(...etas), eMax = Math.max(...etas);
  const rMin = rated.length ? Math.min(...rated) : 0, rMax = rated.length ? Math.max(...rated) : 0;
  const scored = offers.map((o, index) => {
    const price = normv(o.offeredFare, fMin, fMax, true);
    const eta = normv(o.etaMinutes, eMin, eMax, true);
    const rating = o.ratingCount > 0 ? normv(o.ratingAvg, rMin, rMax, false) : NEW_RIDER_RATING_SCORE;
    return { index, score: OFFER_WEIGHTS.price * price + OFFER_WEIGHTS.rating * rating + OFFER_WEIGHTS.eta * eta };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const oa = offers[a.index], ob = offers[b.index];
    if (oa.offeredFare !== ob.offeredFare) return oa.offeredFare - ob.offeredFare;
    if (oa.ratingAvg !== ob.ratingAvg) return ob.ratingAvg - oa.ratingAvg;
    if (oa.etaMinutes !== ob.etaMinutes) return oa.etaMinutes - ob.etaMinutes;
    return a.index - b.index;
  });
  return scored.map((s) => s.index);
}

window.LyniaKit = { FauxMap, OfferCard, SortChips, Pin, PinToggle, MapSheet, rankOffers };
