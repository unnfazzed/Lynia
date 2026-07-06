"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconAlert, IconBanknote, IconBike, IconIdCard, IconNavigation, IconPackage, IconUser } from "./icons";

/**
 * 216px ops-console sidebar (kit `shell.js` NAV). Client component so it can mark the active route
 * with `aria-current` via usePathname — the one bit of interactivity the shell needs. Everything
 * else in the shell stays server-rendered.
 */
interface NavEntry {
  label: string;
  href: string;
  icon: ReactNode;
  /** Route prefix used for active matching (so /orders/[id] still lights the Orders item). */
  match: string;
}

const NAV: NavEntry[] = [
  { label: "Overview", href: "/", icon: <IconNavigation />, match: "/" },
  { label: "Orders", href: "/orders", icon: <IconPackage />, match: "/orders" },
  { label: "Riders", href: "/riders", icon: <IconBike />, match: "/riders" },
  { label: "KYC review", href: "/riders?kyc=pending", icon: <IconIdCard />, match: "/kyc" },
  { label: "Customers", href: "/customers", icon: <IconUser />, match: "/customers" },
  { label: "Issues", href: "/issues", icon: <IconAlert />, match: "/issues" },
  { label: "Commission", href: "/cash", icon: <IconBanknote />, match: "/cash" },
];

function isActive(pathname: string, match: string): boolean {
  if (match === "/") return pathname === "/";
  return pathname === match || pathname.startsWith(`${match}/`);
}

export function Sidebar() {
  const pathname = usePathname() || "/";

  return (
    <aside className="sidenav">
      <div className="brand">
        {/* 28px static mark — crease facets resolve at ≥28px. */}
        <svg width="28" height="28" viewBox="0 0 96 96" aria-hidden="true">
          <polygon points="28,6 58,32 38,42" fill="var(--accent)" />
          <polygon points="90,26 14,52 48,60" fill="var(--accent)" />
          <polygon points="90,26 48,60 42,84" fill="var(--accent-700)" />
        </svg>
        <div>
          <b>LyniaGo</b>
          <span>operations</span>
        </div>
      </div>

      {NAV.map((n) => (
        <a
          key={n.label}
          href={n.href}
          className="nav-item"
          aria-current={isActive(pathname, n.match) ? "page" : undefined}
        >
          <span style={{ display: "inline-flex", width: 17, height: 17, fontSize: 17 }}>{n.icon}</span>
          {n.label}
        </a>
      ))}

      <div className="foot">
        <b>Ops admin</b>
        Harare pilot · single ops role
      </div>
    </aside>
  );
}
