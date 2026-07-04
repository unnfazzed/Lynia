import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";

export const metadata: Metadata = {
  title: "LyniaGo — Admin",
  description: "Monitor & support console for the LyniaGo pilot",
};

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
