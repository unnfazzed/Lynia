import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import { logOrderFollowUpNote } from "../../actions/audit";
import type { OrderDetail } from "../../lib/adminTypes";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { FareAdjust, CancelOrder } from "./OrderActions";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconAlert, IconPackage, IconPhone } from "../../components/icons";

/** Order detail (kit `orders.html` detail): 8-step delivery timeline, parcel line items, people
 *  (masked customer phone), proposed→agreed fare, and the stuck-order edge case with
 *  call / nudge / cancel + fare-adjust actions. */
const STEPS = [
  "Broadcast — customer named a price",
  "Offer selected",
  "En route to pickup",
  "At pickup",
  "Picked up",
  "En route to drop-off",
  "Delivered — code entered",
  "Completed",
];
const STEP_OF: Record<string, number> = {
  open_for_offers: 0,
  offer_selected: 1,
  assigned: 1,
  confirmed: 1,
  en_route_pickup: 2,
  at_pickup: 3,
  picked_up: 4,
  en_route_dropoff: 5,
  delivered: 6,
  completed: 7,
};
const LIVE_SET = [
  "open_for_offers",
  "offer_selected",
  "assigned",
  "confirmed",
  "en_route_pickup",
  "at_pickup",
  "picked_up",
  "en_route_dropoff",
];

/** Where the agreed fare came from — additive field on `GET /admin/orders/:id` (mirrors the API's
 *  `FareProvenance` in admin-orders.service.ts), derived server-side from the fare-adjust audit
 *  trail and the selected offer, no schema change. Kept local to this page (the fare card is its
 *  only consumer) rather than widening the shared `OrderDetail`. Absent/null ⇒ legacy order where
 *  neither signal survives. */
type FareProvenance =
  | { kind: "admin_adjusted"; operator: string; at: string; previousFare: string | null; count?: number }
  | { kind: "rider_counter"; offeredFare: string; ask: string }
  | { kind: "customer_ask" };

interface Step {
  label: string;
  state: "done" | "now" | "stall" | "";
  mark: string;
  note?: string;
  ts?: string;
}

/** Prefer an API-supplied timeline; otherwise derive step states from the current status (kit logic).
 *  Derivation carries no fabricated timestamps — only the shape/progress. */
