"use client";

import Link from "next/link";

/** Left rail (bottom bar on phone — see .kitchen-nav's media query in globals.css). Every item is now
 *  a real route (E4 built Menu/Shop/Hours, closing out the placeholders E1/E2/E3 left inert). */
const NAV_ITEMS = [
  { id: "queue", label: "Orders", href: "/queue" },
  { id: "catalog", label: "Menu", href: "/menu" },
  { id: "shop", label: "Shop", href: "/shop" },
  { id: "hours", label: "Hours", href: "/hours" },
  { id: "money", label: "Statement", href: "/statement" },
] as const;

export function KitchenNav({ active }: { active: string }) {
  return (
    <nav className="kitchen-nav" aria-label="Kitchen sections">
      {NAV_ITEMS.map((item) => (
        <Link key={item.id} href={item.href} className="kitchen-nav-item" data-active={item.id === active}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
