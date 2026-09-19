import { AMENITY_ALLOWLIST, TOURISM_ALLOWLIST, type OsmTags } from "./categories";
import { areaKm2, type BoundingBox } from "../geo/bbox";
import { userAgent } from "./user-agent";

/**
 * Public Overpass instances, tried in order. All are free and keyless.
 * Override with OVERPASS_ENDPOINTS (comma separated) if one goes bad.
 */
const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

/** Overpass's own server-side timeout, in seconds, via the `[timeout:]` setting. */
export const OVERPASS_TIMEOUT_SECONDS = 60;

/** Minimum gap between two Overpass requests. Fair use: one request at a time. */
export const MIN_REQUEST_INTERVAL_MS = 1_200;

/**
 * Hard ceiling on the area of a single Overpass query.
 *
 * A query covering all of Tegucigalpa (~270 km2) with our tag filters reliably
 * ends in "runtime error: Query timed out" or a 429 from the public instances.
 * Grid cells of 2 km (4 km2) answer in about 1-3 seconds. Anything above this
 * cap is a bug in the caller's chunking, so we refuse it here instead of
 * discovering it as a flaky timeout in production.
 */
export const MAX_QUERY_AREA_KM2 = 36;

/** Above this we still run the query but log a warning. */
const WARN_QUERY_AREA_KM2 = 16;

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

export class OverpassAreaTooLargeError extends Error {}

export class OverpassError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function regexAlternation(values: Iterable<string>): string {
  return `^(${[...values].join("|")})$`;
}

/**
 * Builds the per-cell business query.
 *
 * `nwr` matches nodes, ways and relations in one statement; `out tags center`
 * returns tags plus a single coordinate per element, which keeps the response
 * small (no member geometry).
 */
export function buildBusinessQuery(bbox: BoundingBox, timeoutSeconds = OVERPASS_TIMEOUT_SECONDS): string {
  const b = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  const clauses = [
    `nwr["healthcare"](${b});`,
    `nwr["shop"](${b});`,
    `nwr["craft"](${b});`,
    `nwr["office"](${b});`,
    `nwr["amenity"~"${regexAlternation(AMENITY_ALLOWLIST)}"](${b});`,
    `nwr["tourism"~"${regexAlternation(TOURISM_ALLOWLIST)}"](${b});`,
  ];
  return [`[out:json][timeout:${timeoutSeconds}];`, "(", ...clauses.map((c) => `  ${c}`), ");", "out tags center;"].join(
    "\n",
  );
}

export function assertQueryableArea(bbox: BoundingBox): void {
  const area = areaKm2(bbox);
  if (area > MAX_QUERY_AREA_KM2) {
    throw new OverpassAreaTooLargeError(
      `Refusing to query ${area.toFixed(1)} km2 in one Overpass request (cap is ${MAX_QUERY_AREA_KM2} km2). ` +
        "Split the area into smaller grid cells - a single city-wide query will time out.",
    );
  }
  if (area > WARN_QUERY_AREA_KM2) {
    console.warn(
      `[overpass] querying ${area.toFixed(1)} km2 in one request; cells above ${WARN_QUERY_AREA_KM2} km2 ` +
        "get slow and start tripping the public instances' rate limits.",
    );
  }
}

/**
 * Pulls the human-readable complaint out of an Overpass HTML error page.
 * Without this, failures log as a wall of XHTML boilerplate.
 */
export function extractErrorText(body: string): string {
  const errors = [...body.matchAll(/<p>(?:<strong[^>]*>)?\s*Error\s*(?:<\/strong>)?\s*:?\s*([^<]+)/gi)].map((match) =>
    match[1]!.trim(),
  );
  if (errors.length > 0) return errors.join(" | ").slice(0, 300);

  const stripped = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (stripped || "empty response").slice(0, 300);
}

/** undici reports connection problems as a bare "fetch failed"; the cause has the detail. */
function describeNetworkError(endpoint: string, error: unknown): string {
  const cause = (error as { cause?: { message?: string; code?: string } }).cause;
  const detail = [cause?.code, cause?.message].filter(Boolean).join(" ");
  return `${endpoint}: ${(error as Error).message}${detail ? ` (${detail})` : ""}`;
}

let lastRequestAt = 0;

