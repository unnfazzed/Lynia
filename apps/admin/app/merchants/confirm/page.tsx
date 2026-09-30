import { fromCents, toCents, tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { KitchenConfirmationRow, KitchenConfirmations } from "../../lib/adminTypes";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { Pill } from "../../components/StatusPill";
import { AutoRefresh } from "../../components/AutoRefresh";
import { IconPhone } from "../../components/icons";
import { KitchenOrderActions } from "./KitchenOrderActions";

const money = (usd: number) => `$${usd.toFixed(2)}`;

/** "14:32" — the time of the latest unanswered call. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** A number ops reads out or dials: selectable text plus a tel: link. */
function Phone({ phone, label }: { phone: string | null; label: string }) {
  if (!phone) return <span className="mut">no number</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: tokens.space.sm }}>
      <span className="mono" style={{ userSelect: "all" }}>
        {phone}
      </span>
      <a href={telHref(phone)} aria-label={`Call ${label}`} style={{ color: tokens.color.accentText, fontSize: 12 }}>
        Call
      </a>
    </span>
  );
}

function OrderCard({ o, connected }: { o: KitchenConfirmationRow; connected: boolean }) {
  const lastNoAnswer = o.noAnswerCalls.at(-1);
  return (
    <section className="card" aria-label={`Order from ${o.restaurant.name}`}>
      <div className="block-title">
        {o.restaurant.name}
        {o.urgent ? (
          <Pill kind="bad" dot>
            Urgent
          </Pill>
        ) : null}
        {o.itemsEdited ? <Pill kind="mut">Items changed</Pill> : null}
        <span className="right">Waiting {o.waitingMinutes} min</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: tokens.space.md, fontSize: 13 }}>
        <div>
          <div className="mut" style={{ fontSize: 12 }}>Restaurant</div>
          <Phone phone={o.restaurant.phone} label={o.restaurant.name} />
          {o.noAnswerCalls.length > 0 && lastNoAnswer ? (
            <div style={{ fontSize: 12, color: tokens.color.danger, marginTop: tokens.space.xs }}>
              No answer ×{o.noAnswerCalls.length} (last {clock(lastNoAnswer)})
            </div>
          ) : null}
        </div>
        <div>
          <div className="mut" style={{ fontSize: 12 }}>Customer</div>
          <div>{o.customer.name}</div>
          <Phone phone={o.customer.phone} label={o.customer.name} />
        </div>
        <div>
          <div className="mut" style={{ fontSize: 12 }}>Drop-off</div>
          <div>{o.dropoffLandmark ?? "—"}</div>
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: `${tokens.space.md}px 0`, padding: 0, fontSize: 13 }}>
        {o.items.map((it) => (
          <li
            key={it.itemId}
            style={it.removed ? { textDecoration: "line-through", color: tokens.color.muted } : undefined}
          >
            {it.quantity} × {it.name} · {money(fromCents(toCents(it.priceUsd) * it.quantity))}
            {it.note ? <span className="mut"> — {it.note}</span> : null}
          </li>
        ))}
        <li style={{ fontWeight: 700, marginTop: tokens.space.xs }}>
          Total <span className="num">{money(o.total)}</span>
        </li>
      </ul>

      <KitchenOrderActions orderId={o.orderId} restaurantName={o.restaurant.name} items={o.items} connected={connected} />
    </section>
  );
}

/**
 * "Orders to confirm" — the ops call list for auto-accept restaurants
 * (docs/plans/2026-09-30-restaurant-auto-accept.md). Every order here was accepted automatically, but
 * no rider is sent until the kitchen confirms: ops phones the restaurant and records the outcome.
 * Urgent orders (waited past the escalation window) come first. Refreshes itself every 15s.
 */
export default async function KitchenConfirmationsPage() {
  const res = await adminFetchResult<KitchenConfirmations>("/admin/kitchen-confirmations");
  const list = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = list !== null;
  const orders = list?.orders ?? [];

  return (
    <main className="content">
      <AutoRefresh intervalMs={15_000} />
      <header className="page">
        <h1>Orders to confirm</h1>
        <span className="sub">Call each restaurant. A rider is only sent once you confirm.</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <div className="subnav">
        <a href="/merchants">merchants</a>
        <a href="/merchants/confirm" aria-current="page">
          orders to confirm
        </a>
        <a href="/merchants/disputes">disputes needing support</a>
      </div>

      {orders.length === 0 ? (
        <section className="card">
          {connected ? (
            <EmptyState icon={<IconPhone />} title="No orders waiting for a restaurant to confirm." line={null} />
          ) : (
            <EmptyState icon={<IconPhone />} title={reasonTitle(reason ?? "unconfigured", "Orders to confirm")} line={reasonLine(reason ?? "unconfigured", "orders to confirm")} />
          )}
        </section>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          {orders.map((o) => (
            <OrderCard key={o.orderId} o={o} connected={connected} />
          ))}
          {orders.length >= 100 ? (
            <div style={{ fontSize: 12, color: tokens.color.muted }}>
              Showing the oldest 100 orders — newer ones appear as these are confirmed.
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
