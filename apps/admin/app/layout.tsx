import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LyniaGo — Admin",
  description: "Monitor & support console for the LyniaGo pilot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
