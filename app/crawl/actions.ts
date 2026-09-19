"use server";

import { revalidatePath } from "next/cache";

import { runCrawlSlice } from "@/lib/crawl/runner";

export type CrawlActionResult = { message: string | null; error: string | null };

/**
 * Runs a short slice from the UI. Off unless ENABLE_MANUAL_CRAWL=1, so a
 * publicly reachable deployment cannot be used to hammer Overpass. The normal
 * paths are the nightly cron and `npm run crawl` locally.
 */
export async function runSliceAction(
  _previous: CrawlActionResult | null,
  formData: FormData,
): Promise<CrawlActionResult> {
  if (process.env.ENABLE_MANUAL_CRAWL !== "1") {
    return { message: null, error: "Manual crawling is disabled. Set ENABLE_MANUAL_CRAWL=1 to enable it." };
  }

  const citySlug = String(formData.get("city") ?? "tegucigalpa");

  try {
    const result = await runCrawlSlice({
      citySlug,
      trigger: "manual",
      // Well inside Vercel's Hobby function limit.
      budgetMs: 25_000,
      maxCells: 5,
    });
    revalidatePath("/crawl");
    revalidatePath("/");
    return {
      message:
        `Run ${result.runId}: ${result.cellsProcessed} cells, ${result.businessesUpserted} rows written, ` +
        `${result.outstanding} cells still queued.`,
      error: null,
    };
  } catch (error) {
    return { message: null, error: (error as Error).message };
  }
}
