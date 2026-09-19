import type { Metadata, Viewport } from "next";

import "./globals.css";
import { NavTabs } from "@/components/nav-tabs";

export const metadata: Metadata = {
  title: "Iago Radar",
  description: "Local businesses with no website, grouped by zone and niche.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Used one-handed while walking; a fixed header must not drift.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="mx-auto max-w-3xl px-3 pb-16 sm:px-5">
          <header className="flex items-baseline justify-between gap-3 py-4">
            <h1 className="text-lg font-semibold tracking-tight">Iago Radar</h1>
            <p className="text-xs text-ink-muted">OpenStreetMap data</p>
          </header>
          <NavTabs />
          <main className="pt-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
