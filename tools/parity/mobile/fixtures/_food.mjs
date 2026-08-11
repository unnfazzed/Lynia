// Shared corridor restaurant + menu data and a cart-seeding wrap for the customer food fixtures.
// The cart lives in a React context (src/food/cart-context) backed by SecureStore, which the parity
// harness shims to empty — so a fixture can't seed the cart through storage. Instead `withCart` wraps
// the screen in the REAL FoodCartProvider and mounts a tiny Seeder inside it that calls the real
// `addItem` on mount, populating the same context the screen reads. Empty-cart screens use `withCart([])`.
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FoodCartProvider, useFoodCart } from "../../../../apps/mobile/src/food/cart-context";
import { AuthProvider } from "../../../../apps/mobile/src/auth/auth-context";

const open = { open: "00:00", close: "23:59" };
export const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };
export const LOC = { lat: -17.8292, lng: 31.0522 };

// A single open kitchen, its uuid reused across menu/cart/checkout so the cart's restaurantId matches
// the menu fetch (reconciliation keeps the lines instead of dropping them as "sold out").
export const RID = "0a1b2c3d-0000-4000-8000-0000000001a0";
export const RESTAURANT = {
  id: RID,
  name: "Gava's Kitchen",
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: ["Zimbabwean", "Grills"],
  priceLevel: 2,
  hours: HOURS,
  location: LOC,
};

