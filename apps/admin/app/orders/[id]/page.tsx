import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import { submitAdminAction } from "../../actions/audit";
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
  const res = await adminFetchResult<OrderDetail>(`/admin/orders/${id}`);

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
  const path = `/orders/${o.id}`;
  const telHref = o.riderPhone ? `tel:${o.riderPhone.replace(/[^\d+]/g, "")}` : undefined;

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
            <b>This order may be stuck.</b> No GPS update from the rider for 22 minutes while en route to drop-off. The
            customer has not reported a problem yet.
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
                  label: "Agreed",
                  value: o.agreed ? (
                    <span className="num">
                      ${o.agreed}
                      {o.agreed !== o.proposed ? <span className="mut" style={{ fontSize: 12 }}> rider countered</span> : null}
                    </span>
                  ) : (
                    "—"
                  ),
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
                  <form action={submitAdminAction}>
                    <input type="hidden" name="action" value="order.nudge_rider" />
                    <input type="hidden" name="target" value={o.id} />
                    <input type="hidden" name="path" value={path} />
                    <button type="submit" className="btn ghost" disabled={!connected} style={{ width: "100%" }}>
                      Nudge rider — “Are you OK to continue?”
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
