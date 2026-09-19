-- Phase 1 schema: cities -> grid crawl -> businesses grouped by zone + niche.

create table if not exists cities (
  id                serial primary key,
  slug              text not null unique,
  name              text not null,
  country_code      text,
  -- Bounding box, as returned by Nominatim.
  min_lat           double precision not null,
  min_lon           double precision not null,
  max_lat           double precision not null,
  max_lon           double precision not null,
  -- Overpass is queried one grid cell at a time; never the whole bbox at once.
  cell_size_km      double precision not null default 2,
  -- Fallback zone size for businesses with no addr:suburb / addr:neighbourhood.
  zone_size_km      double precision not null default 0.7,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint cities_bbox_ordered check (min_lat < max_lat and min_lon < max_lon)
);

create table if not exists zones (
  id                  serial primary key,
  city_id             integer not null references cities(id) on delete cascade,
  -- Stable key derived from OSM tags or the fallback grid. Renaming a zone must
  -- not change this, or the next crawl would create a duplicate.
  derivation_key      text not null,
  name                text not null,
  source              text not null check (source in ('osm_tag', 'grid')),
  center_lat          double precision,
  center_lon          double precision,
  -- Set when this zone has been merged into another one. New businesses whose
  -- derivation_key points here are assigned to the merge target instead.
  merged_into_zone_id integer references zones(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (city_id, derivation_key)
);

create index if not exists zones_city_idx on zones (city_id);

create table if not exists businesses (
  id                bigserial primary key,
  city_id           integer not null references cities(id) on delete cascade,
  osm_type          text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id            bigint not null,
  name              text,
  -- Which OSM key classified this business, e.g. shop / amenity / healthcare.
  primary_tag       text not null,
  primary_value     text not null,
  -- 'shop:bakery' - the niche used for filtering and template matching.
  niche_key         text not null,
  niche_label       text not null,
  -- Matched website template, or 'default' when the niche has no template yet.
  template_key      text not null,
  zone_id           integer references zones(id) on delete set null,
  lat               double precision,
  lon               double precision,
  phone             text,
  email             text,
  website           text,
  -- False whenever no website-ish tag was found. This means "no site recorded in
  -- OSM", not "no site exists" - see README.
  has_website       boolean not null default false,
  opening_hours     text,
  addr_street       text,
  addr_housenumber  text,
  addr_suburb       text,
  addr_neighbourhood text,
  addr_city         text,
  addr_postcode     text,
  -- {"facebook": "...", "instagram": "...", ...}
  socials           jsonb not null default '{}'::jsonb,
  -- Full OSM tag set, kept for auditing and for pre-filling drafts in phase 2.
  tags              jsonb not null default '{}'::jsonb,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (osm_type, osm_id)
);

create index if not exists businesses_city_zone_idx on businesses (city_id, zone_id);
create index if not exists businesses_city_niche_idx on businesses (city_id, niche_key);
create index if not exists businesses_city_website_idx on businesses (city_id, has_website);
create index if not exists businesses_city_template_idx on businesses (city_id, template_key);
create index if not exists businesses_name_idx on businesses (lower(name));

create table if not exists crawl_runs (
  id                  bigserial primary key,
  city_id             integer not null references cities(id) on delete cascade,
  status              text not null check (status in ('running', 'completed', 'failed')),
  trigger             text not null check (trigger in ('cron', 'manual')),
  cell_size_km        double precision not null,
  cells_total         integer not null default 0,
  elements_seen       integer not null default 0,
  businesses_upserted integer not null default 0,
  overpass_requests   integer not null default 0,
  error               text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);

create index if not exists crawl_runs_city_idx on crawl_runs (city_id, started_at desc);

create table if not exists crawl_cells (
  id            bigserial primary key,
  run_id        bigint not null references crawl_runs(id) on delete cascade,
  idx           integer not null,
  min_lat       double precision not null,
  min_lon       double precision not null,
  max_lat       double precision not null,
  max_lon       double precision not null,
  status        text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts      integer not null default 0,
  element_count integer,
  duration_ms   integer,
  error         text,
  updated_at    timestamptz not null default now(),
  unique (run_id, idx)
);

create index if not exists crawl_cells_claim_idx on crawl_cells (run_id, status, idx);
