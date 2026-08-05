import React from "react";

// One timeline seen from two sides (CONCEPT §5c): customer and rider labels are paired so a step
// reads as the same event from either screen.
const STEP_ORDER = ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed"];

const STEP_LABELS = {
  customer: {
    assigned: "Ride accepted",
    confirmed: "Items & note confirmed",
    en_route_pickup: "Rider on the way to pickup",
    picked_up: "Items collected",
    en_route_dropoff: "On the way to drop-off",
    delivered: "Delivered (OTP)",
    completed: "Rate your rider",
  },
  rider: {
    assigned: "You're assigned",
    confirmed: "Details confirmed",
    en_route_pickup: "Heading to pickup",
    picked_up: "Parcel collected",
    en_route_dropoff: "Heading to drop-off",
    delivered: "Delivered",
    completed: "Completed — you're free",
  },
};

/** The Food/merchant flavour of the same 7-step grammar — pass as `steps`. */
export const RESTAURANT_STEPS = ["Order placed", "Restaurant accepted", "Rider secured", "Rider at restaurant", "Picked up", "On the way", "Delivered"];

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Lynia §5c journey stepper — the ONE 7-step delivery timeline for every vertical. Two ways in:
 * the event API (`events` + `currentStatus` + `view`, paired customer/rider labels) or the plain
 * API (`steps` labels + `step` index + `times` + `failAt`) used by verticals with their own copy.
 * Steps before the current one are done (✓ + time), the current one is "now" (accent, live), later
 * ones muted; `failAt` marks a step as failed (danger ring + !).
 */
export function Stepper({ events = [], currentStatus, view = "customer", steps, step, times: timesIn, failAt, style, ...rest }) {
  const plain = Array.isArray(steps);
  const labels = plain ? steps : STEP_ORDER.map((s) => (STEP_LABELS[view] ?? STEP_LABELS.customer)[s]);
  let currentIdx, stamps = {};
  if (plain) {
    currentIdx = step ?? 0;
    stamps = timesIn || {};
  } else {
    currentIdx = STEP_ORDER.indexOf(currentStatus);
    const seen = {};
    for (const e of events) if (!(e.status in seen)) seen[e.status] = e.createdAt;
    STEP_ORDER.forEach((s, i) => { if (seen[s]) stamps[i] = fmtTime(seen[s]); });
  }
  return (
    <div className="lynia-stepper" style={style} {...rest}>
      {labels.map((label, i) => {
        const done = currentIdx >= 0 && i < currentIdx;
        const now = i === currentIdx;
        const failed = failAt === i;
        const onTrack = done || now;
        const last = i === labels.length - 1;
        const ring = failed ? "var(--danger)" : onTrack ? "var(--accent)" : "var(--line)";
        const ts = stamps[i];
        return (
          <div key={label} style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 26 }}>
              {/* Done node is a mint wash (--accent-wash) with a green (--accent-text) glyph, NOT the
                  bright --accent fill with a white glyph: a white ✓ on --accent (#00B14F) is ≈2.9:1 and
                  fails WCAG, whereas green-on-mint clears ≈6.5:1. The failed node keeps its white "!" on
                  --danger (≈5.4:1, passes). Mirrors the shipped Stepper (apps/mobile/src/ui/index.tsx). */}
              <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${ring}`, background: failed ? "var(--danger)" : done ? "var(--accent-wash)" : "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: "var(--weight-extrabold)", color: failed ? "var(--on-accent)" : done || now ? "var(--accent-text)" : "var(--muted)" }}>
                  {failed ? "!" : done ? "✓" : String(i + 1)}
                </span>
              </div>
              {!last ? <div style={{ flex: 1, width: 2, minHeight: 16, background: done ? "var(--accent)" : "var(--line)" }} /> : null}
            </div>
            <div style={{ flex: 1, paddingLeft: "var(--space-sm)", paddingBottom: last ? 0 : "var(--space-md)" }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: onTrack ? "var(--weight-bold)" : "var(--weight-semibold)", color: failed ? "var(--danger-ink)" : now ? "var(--accent-text)" : done ? "var(--ink)" : "var(--muted)" }}>{label}</div>
              {ts && (onTrack || failed) ? (
                <div style={{ marginTop: 1, fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {ts}{now ? " · live" : ""}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
