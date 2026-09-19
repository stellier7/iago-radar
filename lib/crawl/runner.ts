import { splitIntoCells } from "../geo/grid";
import { dedupeByOsmId, normalizeElement } from "../osm/normalize";
import { fetchBusinesses, OVERPASS_TIMEOUT_SECONDS } from "../osm/overpass";
import { upsertBusinesses, type BusinessWithZone } from "../repo/businesses";
import { cityBbox, getCityBySlug, type City } from "../repo/cities";
import {
  claimNextCell,
  completeCell,
  createRun,
  failCell,
  findRunningRun,
  finishRun,
  getRunProgress,
  requeueStaleCells,
  type CrawlRun,
} from "../repo/crawl";
import { createZoneResolver } from "../repo/zones";
import { getPool } from "../db";
import { deriveZone } from "../zones/derive";

export type CrawlSliceOptions = {
  citySlug: string;
  trigger: "cron" | "manual";
  /** Wall-clock budget for this slice. Cron passes the function's limit minus headroom. */
  budgetMs: number;
  /** Extra ceiling on Overpass requests, mostly for dry runs. */
  maxCells?: number;
  onProgress?: (message: string) => void;
};

export type CrawlSliceResult = {
  runId: number;
  cellsProcessed: number;
  cellsFailed: number;
  elementsSeen: number;
  businessesUpserted: number;
  outstanding: number;
  finished: boolean;
};

/**
 * How long one cell may spend across all of its attempts and backoffs. A cell
 * that cannot be answered in this window is left `failed` and retried by a later
 * slice, rather than consuming the whole budget.
 */
const CELL_DEADLINE_MS = 40_000;

/** Single HTTP request ceiling. A healthy 4 km² cell answers in 1-3 seconds. */
const PER_REQUEST_TIMEOUT_MS = 20_000;

const MIN_TIME_FOR_ANOTHER_CELL_MS = 6_000;

async function getOrCreateRun(city: City, trigger: "cron" | "manual"): Promise<CrawlRun> {
  const existing = await findRunningRun(city.id);
  if (existing) {
    // A previous slice may have died with cells marked `running`.
    await requeueStaleCells(existing.id);
    const progress = await getRunProgress(existing.id);
    if (progress.outstanding > 0) return existing;
    await finishRun(existing.id, progress);
  }

  const cells = splitIntoCells(cityBbox(city), city.cellSizeKm);
  return createRun({ cityId: city.id, trigger, cellSizeKm: city.cellSizeKm, cells });
}

/**
 * Processes as many grid cells as fit in the budget, then returns. Progress
 * lives in the database, so the next invocation resumes where this one stopped.
 */
export async function runCrawlSlice(options: CrawlSliceOptions): Promise<CrawlSliceResult> {
  const startedAt = Date.now();
  const log = options.onProgress ?? (() => {});

  const city = await getCityBySlug(options.citySlug);
  if (!city) throw new Error(`Unknown city: ${options.citySlug}`);

  const run = await getOrCreateRun(city, options.trigger);
  const zoneConfig = { ...cityBbox(city), zoneSizeKm: city.zoneSizeKm };

  const result: CrawlSliceResult = {
    runId: run.id,
    cellsProcessed: 0,
    cellsFailed: 0,
    elementsSeen: 0,
    businessesUpserted: 0,
    outstanding: 0,
    finished: false,
  };

  let observedCellMs = 4_000;

  while (true) {
    const elapsed = Date.now() - startedAt;
    const remaining = options.budgetMs - elapsed;
    const needed = Math.max(MIN_TIME_FOR_ANOTHER_CELL_MS, observedCellMs * 1.5);
    if (remaining < needed) {
      log(`Budget nearly spent (${remaining}ms left, need ~${Math.round(needed)}ms); stopping this slice.`);
      break;
    }
    if (options.maxCells !== undefined && result.cellsProcessed >= options.maxCells) {
      log(`Reached maxCells=${options.maxCells}; stopping this slice.`);
      break;
    }

    const cell = await claimNextCell(run.id);
    if (!cell) break;

    const cellStartedAt = Date.now();
    try {
      const elements = await fetchBusinesses(cell, {
        perRequestTimeoutMs: PER_REQUEST_TIMEOUT_MS,
        // Never overrun the slice budget, even if the cell deadline is longer.
        deadlineAt: Math.min(cellStartedAt + CELL_DEADLINE_MS, startedAt + options.budgetMs),
      });
      const normalized = dedupeByOsmId(elements.map(normalizeElement).filter((b) => b !== null));

      let upserted = 0;
      if (normalized.length > 0) {
        const client = await getPool().connect();
        try {
          await client.query("begin");
          const resolveZone = createZoneResolver(client, city.id);
          const withZones: BusinessWithZone[] = [];
          for (const business of normalized) {
            withZones.push({ ...business, zoneId: await resolveZone(deriveZone(business, zoneConfig)) });
          }
          upserted = await upsertBusinesses(client, city.id, withZones);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback").catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      }

      const durationMs = Date.now() - cellStartedAt;
      observedCellMs = Math.max(observedCellMs * 0.5, durationMs);
      await completeCell({
        cellId: cell.id,
        runId: run.id,
        elementCount: elements.length,
        upserted,
        durationMs,
      });

      result.cellsProcessed += 1;
      result.elementsSeen += elements.length;
      result.businessesUpserted += upserted;
      log(
        `cell ${cell.idx}: ${elements.length} elements -> ${normalized.length} businesses ` +
          `(${upserted} written) in ${durationMs}ms`,
      );
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      await failCell(cell.id, run.id, message);
      result.cellsFailed += 1;
      log(`cell ${cell.idx} failed (attempt ${cell.attempts}): ${message}`);
    }
  }

  const progress = await getRunProgress(run.id);
  result.outstanding = progress.outstanding;
  if (progress.outstanding === 0) {
    await finishRun(run.id, progress);
    result.finished = true;
    log(`Run ${run.id} finished: ${progress.done}/${progress.total} cells done, ${progress.failed} failed.`);
  } else {
    log(`Run ${run.id}: ${progress.done}/${progress.total} cells done, ${progress.outstanding} still outstanding.`);
  }

  return result;
}

/** Surfaced in the UI so the Overpass timeout we ask for is never a mystery. */
export const CRAWLER_OVERPASS_TIMEOUT_SECONDS = OVERPASS_TIMEOUT_SECONDS;
