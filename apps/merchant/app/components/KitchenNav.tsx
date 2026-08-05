"use client";

import Link from "next/link";
import { Icon, type IconName } from "./icons";

/** Left rail (bottom bar on phone — see .kitchen-nav's media query in globals.css). Every item is now
 *  a real route (E4 built Menu/Shop/Hours, closing out the placeholders E1/E2/E3 left inert). Icon +
 *  label per item, matching the gallery's `KitchenNav`
 *  (packages/design/explorations/restaurants/r-parts.jsx:616 — inbox/utensils/store/clock/receipt). */
const NAV_ITEMS: { id: string; label: string; href: string; icon: IconName }[] = [
  { id: "queue", label: "Orders", href: "/queue", icon: "inbox" },
  { id: "catalog", label: "Menu", href: "/menu", icon: "utensils" },
  { id: "shop", label: "Shop", href: "/shop", icon: "store" },
  { id: "hours", label: "Hours", href: "/hours", icon: "clock" },
  { id: "money", label: "Statement", href: "/statement", icon: "receipt" },
];

export function KitchenNav({ active }: { active: string }) {
  return (
    <nav className="kitchen-nav" aria-label="Kitchen sections">
      {NAV_ITEMS.map((item) => (
        <Link key={item.id} href={item.href} className="kitchen-nav-item" data-active={item.id === active}>
          <Icon name={item.icon} size={19} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
