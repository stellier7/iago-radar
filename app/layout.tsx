import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import "./globals.css";
import { CitySelector } from "@/components/city-selector";
import { NavTabs } from "@/components/nav-tabs";
import { isDatabaseConfigured } from "@/lib/ui/setup";
import { listCities } from "@/lib/repo/cities";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let cities: Array<{ slug: string; name: string }> = [];
  if (isDatabaseConfigured()) {
    try {
      cities = (await listCities()).filter((city) => city.isActive).map((city) => ({ slug: city.slug, name: city.name }));
    } catch {
      cities = [];
    }
  }

  return (
    <html lang="en">
      <body className="antialiased">
        <div className="mx-auto max-w-3xl px-3 pb-16 sm:px-5">
          <header className="flex items-center justify-between gap-3 py-4">
            <h1 className="text-lg font-semibold tracking-tight">Iago Radar</h1>
            <Suspense fallback={<span className="text-xs text-ink-muted">Location</span>}>
              <CitySelector cities={cities} />
            </Suspense>
          </header>
          <Suspense fallback={<div className="h-11 rounded-xl bg-surface-muted" />}>
            <NavTabs />
          </Suspense>
          <main className="pt-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
