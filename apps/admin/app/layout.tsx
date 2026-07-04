import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";

export const metadata: Metadata = {
  title: "LyniaGo — Admin",
  description: "Monitor & support console for the LyniaGo pilot",
};

// The ops console is a LIVE monitoring surface — never statically prerender it. Without this, a page
// whose data fetch early-returns null when API_BASE_URL is unset (overview, cash — they lack the
// searchParams/params dynamic signal the list/detail routes have) bakes `data=null` at build time and
// ships permanently "API not connected" even when the runtime env is set correctly (QA finding D-1).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Ops-console shell: 216px sidebar (kit shell.js) + the page's own <main>. */}
        <div className="shell">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  );
}
