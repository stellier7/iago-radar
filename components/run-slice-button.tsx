"use client";

import { useActionState } from "react";

import { runSliceAction, type CrawlActionResult } from "@/app/crawl/actions";

export function RunSliceButton({ citySlug }: { citySlug: string }) {
  const [result, run, running] = useActionState<CrawlActionResult | null, FormData>(runSliceAction, null);

  return (
    <form action={run} className="mt-3">
      <input type="hidden" name="city" value={citySlug} />
      <button
        type="submit"
        disabled={running}
        className="tap-target w-full rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-60"
      >
        {running ? "Crawling up to 5 cells…" : "Crawl 5 more cells now"}
      </button>
      {result?.message && <p className="mt-2 text-sm text-ink-muted">{result.message}</p>}
      {result?.error && <p className="mt-2 text-sm text-flag-ink">{result.error}</p>}
    </form>
  );
}
