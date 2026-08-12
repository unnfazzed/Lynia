import { formatPhoneLocal, tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { OrderDetail } from "../../lib/adminTypes";
import { FollowUpNoteButton } from "./FollowUpNoteButton";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { FareAdjust, CancelOrder, AdjudicateDelivered } from "./OrderActions";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconAlert, IconPackage, IconPhone } from "../../components/icons";
import { ResolveHandshakeButton } from "../../merchants/ResolveHandshakeButton";

const DEBT_STATUS_LABEL: Record<string, string> = {
  open: "Open — awaiting settlement",
  settled_cash: "Settled — cash returned",
  settled_goods: "Settled — goods returned",
  written_off: "Written off — rider suspended",
};

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
            <b>This order may be stuck.</b> {o.stuckNote ?? "No recent status update."}{" "}Currently at &ldquo;
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

          {/* KB-POD-DISPUTE Phase A: rider-attached proof-of-drop evidence for a disputed hand-off
              (recipient took the goods but withheld the delivery code). Only shown when the rider
              attached it — the evidence a Phase-B "delivered — code bypass" decision is adjudicated on. */}
          {o.deliveryProof ? (
            <section className="card">
              <div className="block-title">Proof of drop-off</div>
              <div style={{ fontSize: 12, color: tokens.color.muted, marginBottom: 8 }}>
                Rider-attached evidence — the recipient took the goods but withheld the delivery code.
              </div>
              {o.deliveryProof.photoUrl ? (
                // A short-lived signed GCS URL (mirrors the KYC photo), so a plain <img>, not next/image.
                <img
                  src={o.deliveryProof.photoUrl}
                  alt="Rider's proof of drop-off at the recipient"
                  style={{ width: "100%", borderRadius: tokens.radius.input, border: `1px solid ${tokens.color.line}` }}
                />
              ) : (
                <div className="doc-ph" style={{ height: 120 }}>
                  proof photo
                  <br />
                  (photo unavailable)
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <KeyValue
                  rows={[
                    ...(o.deliveryProof.at
                      ? [{ label: "Captured", value: <span className="mono">{new Date(o.deliveryProof.at).toLocaleString()}</span> }]
                      : []),
                    {
                      label: "Location",
                      value:
                        o.deliveryProof.lat != null && o.deliveryProof.lng != null ? (
                          <a
                            href={`https://maps.google.com/?q=${o.deliveryProof.lat},${o.deliveryProof.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mono"
                          >
                            {o.deliveryProof.lat.toFixed(5)}, {o.deliveryProof.lng.toFixed(5)}
                          </a>
                        ) : (
                          <span className="mut" style={{ fontSize: 12 }}>
                            Not captured (GPS unavailable at the door)
                          </span>
                        ),
                    },
                  ]}
                />
              </div>
            </section>
          ) : o.status === "undelivered" ? (
            // No proof was attached — the majority case (capture is optional, only offered at the door).
            // Render an honest empty-state rather than vanishing, so the operator adjudicating below knows
            // evidence was expected but is absent, not merely un-scrolled-to.
            <section className="card">
              <div className="block-title">Proof of drop-off</div>
              <div style={{ fontSize: 12, color: tokens.color.muted, marginBottom: 8 }}>
                No proof-of-drop evidence was submitted for this order.
              </div>
              <div className="doc-ph" style={{ height: 120 }}>
                no proof-of-drop
                <br />
                (capture is optional at the door)
              </div>
            </section>
          ) : null}
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
                      {o.customer} <span className="mono mut">{o.customerPhone ? formatPhoneLocal(o.customerPhone) : "0·· ··· ····"}</span>
                    </span>
                  ),
                },
                {
                  label: "Rider",
                  value: o.rider ? (
                    <span>
                      {o.rider} <span className="mono mut">{o.riderPhone ? formatPhoneLocal(o.riderPhone) : o.riderPhone}</span>
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

          {/* X1: food-order evidence panel — merchant/payment rail/debt/handshake/refund. Null for
              every parcel order, so this card is simply absent there. */}
          {o.food ? (
            <section className="card">
              <div className="block-title">Food order</div>
              <KeyValue
                rows={[
                  { label: "Merchant", value: o.food.merchant ?? "—" },
                  {
                    label: "Payment",
                    value: `${o.food.paymentMethod ?? "—"}${o.food.paymentConfirmedAt ? ` · confirmed ${new Date(o.food.paymentConfirmedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`,
                  },
                  { label: "Goods total", value: o.food.goodsTotal ? `$${o.food.goodsTotal}` : "—" },
                  { label: "Delivery fee", value: o.food.deliveryFee ? `$${o.food.deliveryFee}` : "—" },
                ]}
              />

              {o.food.debt ? (
                <div style={{ marginTop: 10 }}>
                  <div className="block-title" style={{ fontSize: 12 }}>
                    Merchant debt (collect &amp; return)
                  </div>
                  <KeyValue
                    rows={[
                      { label: "Status", value: DEBT_STATUS_LABEL[o.food.debt.status] ?? o.food.debt.status },
                      { label: "Amount", value: o.food.debt.amount ? `$${o.food.debt.amount}` : "—" },
                    ]}
                  />
                </div>
              ) : null}

              {o.food.handshake ? (
                <div style={{ marginTop: 10 }}>
                  <div className="block-title" style={{ fontSize: 12 }}>
                    Doorstep handshake
                  </div>
                  {o.food.handshake.frozenAt && !o.food.handshake.riderConfirmedAt ? (
                    <div className="warnbar" style={{ marginBottom: 8 }}>
                      <IconAlert />
                      <span className="t">
                        <b>Frozen — the rider didn&apos;t confirm.</b> Locked out of new jobs since{" "}
                        {new Date(o.food.handshake.frozenAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
                      </span>
                    </div>
                  ) : null}
                  <KeyValue
                    rows={[
                      { label: "Amount", value: o.food.handshake.amount ? `$${o.food.handshake.amount}` : "—" },
                      { label: "Customer confirmed", value: o.food.handshake.customerConfirmedAt ? "Yes" : "Not yet" },
                      { label: "Rider confirmed", value: o.food.handshake.riderConfirmedAt ? "Yes" : "Not yet" },
                    ]}
                  />
                  {o.food.handshake.frozenAt && !o.food.handshake.riderConfirmedAt ? (
                    <div style={{ marginTop: 8 }}>
                      <ResolveHandshakeButton orderId={o.id} connected={connected} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {o.food.refund ? (
                <div style={{ marginTop: 10 }}>
                  <div className="block-title" style={{ fontSize: 12 }}>
                    Refund
                  </div>
                  <KeyValue
                    rows={[
                      { label: "Reference", value: <span className="mono">{o.food.refund.reference ?? "—"}</span> },
                      { label: "Amount", value: o.food.refund.amount ? `$${o.food.refund.amount}` : "—" },
                    ]}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

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
                  {/* The order id is a server-bound prop (not a client-supplied hidden input, F-07), so
                      this cannot be tampered into forging an arbitrary audit row. This only writes an
                      audit-log note — no push/SMS/call reaches the rider. The old label ("Nudge rider —
                      'Are you OK to continue?'") implied a message was sent, which it never was; an ops
                      agent believing they'd contacted the rider would wait for a reply that could never
                      come. Call the rider (above) for a real nudge. */}
                  <FollowUpNoteButton orderId={o.id} disabled={!connected} />
                </>
              ) : null}
              {live ? (
                <CancelOrder id={o.id} connected={connected} />
              ) : o.status === "undelivered" && o.rider ? (
                // KB-POD-DISPUTE Phase B: the one live action on an undelivered order — overturn the
                // outcome to delivered when the proof-of-drop card above supports it.
                <AdjudicateDelivered id={o.id} connected={connected} hasEvidence={Boolean(o.deliveryProof)} />
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
