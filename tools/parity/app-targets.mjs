/**
 * App-side targets, keyed by `${src}.${id}` (the same key as screens.generated.json).
 *
 * This is the ONE hand-maintained half of the registry, and it is meant to grow per-screen as each
 * screen is aligned — Phase 1 seeds only the screens actually wired end-to-end, to prove each path.
 * A screen with no entry here still renders its MOCK; its app column shows an honest "pending".
 *
 * Shapes:
 *   mobile:  { kind:"mobile", component:"app/(tabs)/home.tsx", fixture:"home", mode?:"phone" }
 *            component = path (from apps/mobile/) of the default-exported screen; fixture = a key in
 *            tools/parity/fixtures/ providing the mocked providers/props for that screen.
 *   web:     { kind:"web", app:"admin"|"merchant", route:"/orders", mode?:"admin"|"tablet",
 *              waitFor?:"css-selector" }  — Playwright screenshots the running Next dev server.
 */
export const APP_TARGETS = {
  // ── mobile (react-native-web harness) ──
  // LJ.splash is the native expo-splash-screen (no RN component), so it has no mobile target — the
  // sheet shows its mock only. The force/hold/offline blocking states ARE components and render.
  "LJ.force_update": { kind: "mobile", component: "app/force-update.tsx", fixture: "force_update" },

  // ── admin (Next.js) ──
  "ADMIN.index.html": { kind: "web", app: "admin", route: "/", mode: "admin" },
  "ADMIN.orders.html": { kind: "web", app: "admin", route: "/orders", mode: "admin" },

  // ── merchant (Next.js) ──
  // seeded as the merchant renderer is wired
};
