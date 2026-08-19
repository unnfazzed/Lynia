import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LyniaGo — Merchant",
  description: "Merchant dashboard for the LyniaGo Restaurants vertical",
};

// Merchants run this on a phone as often as on the counter tablet, so the shell has to own the
// viewport rather than inherit Next's default. `viewportFit: "cover"` is what puts the safe-area
// insets the bottom nav and the sheets read (`env(safe-area-inset-bottom)`) into play on a notched
// device. Zoom is deliberately NOT capped — pinch-zoom is an accessibility affordance, and nothing
// here relies on the layout viewport staying put.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The dashboard will be a LIVE order surface (WebSocket queue, P3) — never statically prerender it,
// for the same reason as the admin console (its QA finding D-1: a build-time fetch would bake the
// offline state permanently). Set now so the P3 pages inherit the correct posture from day one.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
