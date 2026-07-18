import type { ReactNode } from "react";

export type PillKind = "good" | "bad" | "mut" | "";

/** Generic status chip. `good` = accent wash + accent text; `bad` = danger wash; `mut` = surface. */
export function Pill({ children, kind = "", dot = false }: { children: ReactNode; kind?: PillKind; dot?: boolean }) {
  return (
    <span className={kind ? `kpill ${kind}` : "kpill"}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

/**
 * Order-status pill — maps every lifecycle status to the good/bad/mut convention from the kit's
 * `shell.js` statusPill (live/in-delivery = good, completed/cancelled = mut, expired/undelivered =
 * bad). Unknown statuses fall back to `mut` rather than throwing (INTERFACE-AUDIT unknown-status
 * safety rule).
 */
const STATUS_KIND: Record<string, PillKind> = {
  // Pre-broadcast momentary state — neutral (it becomes open_for_offers within a tick).
  requested: "mut",
  open_for_offers: "good",
  offer_selected: "good",
  assigned: "good",
  confirmed: "good",
  en_route_pickup: "good",
  at_pickup: "good",
  picked_up: "good",
  en_route_dropoff: "good",
  delivered: "good",
  completed: "mut",
  cancelled: "mut",
  expired: "bad",
  undelivered: "bad",
  stuck: "bad",
};

export function StatusPill({ status }: { status: string }) {
  const kind = STATUS_KIND[status] ?? "mut";
  return <Pill kind={kind}>{status.replace(/_/g, " ")}</Pill>;
}
