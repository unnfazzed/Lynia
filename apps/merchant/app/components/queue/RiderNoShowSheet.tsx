"use client";

import type { MerchantOrderResponse } from "@lynia/shared";
import { msSince } from "../../lib/countdown";
import { useNow } from "../../lib/use-now";
import { Icon } from "../icons";
import { ghostButtonStyle } from "./styles";

/**
 * M3·b2 `rider_noshow` (r-merchant.jsx:845-871) — "The rider hasn't arrived". The food is cooked and
 * sitting on the counter; this screen exists to protect the merchant.
 *
 * **What the kit draws that this codebase cannot do, and what is shown instead.** The kit's right-hand
 * panel offers *Send another rider* / *Call the rider* / *Cancel the order*. None of the three has a
 * merchant-callable endpoint once a rider has been secured, and every one of them was checked
 * individually rather than assumed:
 *
 *  - **Send another rider** — `POST /merchant/orders/:id/dispatch/resume` claims only rows matching
 *    `status: "requested", merchantPhase: "ready_for_pickup", noRiderHoldAt: { not: null }`
 *    (food-dispatch.service.ts `resumeSearch`). An order with an assigned rider is `assigned`/
 *    `confirmed`/`en_route_pickup` with `merchantPhase` cleared, so the call 409s
 *    "This order isn't waiting on a rider decision". Re-dispatch in place exists only as
 *    `dropDispatch`, which is authenticated as the RIDER (`where: { riderId }`), not the merchant.
 *  - **Call the rider** — `MerchantOrderResponse` carries `riderId` (a uuid) and no rider name or
 *    phone; nothing on the merchant API resolves one. (D-17 masks merchant numbers from third
 *    parties; there is no reciprocal rider-contact read for the merchant at all.)
 *  - **Cancel the order** — `cancelFromHold` carries the identical hold-state guard as `resumeSearch`,
 *    and `rejectOrder`/`releaseUnpaid` are both pinned to `status: "requested"` with an
 *    `awaiting_accept`/`awaiting_payment` phase. There is no merchant cancel for an assigned order.
 *
 * Drawing those three buttons would mean either inventing endpoints or shipping taps that fail — so
 * this ships the half that is real (the reassurance, the timeline off actual timestamps, and the one
 * path that genuinely works: LyniaGo support, plus the automatic route back to the board if the rider
 * drops the job) and reports the gap rather than papering over it.
 */

/** How long after `readyAt` a still-uncollected order stops being "normal wait" and starts prompting.
 *  `readyAt` is the only timestamp on the order that relates to the counter — there is no
 *  `assignedAt`/`riderArrivedAt` — so the wait is measured from the food being ready, which is also
 *  what the merchant is actually looking at. */
export const RIDER_LATE_AFTER_MS = 12 * 60 * 1000;

export function isRiderLate(order: MerchantOrderResponse, now: number): boolean {
  return msSince(order.readyAt, now) > RIDER_LATE_AFTER_MS;
}

/** The rider's own stage, in the merchant's words — real, straight off `status`. Whether the rider has
 *  even started moving is the single most useful thing on this screen. */
function riderStage(status: string): string {
  if (status === "assigned") return "A rider accepted the job";
  if (status === "confirmed") return "The rider confirmed they're coming";
  if (status === "en_route_pickup") return "The rider is on the way to you";
  return "A rider is assigned to this order";
}

function atTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesWaiting(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "less than a minute";
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

export function RiderNoShowSheet({ order, onClose }: { order: MerchantOrderResponse; onClose: () => void }) {
  const now = useNow(30_000);
  const waiting = msSince(order.readyAt, now);
  const readyTime = atTime(order.readyAt);
  const label = `#${order.id.slice(0, 8).toUpperCase()}`;

  const timeline: { time: string; label: string }[] = [
    ...(readyTime ? [{ time: readyTime, label: "You marked the order ready" }] : []),
    { time: "·", label: riderStage(order.status) },
    ...(order.dispatchAttempt > 0
      ? [{ time: "·", label: `Found on dispatch attempt ${order.dispatchAttempt}` }]
      : []),
    { time: "now", label: `Waiting ${minutesWaiting(waiting)} at your counter` },
  ];

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="The rider hasn't arrived">
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>The rider hasn&apos;t arrived</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 16, fontVariantNumeric: "tabular-nums" }}>
          {label}
          {readyTime ? ` · ready since ${readyTime}` : ""}
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              The food stays on your counter and you are not out of pocket — a cooked order that never gets collected is
              recorded against the rider, not against you.
            </div>

            <div style={{ marginTop: 16 }}>
              {timeline.map((row) => (
                <div key={row.label} style={{ display: "flex", gap: 12, padding: "5px 0", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)", minWidth: 46, fontVariantNumeric: "tabular-nums" }}>{row.time}</span>
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: 300, flexShrink: 0 }}>
            {/* No action buttons here on purpose — see this file's header for the endpoint-by-endpoint
             *  reason. Offering a tap that 409s, or one that quietly does nothing, would be worse than
             *  telling the kitchen plainly what does work. */}
            <div style={{ display: "flex", gap: 10, padding: "14px 16px", background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 12 }}>
              <Icon name="phone" size={18} color="var(--highlight-ink)" style={{ marginTop: 1 }} />
              <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
                <b>Call LyniaGo support and quote {label}.</b> Sending a different rider or cancelling an order a rider has
                already accepted is done by support — this tablet can&apos;t do either once the job is taken.
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>
              If the rider drops the job themselves, the order comes straight back to this board and starts hunting for a
              new one — you&apos;ll get the keep-searching / cancel choice here without doing anything.
            </div>

            <button type="button" onClick={onClose} style={{ ...ghostButtonStyle, width: "100%", marginTop: 14 }}>
              Back to orders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,24,27,.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 70,
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 18,
  padding: 24,
  width: 720,
  maxWidth: "96vw",
  maxHeight: "92vh",
  overflow: "auto",
};
