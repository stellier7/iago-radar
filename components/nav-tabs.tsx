"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Prospects" },
  { href: "/zones", label: "Zones" },
  { href: "/crawl", label: "Crawl" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 rounded-xl bg-surface-muted p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
