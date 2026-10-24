import type { LiveAlerts } from "../lib/adminTypes";

/**
 * Admin console v2 §7 — the alert strip above every page (undrawn; route (b), D-106). One compact row of the
 * kit's pills, each a link to the page that clears it. Renders nothing when there is nothing to do, or when
 * the API didn't answer (the page itself says so).
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Chip {
  key: Exclude<keyof LiveAlerts, "ownBikers">;
  href: string;
  kind: "bad" | "warn";
  text: (n: number) => string;
}

const CHIPS: Chip[] = [
  { key: "sosPending", href: "/sos", kind: "bad", text: (n) => plural(n, "SOS waiting", "SOS waiting") },
  { key: "ordersBreaching", href: "/live", kind: "bad", text: (n) => `${plural(n, "order", "orders")} past the time limit` },
  { key: "kitchenConfirmations", href: "/merchants/confirm", kind: "warn", text: (n) => `${plural(n, "order", "orders")} to confirm with the kitchen` },
  { key: "topupAnomalies", href: "/cash/topups", kind: "warn", text: (n) => `${plural(n, "top-up", "top-ups")} to sort out` },
  // Applied and in review together: the count covers both (applicationsPastSlaWhere), so the link does too.
  { key: "merchantApplications", href: "/merchants?status=waiting", kind: "warn", text: (n) => `${plural(n, "application", "applications")} waiting over 24 h` },
  { key: "merchantsApprovedNotLive", href: "/merchants?status=approved", kind: "warn", text: (n) => `${plural(n, "approved business", "approved businesses")} not live after 24 h` },
];

export function AlertStrip({ alerts }: { alerts: LiveAlerts | null }) {
  if (!alerts) return null;
  const shown = CHIPS.filter((c) => (alerts[c.key] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <nav className="alert-strip" aria-label="Needs attention">
      {shown.map((c) => (
        <a key={c.key} href={c.href} className={`kpill ${c.kind}`}>
          <span className="dot" />
          {c.text(alerts[c.key] ?? 0)}
        </a>
      ))}
    </nav>
  );
}
