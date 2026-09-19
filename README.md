# Iago Radar

Finds local businesses with no website, using OpenStreetMap data only, so you can
prioritise outreach by neighbourhood and niche.

Zero ongoing cost by design: Nominatim and Overpass are free and keyless, Vercel's
Hobby tier runs the app and the nightly cron, and a free Neon / Vercel Postgres
database stores the results. No paid API tier or billing account anywhere.

## Status: Phase 1

- **Phase 1 (done)** — single-city crawler for Tegucigalpa, Postgres schema,
  results list filterable by zone *and* niche at the same time.
- **Phase 2 (next)** — CSV export, "Start build" creating a draft site from the
  matched template, pipeline save.
- **Phase 3** — more niche templates as they get built.
- **Phase 4 (later)** — Leaflet map view of the same stored rows, using OSM tiles.
  No new data source.

Niche → template matching and the zone/niche grouping model are already in the
schema, because retrofitting them later would mean a re-crawl.

## Stack

Next.js 16 (App Router) + TypeScript, Postgres via `pg`, Tailwind v4, deployed on
Vercel. Plain SQL migrations, no ORM.

## Getting started

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL and OSM_CONTACT
npm run db:migrate                # creates the schema and seeds Tegucigalpa
npm run crawl -- --max-cells=3    # smoke test: 3 grid cells
npm run crawl                     # full pass, ~64 Overpass requests
npm run report                    # data quality summary
npm run dev
```

`OSM_CONTACT` is appended to the User-Agent sent to Nominatim and Overpass. Both
ask for a way to reach you about expensive queries; please set it.

## How the crawl works

A city is stored as a bounding box plus a cell size. The crawler splits the box
into a grid and issues **one Overpass request per cell**, at least 1.2 s apart,
never in parallel.

Tegucigalpa's bounding box is about 240 km². At `cell_size_km = 2` that is a
64-cell grid of roughly 4 km² each, which answer in 1–3 s.

### Overpass queries that would time out

This is the failure mode worth naming up front: **a single query covering a whole
city does not work.** With our tag filters, all 240 km² of Tegucigalpa in one
request ends in `runtime error: Query timed out` or a 429, intermittently, which
reads like a bug in your code rather than a fair-use problem.

So `assertQueryableArea` rejects any single query above 36 km² (a ~6 km square)
*before* it is sent, and warns above 16 km². If you raise a city's
`cell_size_km` too far, you get an immediate, explicit error instead of flaky
timeouts in production. The relevant knobs, in the order worth trying:

1. `cities.cell_size_km` — lower it (1–1.5 km) for dense areas.
2. `OVERPASS_TIMEOUT_SECONDS` in `lib/osm/overpass.ts` — the `[timeout:]` we ask
   Overpass for.
3. `AMENITY_ALLOWLIST` in `lib/osm/categories.ts` — fewer tag clauses, less work
   per query.

The query itself is kept cheap: one `nwr` statement per tag key and
`out tags center`, so ways and relations come back as a single coordinate instead
of full geometry.

### Resumability

A full pass does not fit in one Vercel function invocation (Hobby caps at 60 s).
Each run enqueues its cells in `crawl_cells`; a slice processes what fits in ~42 s,
then chains the next invocation. Progress lives in the database, so a crashed or
timed-out slice is picked up by the next one, and a cell is retried up to three
times before being left failed.

The public Overpass instances fail regularly — connect timeouts and "the server
is probably too busy". The client tries each mirror once per round rather than
retrying a busy mirror, and remembers which one answered last.

### Only use whole-planet mirrors

Some community Overpass instances host a **regional extract**, and they answer an
out-of-region query with HTTP 200 and an empty element list — indistinguishable
from "there are no businesses here". `overpass.osm.ch` (Switzerland) was in the
default list at first and silently zeroed 17 of Tegucigalpa's 64 cells, losing
938 real businesses without a single error.

So verify any mirror you add against a known-busy box before trusting it:

```bash
curl -s https://<mirror>/api/interpreter --data-urlencode \
  'data=[out:json];nwr["shop"](14.0967,-87.2067,14.1146,-87.1882);out tags center;' | head -c 200
```

A working global mirror returns a couple of hundred elements. As a backstop, a
run that finishes having seen zero elements across every cell records that as an
error on the run instead of looking like a successful empty crawl.

## Grouping

Every business gets both:

- a **niche**, from its OSM tag (`shop:bakery`, `healthcare:dentist`, …), and
- a **zone**, from `addr:suburb` / `addr:neighbourhood` / `addr:quarter` where
  tagged, otherwise a fallback grid square (`zone_size_km`, default 0.7 km) named
  `Grid B7`.

Rename or merge zones on the `/zones` tab. A zone's identity is its
`derivation_key`, not its name, so renaming survives the next crawl; merging
leaves a pointer so newly crawled businesses follow the merge.

The results list filters by zone and niche **simultaneously** — each facet's
counts are computed with every other filter applied, so neither one narrows the
other's options away.

## The no-website flag

A business is flagged a prospect when no `website`, `contact:website` or `url`
tag was found. That means **"no website recorded in OpenStreetMap"**, not "no
website exists" — OSM data is often incomplete or stale. The UI says "No site
found" rather than "no site", and repeats the caveat above the list.

A `website` tag pointing at Facebook, Instagram, Linktree and similar is treated
as a social profile, not a website, so those businesses stay prospects. That is
usually the best kind of lead.

## Templates

`lib/templates/registry.ts` maps niches to templates: dentist, coffee shop,
beauty salon today. Anything unmatched falls into `default` — never dropped. To
add one, add an entry and run `npm run regroup`, which re-derives niche, zone,
template and contact fields from the OSM tags already stored. No Overpass
requests, no re-crawl.

## Deploying

1. Create a free Neon or Vercel Postgres database; set `DATABASE_URL` (pooled) in
   Vercel.
2. Set `CRON_SECRET` (`openssl rand -hex 32`) and `OSM_CONTACT`.
3. Deploy. `vercel.json` registers the nightly cron at 07:00 UTC (01:00 in
   Honduras), which Vercel calls with `Authorization: Bearer $CRON_SECRET`.
4. Run `npm run db:migrate` once against the production database.

Hobby-tier notes: two cron jobs, daily granularity, 60 s max function duration.
The slice-and-chain design is what makes a nightly cron enough to cover the whole
city in one night.

`ENABLE_MANUAL_CRAWL=1` adds a "crawl 5 more cells now" button to `/crawl`. Leave
it unset in production — the deployment is public, and that button spends Overpass
requests.

## Adding a city

```bash
npx tsx scripts/add-city.ts --name=Comayagua --country=Honduras
npm run crawl -- --city=comayagua
```

It geocodes with Nominatim, prints the resulting grid size, and stores the city.
To crawl it nightly, add a second entry to `vercel.json` (Hobby allows two).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Applies `db/migrations/*.sql` in order, once each |
| `npm run crawl` | Drains a city's cell queue locally, no time limit |
| `npm run report` | Coverage, niche/zone/template breakdown, sample prospects |
| `npm run regroup` | Re-derives everything from stored tags, no Overpass calls |
| `npm test` | Unit tests for grid, tag classification, zones, templates, filters |
| `npm run typecheck` | `tsc --noEmit` |

## Data licence

OpenStreetMap data is ODbL. Attribute OpenStreetMap contributors anywhere you
publish or share it.
