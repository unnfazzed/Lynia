"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { NavCounts } from "../lib/adminTypes";
import { IconAlert, IconBanknote, IconBike, IconIdCard, IconNavigation, IconPackage, IconPhone, IconUser } from "./icons";

/**
 * 216px ops-console sidebar (kit `shell.js` NAV). Client component so it can mark the active route
 * with `aria-current` via usePathname — the one bit of interactivity the shell needs. Everything
 * else in the shell stays server-rendered. `operator` (the verified IAP identity) + `counts` (attention
 * badges) are passed down from the server layout.
 */
interface NavEntry {
  label: string;
  href: string;
  icon: ReactNode;
  /** Route prefix used for active matching (so /orders/[id] still lights the Orders item). */
  match: string;
  /** Which attention count (if any) drives this item's badge. */
  badge?: keyof NavCounts;
}

const NAV: NavEntry[] = [
  { label: "Overview", href: "/", icon: <IconNavigation />, match: "/" },
  { label: "Orders", href: "/orders", icon: <IconPackage />, match: "/orders" },
  { label: "Riders", href: "/riders", icon: <IconBike />, match: "/riders" },
  { label: "KYC review", href: "/riders?kyc=pending", icon: <IconIdCard />, match: "/kyc", badge: "kycPending" },
  { label: "Customers", href: "/customers", icon: <IconUser />, match: "/customers" },
  { label: "Issues", href: "/issues", icon: <IconAlert />, match: "/issues", badge: "openIssues" },
  { label: "SOS", href: "/sos", icon: <IconPhone />, match: "/sos", badge: "sosPending" },
  { label: "Commission", href: "/cash", icon: <IconBanknote />, match: "/cash" },
];

function isActive(pathname: string, match: string): boolean {
  if (match === "/") return pathname === "/";
  return pathname === match || pathname.startsWith(`${match}/`);
}

export function Sidebar({ operator, counts }: { operator?: string | null; counts?: NavCounts | null }) {
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

      {NAV.map((n) => {
        const count = n.badge && counts ? counts[n.badge] : 0;
        return (
          <a
            key={n.label}
            href={n.href}
            className="nav-item"
            aria-current={isActive(pathname, n.match) ? "page" : undefined}
          >
            <span style={{ display: "inline-flex", width: 17, height: 17, fontSize: 17 }}>{n.icon}</span>
            {n.label}
            {count > 0 ? (
              <span className="nav-badge" aria-label={`${count} awaiting`}>
                {count}
              </span>
            ) : null}
          </a>
        );
      })}

      <div className="foot">
        <b>{operator || "Ops admin"}</b>
        Harare pilot · single ops role
        {/* IAP sign-out: clearing the IAP login cookie bounces the operator back through Google. Only
            shown when there's a real signed-in identity (the dev/offline path has none). */}
        {operator ? (
          <a
            href="/?gcp-iap-mode=CLEAR_LOGIN_COOKIE"
            style={{ display: "block", marginTop: 6, color: "var(--accent-text)", textDecoration: "none", fontWeight: 600 }}
          >
            Sign out
          </a>
        ) : null}
      </div>
    </aside>
  );
}
