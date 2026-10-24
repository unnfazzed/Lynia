import type { ReactNode } from "react";
import { tokens } from "@lynia/shared";
import { shortId } from "../lib/format";

/** Raised above a DataTable row's stretched link (`.row-stretch`, z-index 1) so it stays clickable. */
const LINK_STYLE = { color: tokens.color.accentText, position: "relative", zIndex: 2 } as const;

/** A link to another console record (biker, customer, merchant, issue). */
export function RecordLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={LINK_STYLE}>
      {children}
    </a>
  );
}

/** The business a person works at or rides for (owner, 2026-10-24): a small tag that opens its profile.
 *  Raised above a DataTable row's stretched link like `RecordLink`. */
export function MerchantTag({ id, name, title }: { id: string; name: string; title?: string }) {
  return (
    <a href={`/merchants/${id}`} className="kpill mut" title={title} style={{ position: "relative", zIndex: 2, textDecoration: "none" }}>
      {name}
    </a>
  );
}

/** "#a1b2c3" linked to the order; the full id is in the tooltip. */
export function OrderLink({ id }: { id: string }) {
  return (
    <a href={`/orders/${id}`} className="mono" title={id} style={LINK_STYLE}>
      {shortId(id)}
    </a>
  );
}
