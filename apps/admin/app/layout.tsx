import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lynia Admin",
  description: "Monitor & support console for the Lynia Express pilot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
