"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NavCounts } from "../lib/adminTypes";
import { IAP_SIGNOUT_URL } from "../lib/console-auth";
import { IconAlert, IconBanknote, IconBike, IconHistory, IconIdCard, IconMapPin, IconMenu, IconNavigation, IconPackage, IconPhone, IconSliders, IconStore, IconUser, IconUserPlus, IconUsers, IconX } from "./icons";
import { SearchBox } from "./SearchBox";

/**
 * 216px ops-console sidebar (kit `shell.js` NAV). Client component so it can mark the active route
 * with `aria-current` via usePathname — the one bit of interactivity the shell needs. Everything
 * else in the shell stays server-rendered. `operator` (the verified IAP identity) + `counts` (attention
 * badges) are passed down from the server layout.
 *
 * Phone (D-105): below 900px the sidebar becomes a top bar — brand + a menu button that discloses the
 * nav + foot as a panel. The button and the open state exist only there (`.nav-toggle` is display:none
 * and `.sidenav-panel` is display:contents on desktop), so the 1440 kit geometry is untouched.
 */
interface NavEntry {
  label: string;
  href: string;
  icon: ReactNode;
  /** Route prefix used for active matching (so /orders/[id] still lights the Orders item). */
  match: string;
  /** Which attention count (if any) drives this item's badge. */
  badge?: keyof NavCounts;
  /** A badge that means money is late reads in danger (Own bikers, OB-A1). */
  badgeTone?: "danger";
}

const NAV: NavEntry[] = [
  { label: "Overview", href: "/", icon: <IconNavigation />, match: "/" },
  // Admin console v2 §7: the order monitor + live map.
  { label: "Live", href: "/live", icon: <IconMapPin />, match: "/live" },
  { label: "Orders", href: "/orders", icon: <IconPackage />, match: "/orders" },
  // Admin console v2 §4: the happy-path funnels and stuck lists for bikers, customers and merchants.
  { label: "People", href: "/people", icon: <IconUsers />, match: "/people" },
  { label: "Bikers", href: "/riders", icon: <IconBike />, match: "/riders" },
  { label: "KYC review", href: "/riders?kyc=pending", icon: <IconIdCard />, match: "/kyc", badge: "kycPending" },
  // Biker referrals (D-112): who brought in which new bikers, and the cash paid for them.
  { label: "Referrals", href: "/referrals", icon: <IconUserPlus />, match: "/referrals" },
  { label: "Customers", href: "/customers", icon: <IconUser />, match: "/customers" },
  // Admin console v2 §5: the badge counts applications waiting on ops past the 24h SLA.
  { label: "Merchants", href: "/merchants", icon: <IconStore />, match: "/merchants", badge: "merchantApplications" },
  // Auto-accept: the ops call list — phone each restaurant before a rider is sent.
  { label: "Confirm orders", href: "/merchants/confirm", icon: <IconPhone />, match: "/merchants/confirm" },
  {
    label: "Food disputes",
    href: "/merchants/disputes",
    icon: <IconAlert />,
    match: "/merchants/disputes",
    badge: "foodDisputes",
  },
  { label: "Issues", href: "/issues", icon: <IconAlert />, match: "/issues", badge: "openIssues" },
  { label: "SOS", href: "/sos", icon: <IconPhone />, match: "/sos", badge: "sosPending" },
  { label: "Commission", href: "/cash", icon: <IconBanknote />, match: "/cash" },
  // Own bikers (OB-A1, D-117): businesses that run their own bikers; the badge counts the fleets with a bill overdue.
  { label: "Own bikers", href: "/own-bikers", icon: <IconStore />, match: "/own-bikers", badge: "fleetsOverdue", badgeTone: "danger" },
  // Admin console v2 §8: who did what, newest first.
  { label: "Audit", href: "/audit", icon: <IconHistory />, match: "/audit" },
  // Admin console v2 §7: the settings the services run with, read-only.
  { label: "Settings", href: "/config", icon: <IconSliders />, match: "/config" },
];

