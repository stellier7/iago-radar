"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import type { Facet, SortKey, WebsiteFilter } from "@/lib/repo/businesses";
import { templateLabel } from "@/lib/templates/registry";

export type FilterBarProps = {
  zones: Facet[];
  niches: Facet[];
  templates: Facet[];
  selected: {
    zoneIds: number[];
    includeNoZone: boolean;
    nicheKeys: string[];
    templateKeys: string[];
    website: WebsiteFilter;
    search: string | null;
    namedOnly: boolean;
    sort: SortKey;
    grouped: boolean;
  };
  websiteCounts: { all: number; missing: number; present: number };
};

const CHIPS_BEFORE_COLLAPSE = 8;

const WEBSITE_OPTIONS: Array<{ value: WebsiteFilter; label: string; countKey: keyof FilterBarProps["websiteCounts"] }> = [
  { value: "missing", label: "No website", countKey: "missing" },
  { value: "present", label: "Has website", countKey: "present" },
  { value: "all", label: "All", countKey: "all" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "name", label: "Name" },
  { value: "niche", label: "Niche" },
  { value: "recent", label: "Recently seen" },
];

export function FilterBar({ zones, niches, templates, selected, websiteCounts }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(selected.search ?? "");

  function navigate(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // Any filter change invalidates the current page offset.
    params.delete("page");
    const queryString = params.toString();
    startTransition(() => router.replace(queryString ? `/?${queryString}` : "/", { scroll: false }));
  }

  function setParam(key: string, value: string | null) {
    navigate((params) => (value === null ? params.delete(key) : params.set(key, value)));
  }

  function toggleInList(key: string, value: string) {
    navigate((params) => {
      const current = (params.get(key) ?? "").split(",").filter(Boolean);
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      if (next.length === 0) params.delete(key);
      else params.set(key, next.join(","));
    });
  }

  const zoneSelection = new Set<string>([
    ...selected.zoneIds.map(String),
    ...(selected.includeNoZone ? ["none"] : []),
  ]);
  const activeCount =
    zoneSelection.size + selected.nicheKeys.length + selected.templateKeys.length + (selected.namedOnly ? 1 : 0);

  return (
    <div className={`mb-4 ${isPending ? "opacity-70" : ""}`}>
      {/* Sticky only the compact controls. Expanded niche lists live below so iOS
          does not trap touch scrolling inside a sticky panel taller than the viewport. */}
      <div className="sticky top-0 z-10 -mx-3 border-b border-line bg-canvas/95 px-3 pb-2 pt-2 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex gap-2">
        <form
          className="flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setParam("q", searchDraft.trim() || null);
          }}
        >
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onBlur={() => setParam("q", searchDraft.trim() || null)}
            placeholder="Search name or niche"
            aria-label="Search by name or niche"
            className="tap-target w-full rounded-lg border border-line bg-surface px-3 text-base"
          />
        </form>
        <select
          value={selected.sort}
          onChange={(event) => setParam("sort", event.target.value === "name" ? null : event.target.value)}
          aria-label="Sort businesses"
          className="tap-target rounded-lg border border-line bg-surface px-2 text-sm"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex rounded-lg bg-surface-muted p-1" role="group" aria-label="Website status">
        {WEBSITE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected.website === option.value}
            onClick={() => setParam("web", option.value === "missing" ? null : option.value)}
            className={`tap-target flex-1 rounded-md px-2 text-sm font-medium ${
              selected.website === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-muted"
            }`}
          >
            {option.label}
            <span className="ml-1 text-xs font-normal tabular-nums opacity-70">
              {websiteCounts[option.countKey]}
            </span>
          </button>
        ))}
        </div>
      </div>

      <details className="relative z-0 -mx-3 mt-2 rounded-lg border border-line bg-surface sm:-mx-5">
        <summary className="tap-target cursor-pointer select-none px-3 text-sm font-medium">
          Zone &amp; niche filters
          {activeCount > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">{activeCount}</span>
          )}
        </summary>
        <div className="scroll-panel max-h-[min(55vh,24rem)] space-y-4 border-t border-line px-3 py-3 sm:max-h-[min(60vh,28rem)]">
          <ChipGroup
            title="Zones"
            facets={zones}
            selection={zoneSelection}
            onToggle={(value) => toggleInList("zone", value)}
          />
          <ChipGroup
            title="Niches"
            facets={niches}
            selection={new Set(selected.nicheKeys)}
            onToggle={(value) => toggleInList("niche", value)}
          />
          <ChipGroup
            title="Templates"
            facets={templates.map((facet) => ({ ...facet, label: templateLabel(facet.label) }))}
            selection={new Set(selected.templateKeys)}
            onToggle={(value) => toggleInList("tpl", value)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <label className="tap-target cursor-pointer gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.namedOnly}
                onChange={(event) => setParam("named", event.target.checked ? "1" : null)}
                className="size-4"
              />
              Named businesses only
            </label>
            <label className="tap-target cursor-pointer gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.grouped}
                onChange={(event) => setParam("group", event.target.checked ? null : "flat")}
                className="size-4"
              />
              Group by zone
            </label>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate((params) => {
                    for (const key of ["zone", "niche", "tpl", "named"]) params.delete(key);
                  })
                }
                className="tap-target rounded-lg border border-line px-3 text-sm"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function ChipGroup({
  title,
  facets,
  selection,
  onToggle,
}: {
  title: string;
  facets: Facet[];
  selection: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (facets.length === 0) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
        <p className="text-sm text-ink-muted">Nothing to filter yet.</p>
      </div>
    );
  }

  // Selected chips stay visible even when the list is collapsed, so you can
  // always see and undo what is active.
  const visible = expanded
    ? facets
    : facets.filter((facet, index) => index < CHIPS_BEFORE_COLLAPSE || selection.has(facet.value));

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((facet) => {
          const active = selection.has(facet.value);
          return (
            <button
              key={facet.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(facet.value)}
              className={`min-h-9 rounded-full border px-3 text-sm ${
                active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-muted text-ink"
              }`}
            >
              {facet.label}
              <span className="ml-1 text-xs tabular-nums opacity-70">{facet.total}</span>
            </button>
          );
        })}
        {facets.length > visible.length && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-h-9 rounded-full border border-dashed border-line px-3 text-sm text-ink-muted"
          >
            +{facets.length - visible.length} more
          </button>
        )}
        {expanded && facets.length > CHIPS_BEFORE_COLLAPSE && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="min-h-9 rounded-full border border-line px-3 text-sm text-ink-muted"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}