function dish(i, name, description, priceUsd) {
  return { id: `0a1b2c3d-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, name, description, priceUsd, photoUrl: null, outOfStock: false };
}

export const DISHES = {
  sadza: dish(1, "Sadza & Beef Stew", "Slow-cooked beef stew with fresh sadza", 4.5),
  chicken: dish(2, "Roast Chicken (Half)", "Flame-grilled with peri-peri", 6.0),
  greens: dish(3, "Muriwo & Peanut Butter", "Covo greens in peanut butter", 2.5),
  rice: dish(4, "Rice & Chicken", "Seasoned rice with grilled chicken", 5.0),
  drink: dish(5, "Mazoe Orange (500ml)", "Chilled Mazoe cordial", 1.5),
};

export const MENU = {
  restaurant: RESTAURANT,
  categories: [
    { id: "0a1b2c3d-0000-4000-8000-0000000002c1", name: "Mains", dishes: [DISHES.sadza, DISHES.chicken, DISHES.rice] },
    { id: "0a1b2c3d-0000-4000-8000-0000000002c2", name: "Sides", dishes: [DISHES.greens] },
    { id: "0a1b2c3d-0000-4000-8000-0000000002c3", name: "Drinks", dishes: [DISHES.drink] },
  ],
};

/** A cart line from a menu dish. */
export function line(d, quantity, note = "") {
  return { dishId: d.id, name: d.name, priceUsd: d.priceUsd, quantity, note };
}

// --- Order tracking (app/food/order/[orderId].tsx) fixtures ---
export const OID = "0a1b2c3d-0000-4000-8000-000000000501";
export const RIDER_ID = "0a1b2c3d-0000-4000-8000-0000000000f1";
export const DROP = { lat: -17.8145, lng: 31.045 };

/** A MerchantOrderResponse (the customer's food-order view — GET /restaurants/orders/:id). Base is a
 *  fully-priced order at Gava's Kitchen; pass overrides for the phase/status of the state you want. */
export function foodOrder(over = {}) {
  return {
    id: OID,
    merchantId: RID,
    status: "en_route_dropoff",
    merchantPhase: null,
    items: [
      { dishId: DISHES.sadza.id, name: DISHES.sadza.name, priceUsd: DISHES.sadza.priceUsd, quantity: 2, note: null, available: true },
      { dishId: DISHES.chicken.id, name: DISHES.chicken.name, priceUsd: DISHES.chicken.priceUsd, quantity: 1, note: null, available: true },
      { dishId: DISHES.drink.id, name: DISHES.drink.name, priceUsd: DISHES.drink.priceUsd, quantity: 2, note: "Extra cold", available: true },
    ],
    note: null,
    paymentMethod: "wallet",
    merchantPaymentPhone: "+263 77 000 0000",
    merchantGoodsTotal: 15.5,
    deliveryFee: 2.5,
    total: 18.0,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 25,
    prepStartedAt: new Date(Date.now() - 600_000).toISOString(),
    readyAt: new Date(Date.now() - 120_000).toISOString(),
    rejectionReason: null,
    paymentCallLoggedAt: null,
    paymentRequestedAt: null,
    merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null,
    riderId: RIDER_ID,
    dispatchAttempt: 1,
    dispatchOfferExpiresAt: null,
    noRiderHoldAt: null,
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    ...over,
  };
}

/** wrap for the order-tracking screen (app/food/order/[orderId].tsx): its useOrderSocket calls
 *  useAuth, so an AuthProvider must be present in addition to the QueryClient. The AuthProvider loads
 *  a null session (SecureStore is shimmed) and renders children immediately; the socket is shimmed. */
export function withOrder() {
  return (el) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
    return React.createElement(QueryClientProvider, { client: qc }, React.createElement(AuthProvider, null, el));
  };
}

/** The generic OrderSnapshot the live tracker reads once a rider is secured (GET /orders/:id). Fares
 *  are wire STRINGS. Pass overrides (status/events) to match the order's state. */
export function orderSnapshot(over = {}) {
  return {
    id: OID,
    status: "en_route_dropoff",
    orderType: "merchant",
    viewerRole: "customer",
    agreedFare: "18.00",
    proposedFare: "18.00",
    pickup: { point: LOC, landmark: "Gava's Kitchen" },
    dropoff: { point: DROP, landmark: "12 Fife Avenue" },
    items: null,
    note: null,
    rider: { profileId: RIDER_ID, currentLat: -17.821, currentLng: 31.049, updatedAt: new Date().toISOString() },
    events: [
      { status: "assigned", createdAt: new Date(Date.now() - 1_500_000).toISOString() },
      { status: "confirmed", createdAt: new Date(Date.now() - 1_200_000).toISOString() },
      { status: "en_route_pickup", createdAt: new Date(Date.now() - 900_000).toISOString() },
      { status: "picked_up", createdAt: new Date(Date.now() - 420_000).toISOString() },
      { status: "en_route_dropoff", createdAt: new Date(Date.now() - 180_000).toISOString() },
    ],
    counterpartyPhone: "+263 77 123 4567",
    expiresAt: null,
    ...over,
  };
}

function Seeder({ lines, children }) {
  const cart = useFoodCart();
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current || lines.length === 0) return;
    done.current = true;
    for (const l of lines) cart.addItem(RID, RESTAURANT.name, l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}

/** wrap that provides react-query + the real food cart, seeded with `lines` (pass [] for an empty cart). */
export function withCart(lines = []) {
  return (el) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
    return React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(FoodCartProvider, null, React.createElement(Seeder, { lines }, el)),
    );
  };
}

/**
 * A gated seeder for the CHECKOUT screen. app/food/checkout.tsx calls a `useMemo` (idempotencyKey)
 * AFTER its skeleton/empty early-returns, so if the cart/menu transitions empty→loaded while mounted
 * the hook count changes ("Rendered more hooks…"). In the real app the customer arrives from the cart
 * with the menu already query-cached and the cart already populated, so checkout's very first render
 * is the full render — no transition. This reproduces that: it mounts the screen only once the cart is
 * ready+populated, and seeds the menu into the query cache so `restaurant` is present on that first
 * render. `onReady` optionally runs a DOM action (e.g. selecting the wallet payment row) after mount.
 */
function GatedSeeder({ lines, onReady, children }) {
  const cart = useFoodCart();
  const seeded = React.useRef(false);
  const [go, setGo] = React.useState(false);
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const l of lines) cart.addItem(RID, RESTAURANT.name, l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (cart.ready && (lines.length === 0 || cart.cart.lines.length > 0)) setGo(true);
  }, [cart.ready, cart.cart.lines.length, lines.length]);
  React.useEffect(() => {
    if (go && onReady) onReady();
  }, [go, onReady]);
  return go ? children : null;
}

/** Gated cart+menu wrap for the checkout screen (see GatedSeeder). `onReady` runs after the screen
 *  mounts — used by the wallet fixture to click the "Mobile money" payment row. */
export function withCheckout(lines, onReady) {
  return (el) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
    qc.setQueryData(["restaurants", RID, "menu"], MENU);
    return React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(FoodCartProvider, null, React.createElement(GatedSeeder, { lines, onReady }, el)),
    );
  };
}
