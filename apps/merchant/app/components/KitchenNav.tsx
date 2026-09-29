"use client";

import Link from "next/link";
import { useBusiness } from "../lib/business";
import { supportWhatsAppUrl } from "../lib/config";
import { Icon, type IconName } from "./icons";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  external?: boolean;
}

/** Left rail (bottom bar on phone — see .kitchen-nav's media query in globals.css). Every item is now
 *  a real route (E4 built Menu/Shop/Hours, closing out the placeholders E1/E2/E3 left inert). Icon +
 *  label per item, matching the gallery's `KitchenNav`
 *  (packages/design/explorations/restaurants/r-parts.jsx:616 — inbox/utensils/store/clock/receipt). */
const RESTAURANT_ITEMS: NavItem[] = [
  { id: "queue", label: "Orders", href: "/queue", icon: "inbox" },
  { id: "catalog", label: "Menu", href: "/menu", icon: "utensils" },
  { id: "shop", label: "Shop", href: "/shop", icon: "store" },
  { id: "hours", label: "Hours", href: "/hours", icon: "clock" },
  { id: "money", label: "Statement", href: "/statement", icon: "receipt" },
];

/** Help opens LyniaGo support on WhatsApp, and hides rather than open a dead link when no number is set. */
function helpItems(): NavItem[] {
  const help = supportWhatsAppUrl();
  return help ? [{ id: "help", label: "Help", href: help, icon: "circle-alert", external: true }] : [];
}

/** A shop's own set (merchant web upgrade L2, design doc L5 "Navigation"): Deliveries first — booking a
 *  rider is what a shop does here — then its own Riders (L3), Items and Shop, and Help when support's
 *  WhatsApp is set. Undrawn, ledgered as D-44 and D-45. */
function shopItems(): NavItem[] {
  return [
    { id: "deliveries", label: "Deliveries", href: "/deliveries", icon: "navigation" },
    { id: "riders", label: "Riders", href: "/riders", icon: "bike" },
    { id: "catalog", label: "Items", href: "/menu", icon: "package" },
    { id: "shop", label: "Shop", href: "/shop", icon: "store" },
    ...helpItems(),
  ];
}

/** Staff's sets (L4, the design doc's permission table): no Shop and no Statement, which are the
 *  owner's, and on Menu/Items and Hours only what Staff may do there (stock toggles, busy mode). The
 *  restaurant set drops two drawn items, ledgered as D-46. */
function restaurantStaffItems(): NavItem[] {
  return [
    { id: "queue", label: "Orders", href: "/queue", icon: "inbox" },
    { id: "catalog", label: "Menu", href: "/menu", icon: "utensils" },
    { id: "hours", label: "Hours", href: "/hours", icon: "clock" },
    ...helpItems(),
  ];
}

function shopStaffItems(): NavItem[] {
  return [
    { id: "deliveries", label: "Deliveries", href: "/deliveries", icon: "navigation" },
    { id: "riders", label: "Riders", href: "/riders", icon: "bike" },
    { id: "catalog", label: "Items", href: "/menu", icon: "package" },
    ...helpItems(),
  ];
}

export function KitchenNav({ active }: { active: string }) {
  const business = useBusiness();
  // Restaurants are the default until the business is known, so a kitchen never sees its drawn nav flicker.
  const staff = business?.myRole === "staff";
  const items =
    business?.businessType === "shop" ? (staff ? shopStaffItems() : shopItems()) : staff ? restaurantStaffItems() : RESTAURANT_ITEMS;
  return (
    <nav className="kitchen-nav" aria-label={business?.businessType === "shop" ? "Shop sections" : "Kitchen sections"}>
      {items.map((item) =>
        item.external ? (
          <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className="kitchen-nav-item" data-active={false}>
            <Icon name={item.icon} size={19} />
            {item.label}
          </a>
        ) : (
          <Link key={item.id} href={item.href} className="kitchen-nav-item" data-active={item.id === active}>
            <Icon name={item.icon} size={19} />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