/**
 * Which single nav item is active. The Riders directory and the KYC-review queue share the /riders route
 * (the queue is /riders?kyc=… and /riders/:id/kyc), so a plain prefix match would light "Riders" on every
 * KYC page and NEVER light "KYC review". We disambiguate with kycMode (a kyc query param, or a /kyc path):
 * in KYC mode only "KYC review" lights; otherwise "Riders" owns the /riders subtree.
 */
function isActive(entry: NavEntry, pathname: string, kycMode: boolean): boolean {
  if (entry.match === "/kyc") return kycMode;
  if (entry.match === "/riders") return pathname.startsWith("/riders") && !kycMode;
  // Same "queue shares a route prefix with its parent directory" shape as /riders vs /kyc above: the
  // disputes queue lives at /merchants/disputes, so a plain prefix match would light BOTH "Merchants"
  // and "Food disputes" on that one page. Disambiguate the same way.
  // The same holds for the /merchants/confirm call list.
  if (entry.match === "/merchants/disputes") return pathname.startsWith("/merchants/disputes");
  if (entry.match === "/merchants/confirm") return pathname.startsWith("/merchants/confirm");
  if (entry.match === "/merchants")
    return pathname.startsWith("/merchants") && !pathname.startsWith("/merchants/disputes") && !pathname.startsWith("/merchants/confirm");
  if (entry.match === "/") return pathname === "/";
  return pathname === entry.match || pathname.startsWith(`${entry.match}/`);
}

export function Sidebar({
  operator,
  counts,
  signOutUrl = IAP_SIGNOUT_URL,
}: {
  operator?: string | null;
  counts?: NavCounts | null;
  /** The proxy's sign-out endpoint (resolved server-side by layout.tsx via resolveSignOutUrl). */
  signOutUrl?: string;
}) {
  const pathname = usePathname() || "/";
  const search = useSearchParams();
  const kycMode = search.get("kyc") !== null || pathname.endsWith("/kyc");

  // Phone nav disclosure. Escape closes it and hands focus back to the menu button; a route change
  // closes it too (the panel must not stay over the page the operator just opened).
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const query = search.toString();
  useEffect(() => {
    setOpen(false);
  }, [pathname, query]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (asideRef.current && e.target instanceof Node && !asideRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <aside className="sidenav" ref={asideRef} data-open={open ? "true" : undefined}>
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

      {/* Phone-only (D-105): hidden by CSS above 900px. */}
      <button
        ref={toggleRef}
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="sidenav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <IconX /> : <IconMenu />}
      </button>

      <div id="sidenav-panel" className="sidenav-panel">
      {/* Phone only (D-105): the console search sits at the top of the menu panel; on desktop it is above the page. */}
      <div className="sidenav-search">
        <SearchBox id="search-phone" />
      </div>
      {/* Primary navigation landmark so a screen reader can jump straight to it. */}
      <nav aria-label="Primary" style={{ display: "contents" }}>
      {NAV.map((n) => {
        const count = n.badge && counts ? (counts[n.badge] ?? 0) : 0;
        return (
          <a
            key={n.label}
            href={n.href}
            className="nav-item"
            aria-current={isActive(n, pathname, kycMode) ? "page" : undefined}
          >
            <span style={{ display: "inline-flex", width: 17, height: 17, fontSize: 17 }}>{n.icon}</span>
            {n.label}
            {count > 0 ? (
              <span className={n.badgeTone ? `nav-badge ${n.badgeTone}` : "nav-badge"} aria-label={`${count} awaiting`}>
                {count}
              </span>
            ) : null}
          </a>
        );
      })}
      </nav>

      <div className="foot">
        <b>{operator || "Ops admin"}</b>
        ops admin · Harare pilot
        {/* Proxy sign-out (IAP cookie-clear on GCP, /.auth/logout on Azure Easy Auth). Only shown when
            there's a real signed-in identity (the dev/offline path has none). */}
        {operator ? (
          <a
            href={signOutUrl}
            style={{ display: "block", marginTop: 6, color: "var(--accent-text)", textDecoration: "none", fontWeight: 600 }}
          >
            Sign out
          </a>
        ) : null}
      </div>
      </div>
    </aside>
  );
}
