"use client";

import Link from "next/link";
import { useActionState } from "react";

import { addCityAction, type AddCityActionResult } from "@/app/cities/actions";

export default function AddCityPage() {
  const [result, action, pending] = useActionState<AddCityActionResult | null, FormData>(addCityAction, null);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h2 className="text-base font-semibold">Add location</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Looks up the place on OpenStreetMap (Nominatim), stores a crawlable bounding box, and switches you to it.
          Oversized municipality boundaries are shrunk to an urban square so the crawl stays practical.
        </p>
      </div>

      <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">City or town</span>
          <input
            name="name"
            required
            autoComplete="address-level2"
            placeholder="Comayagua"
            className="tap-target w-full rounded-lg border border-line bg-canvas px-3 text-base"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Country</span>
          <input
            name="country"
            defaultValue="Honduras"
            autoComplete="country-name"
            className="tap-target w-full rounded-lg border border-line bg-canvas px-3 text-base"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="tap-target w-full rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-60"
        >
          {pending ? "Looking up…" : "Add location"}
        </button>
        {result?.error && <p className="text-sm text-flag-ink">{result.error}</p>}
      </form>

      <p className="text-sm text-ink-muted">
        <Link href="/" className="underline">
          Cancel
        </Link>
        {" · "}
        After adding, open <strong>Crawl</strong> and tap &ldquo;Crawl 5 more cells now&rdquo; (or wait for the nightly
        cron) to fill prospects.
      </p>
    </div>
  );
}
