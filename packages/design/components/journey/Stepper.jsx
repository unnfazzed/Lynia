import React from "react";

// One timeline seen from two sides (CONCEPT §5c): customer and rider labels are paired so a step
// reads as the same event from either screen.
const STEP_ORDER = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "completed",
];

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

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Lynia §5c journey stepper — the 7-step delivery timeline, rendered from an order's append-only
 * events + current status. Steps before the current one are done (✓ + time), the current one is
 * "now" (accent, live), later ones are muted. Pass view="customer" or view="rider" for the paired labels.
 */
export function Stepper({ events = [], currentStatus, view = "customer", style, ...rest }) {
  const labels = STEP_LABELS[view] ?? STEP_LABELS.customer;
  const currentIdx = STEP_ORDER.indexOf(currentStatus);
  const times = {};
  for (const e of events) if (!(e.status in times)) times[e.status] = e.createdAt;

  return (
    <div className="lynia-stepper" style={style} {...rest}>
      {STEP_ORDER.map((s, i) => {
        const state = currentIdx < 0 ? "todo" : i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const last = i === STEP_ORDER.length - 1;
        const onTrack = state !== "todo";
        const ts = times[s];
        return (
          <div key={s} style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 26 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  border: `2px solid ${onTrack ? "var(--accent)" : "var(--line)"}`,
                  background: state === "done" ? "var(--accent)" : "var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    fontWeight: "var(--weight-extrabold)",
                    color: state === "done" ? "var(--on-accent)" : state === "now" ? "var(--accent-text)" : "var(--muted)",
                  }}
                >
                  {state === "done" ? "✓" : String(i + 1)}
                </span>
              </div>
              {!last ? (
                <div style={{ flex: 1, width: 2, minHeight: 16, background: i < currentIdx ? "var(--accent)" : "var(--line)" }} />
              ) : null}
            </div>
            <div style={{ flex: 1, paddingLeft: "var(--space-sm)", paddingBottom: last ? 0 : "var(--space-md)" }}>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-body)",
                  fontWeight: state === "todo" ? "var(--weight-semibold)" : "var(--weight-bold)",
                  color: state === "now" ? "var(--accent-text)" : state === "todo" ? "var(--muted)" : "var(--ink)",
                }}
              >
                {labels[s]}
              </div>
              {ts && onTrack ? (
                <div style={{ marginTop: 1, fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted)" }}>
                  {fmtTime(ts)}
                  {state === "now" ? " · live" : ""}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