function deriveSteps(o: OrderDetail): Step[] {
  if (o.timeline && o.timeline.length > 0) {
    return o.timeline.map((t, i) => ({
      label: t.label,
      state: t.state ?? "",
      mark: t.state === "done" ? "✓" : t.state === "stall" ? "!" : String(i + 1),
      note: t.note,
      ts: t.ts,
    }));
  }
  const idx = STEP_OF[o.status] ?? -1;
  const terminal = o.status === "expired" || o.status === "cancelled";
  const steps: Step[] = STEPS.map((label, i) => {
    let state: Step["state"] = "";
    if (terminal) state = i === 0 ? "done" : "";
    else if (i < idx) state = "done";
    else if (i === idx) state = o.stuck ? "stall" : "now";
    return {
      label,
      state,
      mark: state === "done" ? "✓" : state === "stall" ? "!" : String(i + 1),
      note: i === idx && o.stuck ? o.stuckNote : undefined,
      ts: state === "now" ? "now" : undefined,
    };
  });
  if (o.status === "expired")
    steps.push({ label: "Expired", state: "stall", mark: "✕", note: "No rider took this price — customer can re-broadcast" });
  if (o.status === "cancelled") steps.push({ label: "Cancelled", state: "", mark: "✕" });
  return steps;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await adminFetchResult<OrderDetail & { fareProvenance?: FareProvenance | null }>(`/admin/orders/${id}`);

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/orders">
            ← Orders
          </a>
          <h1 className="mono" style={{ fontSize: 18 }}>
            {id}
          </h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState
            icon={<IconPackage />}
            title={reasonTitle(reason, "Order record")}
            line={reasonLine(reason, "this order")}
          />
        </section>
      </main>
    );
  }

  const o = res.data;
  // Past the guard `o` is live data → connected; live actions are enabled.
  const connected = true;
  const steps = deriveSteps(o);
  const idx = STEP_OF[o.status] ?? -1;
  const live = LIVE_SET.includes(o.status);
  const telHref = o.riderPhone ? `tel:${o.riderPhone.replace(/[^\d+]/g, "")}` : undefined;
  const prov = o.fareProvenance;

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/orders">
          ← Orders
        </a>
        <h1 className="mono" style={{ fontSize: 18 }}>
          {o.id}
        </h1>
        <span>
          <StatusPill status={o.status} />
          {o.stuck ? <> <Pill kind="bad">stuck?</Pill></> : null}
        </span>
        <Conn connected={connected} />
      </header>

      {o.stuck ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>This order may be stuck.</b> {o.stuckNote ?? "No recent status update."} Currently at &ldquo;
            {STEPS[idx] ?? o.status}&rdquo;.{" "}
            {o.hasOpenIssue ? "The customer or rider has already filed a report — check Issues." : "No one has reported a problem yet."}
          </span>
        </div>
      ) : null}

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Delivery timeline</div>
            <ul className="tl">
              {steps.map((s, i) => (
                <li key={i} className={s.state}>
                  <span className="node">{s.mark}</span>
                  <span>
                    <span className="lbl">{s.label}</span>
                    {s.note ? <div className="note">{s.note}</div> : null}
                  </span>
                  <span className="ts">{s.ts ?? ""}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="block-title">Parcel</div>
            {o.items.map((it, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  padding: "6px 0",
                  borderTop: `1px solid ${tokens.color.line}`,
                }}
              >
                <span>{it.desc}</span>
                <span className="num mut">× {it.qty}</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 8 }}>
              Route: {o.route} · {o.km} km
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">People</div>
            <KeyValue
              rows={[
                {
                  label: "Customer",
                  value: (
                    <span>
                      {o.customer} <span className="mono mut">{o.customerPhone ?? "+263 ·· ··· ····"}</span>
                    </span>
                  ),
                },
                {
                  label: "Rider",
                  value: o.rider ? (
                    <span>
                      {o.rider} <span className="mono mut">{o.riderPhone}</span>
                    </span>
                  ) : (
                    "— none assigned"
                  ),
                },
                ...(o.bike ? [{ label: "Bike", value: <span className="mono">{o.bike}</span> }] : []),
                {
                  label: "Privacy",
                  value: (
                    <span className="mut" style={{ fontSize: 12 }}>
                      Full numbers visible to ops only during an active order.
                    </span>
                  ),
                },
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Fare — cash</div>
            <KeyValue
              rows={[
                { label: "Proposed", value: <span className="num">${o.proposed}</span> },
                {
                  /* The old inline "rider countered" hint fired on any agreed ≠ proposed — which is
                     also what an admin fare correction looks like. The provenance line below the
                     table (from the server-derived fareProvenance) replaces it. */
                  label: "Agreed",
                  value: o.agreed ? <span className="num">${o.agreed}</span> : "—",
                },
                {
                  label: "Collected",
                  value: (
                    <span className="num">
                      {idx >= 6 && o.agreed ? `$${o.agreed} cash at drop-off` : "not yet — cash on delivery"}
                    </span>
                  ),
                },
              ]}
            />
            {/* Provenance of the agreed fare — during a cash dispute this is how ops tells a
                legitimate market outcome from an operator's correction. */}
            {o.agreed ? (
              <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 8 }}>
                {prov?.kind === "admin_adjusted" ? (
                  <>
                    Adjusted by {prov.operator} on {prov.at.slice(0, 10)}
                    {prov.previousFare ? <> (was ${prov.previousFare})</> : null}
                    {prov.count ? <> — adjusted {prov.count} times, latest shown</> : null}.
                  </>
                ) : prov?.kind === "rider_counter" ? (
                  <>Agreed via rider counter-offer (${prov.offeredFare} vs ${prov.ask} ask).</>
                ) : prov?.kind === "customer_ask" ? (
                  <>Customer&rsquo;s asking price, accepted as-is.</>
                ) : (
                  <>Fare source unknown — this order predates provenance tracking.</>
                )}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <FareAdjust id={o.id} agreedOrProposed={o.agreed ?? o.proposed} connected={connected} />
            </div>
          </section>

          <section className="card">
            <div className="block-title">Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {o.rider && live ? (
                <>
                  {telHref ? (
                    <a className="btn ghost" href={telHref}>
                      <span style={{ display: "inline-flex", fontSize: 14 }}>
                        <IconPhone />
                      </span>
                      Call rider
                    </a>
                  ) : null}
                  <form action={logOrderFollowUpNote.bind(null, o.id)}>
                    {/* The action/target are NOT client-supplied hidden inputs (F-07): they are hardcoded
                        server-side and the order id is a Next-bound (encrypted) argument, so this form
                        cannot be tampered into forging an arbitrary audit row. */}
                    {/* This only writes an audit-log note — no push/SMS/call reaches the rider. The old
                        label ("Nudge rider — 'Are you OK to continue?'") implied a message was sent,
                        which it never was; an ops agent believing they'd contacted the rider would wait
                        for a reply that could never come. Call the rider (above) for a real nudge. */}
                    <button type="submit" className="btn ghost" disabled={!connected} style={{ width: "100%" }}>
                      Log a follow-up note (doesn&apos;t contact the rider)
                    </button>
                  </form>
                </>
              ) : null}
              {live ? (
                <CancelOrder id={o.id} connected={connected} />
              ) : (
                <span style={{ fontSize: 12, color: tokens.color.muted }}>
                  This order is {o.status.replace(/_/g, " ")} — no live actions.
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              There is no manual dispatch — a no-offer order expires and the customer re-broadcasts.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
