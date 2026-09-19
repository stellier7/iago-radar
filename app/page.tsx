import Link from "next/link";

import { BusinessCard } from "@/components/business-card";
import { FilterBar } from "@/components/filter-bar";
import {
  listBusinesses,
  nicheFacets,
  summarize,
  templateFacets,
  zoneFacets,
  type BusinessFilters,
  type BusinessRecord,
} from "@/lib/repo/businesses";
import { SetupNotice } from "@/components/setup-notice";
import { getCityBySlug } from "@/lib/repo/cities";
import { PAGE_SIZE, parseFilters, toQueryString, type RawSearchParams } from "@/lib/ui/filters";
import { loadOrExplainSetup } from "@/lib/ui/setup";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const state = parseFilters(await searchParams);

  const cityResult = await loadOrExplainSetup(() => getCityBySlug(state.citySlug));
  if (!cityResult.ok) return <SetupNotice problem={cityResult.problem} />;
  const city = cityResult.data;

  if (!city) {
    return (
      <EmptyState title={`No city called "${state.citySlug}"`}>
        Run <code>npm run db:migrate</code> to seed Tegucigalpa, or add a city with{" "}
        <code>npx tsx scripts/add-city.ts --name=Comayagua</code>.
      </EmptyState>
    );
  }

  const filters: BusinessFilters = {
    cityId: city.id,
    zoneIds: state.zoneIds,
    includeNoZone: state.includeNoZone,
    nicheKeys: state.nicheKeys,
    templateKeys: state.templateKeys,
    website: state.website,
    search: state.search,
    namedOnly: state.namedOnly,
    sort: state.sort,
    grouped: state.grouped,
    limit: PAGE_SIZE,
    offset: (state.page - 1) * PAGE_SIZE,
  };

  const [businesses, summary, zones, niches, templates, allWebsiteStates] = await Promise.all([
    listBusinesses(filters),
    summarize(filters),
    zoneFacets(filters),
    nicheFacets(filters),
    templateFacets(filters),
    // Counts for the website segmented control, ignoring its own selection.
    summarize({ ...filters, website: "all" }),
  ]);

  return (
    <div>
      <FilterBar
        zones={zones}
        niches={niches}
        templates={templates}
        selected={state}
        websiteCounts={{
          all: allWebsiteStates.total,
          missing: allWebsiteStates.prospects,
          present: allWebsiteStates.total - allWebsiteStates.prospects,
        }}
      />

      <p className="mb-1 text-sm text-ink-muted">
        <strong className="text-ink">{summary.total}</strong> businesses in {city.name}
        {summary.prospects > 0 && <> · {summary.prospects} with no website found</>}
        {summary.withPhone > 0 && <> · {summary.withPhone} with a phone number</>}
      </p>
      <p className="mb-4 text-xs text-ink-muted">
        &ldquo;No site found&rdquo; means OpenStreetMap has no website tag. Treat it as a lead worth checking, not proof
        the business has no site.
      </p>

      {businesses.length === 0 ? (
        <EmptyState title="Nothing matches these filters">
          {summary.total === 0 && allWebsiteStates.total === 0 ? (
            <>
              No businesses stored for {city.name} yet. Run <code>npm run crawl</code> locally, or wait for the nightly
              cron to finish its first pass.
            </>
          ) : (
            <>Try clearing a zone or niche filter, or switch the website filter to &ldquo;All&rdquo;.</>
          )}
        </EmptyState>
      ) : state.grouped ? (
        <GroupedList businesses={businesses} />
      ) : (
        <ul className="space-y-2">
          {businesses.map((business) => (
            <BusinessCard key={business.id} business={business} showZone />
          ))}
        </ul>
      )}

      <Pagination state={state} resultCount={businesses.length} total={summary.total} />
    </div>
  );
}

function GroupedList({ businesses }: { businesses: BusinessRecord[] }) {
  const groups = new Map<string, BusinessRecord[]>();
  for (const business of businesses) {
    const key = business.zoneName ?? "No zone";
    const existing = groups.get(key);
    if (existing) existing.push(business);
    else groups.set(key, [business]);
  }

  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([zoneName, members]) => (
        <details key={zoneName} open className="rounded-xl border border-line bg-surface-muted">
          <summary className="tap-target cursor-pointer select-none px-3 text-sm font-semibold">
            {zoneName}
            <span className="ml-2 font-normal text-ink-muted">
              {members.length} · {members.filter((b) => !b.hasWebsite).length} without a site
            </span>
          </summary>
          <ul className="space-y-2 p-2 pt-0">
            {members.map((business) => (
              <BusinessCard key={business.id} business={business} showZone={false} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function Pagination({
  state,
  resultCount,
  total,
}: {
  state: ReturnType<typeof parseFilters>;
  resultCount: number;
  total: number;
}) {
  const hasPrevious = state.page > 1;
  const hasNext = (state.page - 1) * PAGE_SIZE + resultCount < total;
  if (!hasPrevious && !hasNext) return null;

  const href = (page: number) => {
    const queryString = toQueryString({ ...state, page });
    return queryString ? `/?${queryString}` : "/";
  };

  return (
    <nav className="mt-4 flex items-center justify-between gap-2">
      {hasPrevious ? (
        <Link href={href(state.page - 1)} className="tap-target rounded-lg border border-line px-4 text-sm">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-ink-muted">Page {state.page}</span>
      {hasNext ? (
        <Link href={href(state.page + 1)} className="tap-target rounded-lg border border-line px-4 text-sm">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-ink-muted">{children}</p>
    </div>
  );
}
