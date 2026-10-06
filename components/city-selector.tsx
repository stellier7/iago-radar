"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";

const STORAGE_KEY = "iago-radar-city";
const ADD_VALUE = "__add__";
/** Matches `parseFilters` when `?city=` is omitted. */
const DEFAULT_CITY = "tegucigalpa";

export type CityOption = {
  slug: string;
  name: string;
};

export function CitySelector({ cities }: { cities: CityOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlCity = searchParams.get("city");
  const current =
    urlCity && cities.some((city) => city.slug === urlCity)
      ? urlCity
      : cities.some((city) => city.slug === DEFAULT_CITY)
        ? DEFAULT_CITY
        : (cities[0]?.slug ?? DEFAULT_CITY);

  // Remember the last city on this device so returning visitors (and you, on
  // the iPad) land on Comayagua without re-picking every time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (urlCity) {
      window.localStorage.setItem(STORAGE_KEY, urlCity);
      return;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== DEFAULT_CITY && cities.some((city) => city.slug === saved)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("city", saved);
      params.delete("page");
      params.delete("zone");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }
  }, [urlCity, cities, pathname, router, searchParams]);

  function onChange(value: string) {
    if (value === ADD_VALUE) {
      startTransition(() => router.push("/cities/new"));
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (value === "tegucigalpa") params.delete("city");
    else params.set("city", value);
    // Zone ids are per-city; carry nothing over when switching.
    params.delete("zone");
    params.delete("page");
    window.localStorage.setItem(STORAGE_KEY, value);

    const query = params.toString();
    const href = pathname === "/cities/new" ? (query ? `/?${query}` : "/") : query ? `${pathname}?${query}` : pathname;
    startTransition(() => router.push(href, { scroll: false }));
  }

  if (cities.length === 0) return null;

  return (
    <label className={`flex items-center gap-2 text-sm ${isPending ? "opacity-70" : ""}`}>
      <span className="sr-only">Location</span>
      <select
        value={current}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Location"
        className="tap-target max-w-[11rem] rounded-lg border border-line bg-surface px-2 text-sm font-medium sm:max-w-none"
      >
        {cities.map((city) => (
          <option key={city.slug} value={city.slug}>
            {city.name}
          </option>
        ))}
        <option value={ADD_VALUE}>Add location…</option>
      </select>
    </label>
  );
}
