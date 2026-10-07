import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./mobile.css";
import { AccessGate } from "./components/AccessGate";
import { ToastProvider } from "./components/m/Toast";

export const metadata: Metadata = {
  title: "LyniaGo Merchant",
  description: "Orders, menu and money for LyniaGo restaurants and shops",
};

// A phone-first app (the merchant-mobile redesign, 360px), so the shell has to own the
// viewport rather than inherit Next's default. `viewportFit: "cover"` is what puts the safe-area
// insets the bottom nav and the sheets read (`env(safe-area-inset-bottom)`) into play on a notched
// device. Zoom is deliberately NOT capped — pinch-zoom is an accessibility affordance, and nothing
// here relies on the layout viewport staying put.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// A static export (next.config.js, docs/MERCHANT-WEB.md): every page is a shell built once, and all of
// its data is fetched in the browser after it loads, so nothing live is ever baked in at build time.
// The Suspense boundary is what lets a page read its id from the query string (lib/routes.ts) in an
// exported build.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AccessGate>
            <Suspense fallback={null}>{children}</Suspense>
          </AccessGate>
        </ToastProvider>
      </body>
    </html>
  );
}
