import type { SearchHit, SearchResults } from "../lib/adminTypes";

/** The result groups, in the order the page shows them. */
export const SEARCH_GROUPS: Array<{ key: keyof SearchResults["groups"]; label: string }> = [
  { key: "bikers", label: "Bikers" },
  { key: "customers", label: "Customers" },
  { key: "merchants", label: "Merchants" },
  { key: "orders", label: "Orders" },
  { key: "topups", label: "Top-ups" },
];

/** The one hit when the whole search found exactly one record (the page then goes straight to it), else null. */
export function onlyHit(r: SearchResults): SearchHit | null {
  if (r.tooShort || r.total !== 1) return null;
  for (const g of SEARCH_GROUPS) {
    const hits = r.groups[g.key];
    // Only ever redirect inside the console.
    if (hits.length === 1) return /^\/(?!\/)/.test(hits[0]!.href) ? hits[0]! : null;
  }
  return null;
}
