"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/", label: "Prospects" },
  { href: "/zones", label: "Zones" },
  { href: "/crawl", label: "Crawl" },
];

export function NavTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const city = searchParams.get("city");

  function hrefFor(tabHref: string): string {
    if (!city) return tabHref;
    const params = new URLSearchParams();
    params.set("city", city);
    return `${tabHref}?${params.toString()}`;
  }

  return (
    <nav className="flex gap-2 rounded-xl bg-surface-muted p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={hrefFor(tab.href)}
            aria-current={active ? "page" : undefined}
            className={`tap-target flex-1 rounded-lg px-3 text-sm font-medium transition ${
              active ? "bg-surface text-ink shadow-sm" : "text-ink-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
