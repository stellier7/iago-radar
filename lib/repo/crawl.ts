import { getPool, query, queryOne } from "../db";
import type { GridCell } from "../geo/grid";

/** A cell that keeps failing is skipped rather than blocking the run forever. */
export const MAX_CELL_ATTEMPTS = 3;

export type CrawlRun = {
  id: number;
  cityId: number;
  status: "running" | "completed" | "failed";
  trigger: "cron" | "manual";
  cellSizeKm: number;
  cellsTotal: number;
  elementsSeen: number;
  businessesUpserted: number;
  overpassRequests: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type RunRow = {
  id: string;
  city_id: number;
  status: CrawlRun["status"];
  trigger: CrawlRun["trigger"];
  cell_size_km: number;
  cells_total: number;
  elements_seen: number;
  businesses_upserted: number;
  overpass_requests: number;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
};

function toRun(row: RunRow): CrawlRun {
  return {
    id: Number(row.id),
    cityId: row.city_id,
    status: row.status,
    trigger: row.trigger,
    cellSizeKm: row.cell_size_km,
    cellsTotal: row.cells_total,
    elementsSeen: row.elements_seen,
    businessesUpserted: row.businesses_upserted,
    overpassRequests: row.overpass_requests,
    error: row.error,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

const SELECT_RUN = `
  select id, city_id, status, trigger, cell_size_km, cells_total, elements_seen,
         businesses_upserted, overpass_requests, error, started_at, finished_at
  from crawl_runs
`;

export async function findRunningRun(cityId: number): Promise<CrawlRun | null> {
  const row = await queryOne<RunRow>(
    `${SELECT_RUN} where city_id = $1 and status = 'running' order by started_at desc limit 1`,
    [cityId],
  );
  return row ? toRun(row) : null;
}

export async function getRun(runId: number): Promise<CrawlRun | null> {
  const row = await queryOne<RunRow>(`${SELECT_RUN} where id = $1`, [runId]);
  return row ? toRun(row) : null;
}

export async function listRecentRuns(cityId: number, limit = 10): Promise<CrawlRun[]> {
  const rows = await query<RunRow>(`${SELECT_RUN} where city_id = $1 order by started_at desc limit $2`, [
    cityId,
    limit,
  ]);
  return rows.map(toRun);
}

/** Creates a run and enqueues one cell per Overpass request the crawl will make. */
export async function createRun(input: {
  cityId: number;
  trigger: "cron" | "manual";
  cellSizeKm: number;
  cells: GridCell[];
}): Promise<CrawlRun> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const runResult = await client.query<RunRow>(
      `
      insert into crawl_runs (city_id, status, trigger, cell_size_km, cells_total)
      values ($1, 'running', $2, $3, $4)
      returning id, city_id, status, trigger, cell_size_km, cells_total, elements_seen,
                businesses_upserted, overpass_requests, error, started_at, finished_at
      `,
      [input.cityId, input.trigger, input.cellSizeKm, input.cells.length],
    );
    const run = toRun(runResult.rows[0]!);

    const params: unknown[] = [];
    const tuples = input.cells.map((cell) => {
      const values = [run.id, cell.idx, cell.minLat, cell.minLon, cell.maxLat, cell.maxLon];
      const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
      params.push(...values);
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `insert into crawl_cells (run_id, idx, min_lat, min_lon, max_lat, max_lon) values ${tuples.join(", ")}`,
      params,
    );

    await client.query("commit");
    return run;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type ClaimedCell = {
  id: number;
  idx: number;
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  attempts: number;
};

/**
 * Atomically takes the next outstanding cell. `skip locked` means two
 * overlapping invocations (a cron chain racing a manual run) divide the work
 * instead of duplicating it.
 */
export async function claimNextCell(runId: number): Promise<ClaimedCell | null> {
  const row = await queryOne<{
    id: string;
    idx: number;
    min_lat: number;
    min_lon: number;
    max_lat: number;
    max_lon: number;
    attempts: number;
  }>(
    `
    update crawl_cells set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (
      select id from crawl_cells
      where run_id = $1
        and (status = 'pending' or (status = 'failed' and attempts < $2))
      order by (status = 'failed'), idx
      limit 1
      for update skip locked
    )
    returning id, idx, min_lat, min_lon, max_lat, max_lon, attempts
    `,
    [runId, MAX_CELL_ATTEMPTS],
  );

  if (!row) return null;
  return {
    id: Number(row.id),
    idx: row.idx,
    minLat: row.min_lat,
    minLon: row.min_lon,
    maxLat: row.max_lat,
    maxLon: row.max_lon,
    attempts: row.attempts,
  };
}

export async function completeCell(input: {
  cellId: number;
  runId: number;
  elementCount: number;
  upserted: number;
  durationMs: number;
}): Promise<void> {
  await query(
    `update crawl_cells
       set status = 'done', element_count = $2, duration_ms = $3, error = null, updated_at = now()
     where id = $1`,
    [input.cellId, input.elementCount, input.durationMs],
  );
  await query(
    `update crawl_runs
       set elements_seen = elements_seen + $2,
           businesses_upserted = businesses_upserted + $3,
           overpass_requests = overpass_requests + 1
     where id = $1`,
    [input.runId, input.elementCount, input.upserted],
  );
}

export async function failCell(cellId: number, runId: number, error: string): Promise<void> {
  await query(
    `update crawl_cells set status = 'failed', error = $2, updated_at = now() where id = $1`,
    [cellId, error.slice(0, 1000)],
  );
  await query("update crawl_runs set overpass_requests = overpass_requests + 1 where id = $1", [runId]);
}

export type RunProgress = {
  total: number;
  done: number;
  failed: number;
  outstanding: number;
};

export async function getRunProgress(runId: number): Promise<RunProgress> {
  const row = await queryOne<{ total: string; done: string; failed: string; outstanding: string }>(
    `
    select count(*) as total,
           count(*) filter (where status = 'done') as done,
           count(*) filter (where status = 'failed' and attempts >= $2) as failed,
           count(*) filter (where status in ('pending', 'running')
                              or (status = 'failed' and attempts < $2)) as outstanding
    from crawl_cells
    where run_id = $1
    `,
    [runId, MAX_CELL_ATTEMPTS],
  );
  return {
    total: Number(row!.total),
    done: Number(row!.done),
    failed: Number(row!.failed),
    outstanding: Number(row!.outstanding),
  };
}

export async function finishRun(runId: number, progress: RunProgress): Promise<void> {
  const error = progress.failed > 0 ? `${progress.failed} of ${progress.total} cells failed after retries` : null;
  await query(
    `update crawl_runs
       set status = case when $3::int = $2::int then 'failed' else 'completed' end,
           finished_at = now(),
           error = $4
     where id = $1`,
    [runId, progress.total, progress.failed, error],
  );
}

export type FailedCell = {
  idx: number;
  attempts: number;
  error: string | null;
};

export async function listFailedCells(runId: number, limit = 10): Promise<FailedCell[]> {
  return query<FailedCell>(
    `select idx, attempts, error from crawl_cells
     where run_id = $1 and status = 'failed' order by idx limit $2`,
    [runId, limit],
  );
}

/**
 * Releases cells left mid-flight by a slice that timed out or crashed.
 *
 * The default window is comfortably longer than the crawler's per-cell deadline,
 * so a cell another slice is legitimately working on is never stolen.
 */
export async function requeueStaleCells(runId: number, staleAfterMs = 90_000): Promise<number> {
  const rows = await query<{ id: string }>(
    `update crawl_cells
       set status = 'pending', updated_at = now()
     where run_id = $1 and status = 'running' and updated_at < now() - ($2::int * interval '1 millisecond')
     returning id`,
    [runId, staleAfterMs],
  );
  return rows.length;
}
