import { after, NextResponse, type NextRequest } from "next/server";

import { runCrawlSlice } from "@/lib/crawl/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel's Hobby ceiling. The slice budget below leaves headroom under it. */
export const maxDuration = 60;

/**
 * Work budget per invocation. The rest of `maxDuration` is headroom for the
 * final bookkeeping queries and the chained request.
 */
const SLICE_BUDGET_MS = 42_000;

/**
 * A full Tegucigalpa pass is ~64 Overpass requests at roughly 2-4s each, which
 * does not fit in one function invocation. Each slice hands off to the next, so
 * a nightly cron drains the whole grid in one night instead of one cell a day.
 * The cap stops a bug from chaining forever.
 */
const MAX_CHAIN_DEPTH = 30;

const DEFAULT_CITY = "tegucigalpa";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Without a secret configured, only allow local development.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization")?.trim();
  return header === `Bearer ${secret}`;
}

function baseUrl(request: NextRequest): string {
  const configured = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return request.nextUrl.origin;
}

async function chainNextSlice(request: NextRequest, citySlug: string, depth: number): Promise<void> {
  const url = new URL("/api/cron/crawl", baseUrl(request));
  url.searchParams.set("city", citySlug);
  url.searchParams.set("depth", String(depth));

  const headers: Record<string, string> = {};
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) headers.authorization = `Bearer ${secret}`;

  try {
    await fetch(url, { headers, cache: "no-store" });
  } catch (error) {
    // The run stays resumable in the database, so a broken chain only delays it
    // until the next nightly cron.
    console.error(`[cron] failed to chain slice ${depth}: ${(error as Error).message}`);
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const citySlug = request.nextUrl.searchParams.get("city") ?? DEFAULT_CITY;
  const depth = Number(request.nextUrl.searchParams.get("depth") ?? "0");

  try {
    const result = await runCrawlSlice({
      citySlug,
      trigger: "cron",
      budgetMs: SLICE_BUDGET_MS,
      onProgress: (message) => console.log(`[crawl ${citySlug} d${depth}] ${message}`),
    });

    const willChain = !result.finished && result.outstanding > 0 && depth < MAX_CHAIN_DEPTH;
    if (willChain) {
      after(() => chainNextSlice(request, citySlug, depth + 1));
    }

    return NextResponse.json({ city: citySlug, depth, chained: willChain, ...result });
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    console.error(`[cron] crawl slice failed: ${message}`);
    return NextResponse.json({ error: message, city: citySlug, depth }, { status: 500 });
  }
}