async function respectRateLimit(): Promise<void> {
  const waitMs = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configuredEndpoints(): string[] {
  const configured = process.env.OVERPASS_ENDPOINTS?.split(",").map((s) => s.trim()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_ENDPOINTS;
}

/**
 * Index of the mirror that answered last. The public instances go slow or
 * unreachable for minutes at a time, so once one works we start there instead of
 * paying the failover cost on every cell.
 */
let preferredEndpointIndex = 0;

function endpointsInPreferenceOrder(): string[] {
  const all = configuredEndpoints();
  const start = preferredEndpointIndex % all.length;
  return [...all.slice(start), ...all.slice(0, start)];
}

async function postOnce(endpoint: string, query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  await respectRateLimit();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(),
      Accept: "application/json",
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // 429 = too many requests, 504 = the query ran past Overpass's own timeout.
    const retryable = response.status === 429 || response.status === 504 || response.status >= 500;
    throw new OverpassError(`${endpoint} returned ${response.status}: ${extractErrorText(body)}`, retryable);
  }

  const text = await response.text();
  let payload: { elements?: OverpassElement[]; remark?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    // Overpass answers query errors and rate limits with an HTML page and a 200,
    // so the useful part has to be dug out of the markup.
    throw new OverpassError(`${endpoint} returned non-JSON: ${extractErrorText(text)}`, true);
  }

  // Overpass reports server-side timeouts and out-of-memory as a 200 with a
  // `remark` field, which is easy to mistake for an empty area.
  if (payload.remark && /timed out|out of memory|runtime error/i.test(payload.remark)) {
    throw new OverpassError(`${endpoint} remark: ${payload.remark}`, true);
  }

  return payload.elements ?? [];
}

export type FetchOptions = {
  /** Passes over the whole mirror list before giving up. */
  rounds?: number;
  /** Ceiling for a single HTTP request, separate from the overall deadline. */
  perRequestTimeoutMs?: number;
  /** Absolute time (ms epoch) after which no further attempt is started. */
  deadlineAt?: number;
  signal?: AbortSignal;
};

/** One request should answer well inside this; a slow cell means bad chunking. */
export const DEFAULT_PER_REQUEST_TIMEOUT_MS = 30_000;

export class OverpassDeadlineError extends Error {}

/**
 * Runs one Overpass query, retrying with backoff and failing over between
 * mirrors.
 *
 * The per-request timeout and the overall deadline are deliberately separate: a
 * single timeout covering retries plus backoff sleeps would abort the retry
 * chain before the last mirror is ever tried.
 */
export async function execute(query: string, options: FetchOptions = {}): Promise<OverpassElement[]> {
  const rounds = options.rounds ?? 2;
  const perRequestTimeoutMs = options.perRequestTimeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS;
  const all = configuredEndpoints();
  const endpointList = endpointsInPreferenceOrder();
  let attempts = 0;
  let lastEndpoint = endpointList[0]!;
  let lastError: unknown;

  // One try per mirror per round. Both common failures - a connect timeout and
  // "the server is probably too busy" - clear up by asking a different mirror,
  // not by asking the same one again, so move on immediately and only back off
  // once every mirror has refused.
  for (let round = 1; round <= rounds; round++) {
    for (const endpoint of endpointList) {
      if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
        throw new OverpassDeadlineError(
          `Ran out of time for this cell after ${attempts} attempt(s). ` +
            `Last error: ${lastError ? describeError(lastEndpoint, lastError) : "none"}`,
        );
      }

      attempts += 1;
      lastEndpoint = endpoint;
      const timeout = AbortSignal.timeout(perRequestTimeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      try {
        const elements = await postOnce(endpoint, query, signal);
        preferredEndpointIndex = all.indexOf(endpoint);
        return elements;
      } catch (error) {
        lastError = error;
        if (options.signal?.aborted) throw error;
        console.warn(`[overpass] ${describeError(endpoint, error)}`);
      }
    }

    if (round < rounds) {
      const backoffMs = Math.min(8_000, 2_000 * round);
      console.warn(`[overpass] every mirror refused; waiting ${backoffMs}ms before round ${round + 1}`);
      await sleep(backoffMs);
    }
  }

  throw new OverpassError(
    `All ${endpointList.length} Overpass endpoints failed over ${attempts} attempts. Last error: ` +
      describeError(lastEndpoint, lastError),
    true,
  );
}

/** One business query per grid cell. Refuses anything too large to answer. */
export async function fetchBusinesses(bbox: BoundingBox, options: FetchOptions = {}): Promise<OverpassElement[]> {
  assertQueryableArea(bbox);
  return execute(buildBusinessQuery(bbox), options);
}

function describeError(endpoint: string, error: unknown): string {
  return error instanceof OverpassError ? error.message : describeNetworkError(endpoint, error);
}
