"use client";

import Link from "next/link";
import type { MerchantProfileResponse } from "@lynia/shared";
import { useBusiness } from "../lib/business";
import { Icon, type IconName } from "./icons";

/** The four tabs (merchant-mobile README, global changes 2–3). */
export type MerchantTab = "orders" | "catalog" | "money" | "account";

interface TabItem {
  id: MerchantTab;
  label: string;
  href: string;
  icon: IconName;
}

/**
 * The bottom tab bar (merchant-mobile README, global changes 2–3): one 4-tab bar for both kinds of
 * business. A restaurant gets Orders · Menu · Money · Account; a shop gets Orders · **Items** · Money
 * · Account, and its Orders home is Deliveries until shops take customer orders. Staff don't see Money
 * (README C4: "Staff should not see Money or Team").
 *
 * Restaurants are the default until the business is known, so a kitchen never sees its tabs flicker.
 */
export function tabItems(business: (Pick<MerchantProfileResponse, "businessType" | "myRole"> & { pilotEnabled?: boolean }) | null): TabItem[] {
  const shop = business?.businessType === "shop";
  const staff = business?.myRole === "staff";
  const items: TabItem[] = [
    // Order flow v2 (ledger D-59): a shop live to customers takes its orders on /queue.
    { id: "orders", label: "Orders", href: shop && !business?.pilotEnabled ? "/deliveries" : "/queue", icon: "inbox" },
    shop
      ? { id: "catalog", label: "Items", href: "/menu", icon: "package" }
      : { id: "catalog", label: "Menu", href: "/menu", icon: "utensils" },
  ];
  if (!staff) items.push({ id: "money", label: "Money", href: "/statement", icon: "wallet" });
  items.push({ id: "account", label: "Account", href: "/account", icon: "user" });
  return items;
}

export function KitchenNav({ active }: { active: MerchantTab }) {
  const business = useBusiness();
  return (
    <nav className="m-tb" aria-label="Sections">
      {tabItems(business).map((item) => (
        <Link key={item.id} href={item.href} className="m-tab" aria-current={item.id === active ? "page" : undefined}>
          <Icon name={item.icon} size={21} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
