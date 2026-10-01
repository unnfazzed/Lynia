/**
 * Customer Home copy — Calm Mint v2 (`packages/design/handoff/calm-mint-v2-2026-10`, `mint2.js` `H`),
 * verbatim. The app copies mock text exactly (CLAUDE.md "Mock copy verbatim"); a string that is not
 * in the handoff is marked below with the ledger entry that sanctions it (docs/DESIGN-DEVIATIONS.md
 * D-55).
 */
export const H = {
  deliveringTo: "DELIVERING TO",
  noAddress: "NO ADDRESS YET",
  setLocation: "Set your location",
  search: "Search food, shops or parcels",
  /** The 320px variant (H3). */
  searchNarrow: "Search food or shops",

  tiles: { send: "Send", food: "Restaurants", foodNarrow: "Food", shops: "Shops", pharmacy: "Pharmacy" },

  popularRestaurants: "Popular restaurants",
  popularRestaurantsSub: "Most ordered near you",
  popularShops: "Popular shops",
  popularShopsSub: "Pharmacy, grocery, butchery and more",
  seeAll: "See all",
  freeDelivery: "Free delivery",
  delivery: (fee: string): string => `${fee} delivery`,
  eta: (minutes: number): string => `${minutes} min`,

  /** The live-order bar (H1). */
  onTheWay: (firstName: string): string => `${firstName} is on the way`,
  moreOrders: (n: number): string => `+${n} order${n === 1 ? "" : "s"}`,

  /** H6 — no address yet. */
  noLocTitle: "Where should we deliver?",
  noLocBody: "Set your area to see restaurants and shops that deliver to you.",
  useMyLocation: "Use my location",
  typeAddress: "Type an address",
  /** README §2 rules: both rails empty → the H6 card with this title. */
  nothingHere: "Nothing delivers here yet",

  /** H5 — the location sheet. */
  deliverTo: "Deliver to",
  sheetSearch: "Search street, suburb or landmark",
  useCurrent: "Use my current location",
  useCurrentSub: "Most accurate for your rider",
  home: "Home",
  work: "Work",
  addPlace: "Add a place",

  /** The notify-me sheet (`mint2.js` `H.notify`, drawn for Shops). */
  notifyMe: "Notify me",
  notNow: "Not now",
  soon: {
    shops: {
      title: "Shops are coming soon",
      body: "Groceries, butcheries, fashion and auto parts from shops near you. We’ll message you on WhatsApp the day they open in your area.",
    },
    // Pharmacy and (kill-switched) Restaurants: drawn by the Browse v2 handoff (`B.svc.*.off`,
    // packages/design/handoff/browse-v2, ledger D-57), verbatim. Calm Mint v2 drew Shops only.
    pharmacy: {
      title: "Pharmacy is coming soon",
      body: "Over-the-counter medicine, baby care and first aid from pharmacies near you. We’ll message you on WhatsApp the day it opens in your area.",
    },
    food: {
      title: "Restaurants are coming soon",
      body: "Meals from kitchens near you, cooked to order. We’ll message you on WhatsApp the day they open in your area.",
    },
  },
  /** D-55: the armed state of the notify toggle (kept from 8c — a second tap must undo the first). */
  notifyArmed: "We’ll let you know",
} as const;
