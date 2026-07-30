"use client";

import Link from "next/link";

/** Left rail (bottom bar on phone — see .kitchen-nav's media query in globals.css). "Orders" (E1/E2)
 *  and "Statement" (E3) are real routes; Menu/Shop/Hours ship as visibly-present-but-inert
 *  placeholders rather than dead links until E4 builds them. */
const NAV_ITEMS = [
  { id: "queue", label: "Orders", href: "/queue" },
  { id: "catalog", label: "Menu", href: null },
  { id: "shop", label: "Shop", href: null },
  { id: "hours", label: "Hours", href: null },
  { id: "money", label: "Statement", href: "/statement" },
] as const;

export function KitchenNav({ active }: { active: string }) {
  return (
    <nav className="kitchen-nav" aria-label="Kitchen sections">
      {NAV_ITEMS.map((item) =>
        item.href ? (
          <Link key={item.id} href={item.href} className="kitchen-nav-item" data-active={item.id === active}>
            {item.label}
          </Link>
        ) : (
          <span key={item.id} className="kitchen-nav-item" data-disabled="true" title="Coming soon">
            {item.label}
          </span>
        ),
      )}
    </nav>
  );
}
