import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";
import { adminFetch } from "./lib/api";
import type { NavCounts } from "./lib/adminTypes";

export const metadata: Metadata = {
  title: "LyniaGo — Admin",
  description: "Monitor & support console for the LyniaGo pilot",
};

// The ops console is a LIVE monitoring surface — never statically prerender it. Without this, a page
// whose data fetch early-returns null when API_BASE_URL is unset (overview, cash — they lack the
// searchParams/params dynamic signal the list/detail routes have) bakes `data=null` at build time and
// ships permanently "API not connected" even when the runtime env is set correctly (QA finding D-1).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The real human operator the fail-closed middleware asserted (verified IAP identity), forwarded as
  // `x-lynia-operator`. Absent on the dev/offline path — the Sidebar then shows a generic label.
  const operator = (await headers()).get("x-lynia-operator");
  // Cheap attention badges (KYC backlog / open disputes / un-acked SOS) rendered shell-wide. Best-effort:
  // null on the offline/unconfigured path, so the sidebar simply renders no badges.
  const counts = await adminFetch<NavCounts>("/admin/nav-counts");

  return (
    <html lang="en">
      <body>
        {/* Skip link — first focusable element; lets a keyboard/SR user jump past the nav to the content. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/* Ops-console shell: 216px sidebar (kit shell.js) + the page's own <main>. */}
        <div className="shell">
          <Sidebar operator={operator} counts={counts} />
          <div id="main-content" tabIndex={-1} style={{ display: "flex", flex: 1, minWidth: 0 }}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
