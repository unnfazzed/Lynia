import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LyniaGo — Merchant",
  description: "Merchant dashboard for the LyniaGo Restaurants vertical",
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
