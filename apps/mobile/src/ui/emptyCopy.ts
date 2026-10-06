// Every empty-state string, verbatim from packages/design/handoff/empty-states-v2-2026-10/copy.ts
// (ledger D-78). Placeholders: {area} {q} {time} {place} {km} {service} {count} {amount} {s}. The
// handoff's "was:" notes are the approval record and live there, not here.

/** Fill `{name}` placeholders. */
export function fillEmpty(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export const emptyCopy = {
  orders: {
    none: { title: "No orders yet", body: "Your orders will show here." },
    noneParcels: { title: "No parcels yet", body: "Parcels you send show here." },
    noneService: { title: "No {service} orders yet", body: "Orders you place show here.", primary: "Show all orders" },
    noMatch: { title: "No orders match “{q}”", body: "Try a place or rider name.", secondary: "Clear search" },
    offline: { title: "You’re offline", body: "Orders show when you’re back." },
    error: { title: "Couldn’t load orders", body: "Your orders are safe.", primary: "Try again" },
    noHistoryNote: "Past orders show here.",
    notFound: { title: "Order not found", body: "The link may be old.", primary: "Back to home" },
  },
  home: {
    noLocation: { title: "Where should we deliver?", body: "See who delivers to you.", primary: "Use my location", secondary: "Type an address" },
    comingSoon: { title: "Coming soon near you", body: "We’re adding places in your area." },
  },
  notifications: {
    customer: { title: "No notifications", body: "Order updates show here." },
    rider: { title: "No notifications", body: "Job and money updates show here." },
    error: { title: "Couldn’t load notifications", body: "Check your data and try again.", primary: "Try again" },
  },
  browse: {
    noneInArea: { title: "No restaurants in {area} yet", body: "We’re adding kitchens near you.", primary: "Change address" },
    noFilterMatch: { title: "No places match", body: "Try fewer filters.", secondary: "Clear filters" },
    noCategory: { title: "No {service} shops yet", body: "We’re adding them in Harare.", secondary: "See all shops" },
    offline: { title: "You’re offline", body: "Places load when you’re back.", secondary: "Try again" },
    error: { title: "Couldn’t load restaurants", body: "Nothing was lost.", primary: "Try again" },
    noAddressRow: { text: "Add an address for fees and times", action: "Set" },
  },
  store: {
    noItems: { title: "No items yet", body: "Check back soon." },
    noMatch: { title: "No “{q}” here", body: "Try all restaurants instead.", secondary: "Search all restaurants" },
    closedRow: { text: "Closed · opens {time}", action: "Remind me", actionOn: "Reminder on" },
  },
  search: {
    noMatch: { title: "No results for “{q}”", body: "Try a shorter word." },
    offlineRow: "Offline · recent searches only",
    idleShops: { title: "Search shops", body: "Find items or shop names." },
    idlePharmacy: { title: "Search pharmacies", body: "Find medicines or pharmacy names." },
  },
  cart: {
    empty: { title: "Your cart is empty", primary: "Browse places" },
  },
  rider: {
    noJobs: { title: "No jobs nearby", body: "New jobs appear here on their own." },
    demandRow: "Busier near {place} · {km} km",
    noJobsToday: "No jobs yet today",
    historyEmpty: { title: "No jobs this week", body: "Finished jobs show here." },
    historySummary: "This week · {count} jobs · {amount}",
    noActiveJob: { title: "No active job", body: "Accept a job to start a delivery." },
    retrying: "Trying again in {s} s",
  },
} as const;
