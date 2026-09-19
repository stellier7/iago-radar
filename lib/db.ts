import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

/** Anything we can run SQL on: the shared pool, or a client inside a transaction. */
export type Queryable = {
  query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

declare global {
  var __iagoRadarPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

  return new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    // Serverless functions are short-lived and Neon's free tier has a modest
    // connection ceiling, so keep the per-instance pool tiny.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  if (!globalThis.__iagoRadarPool) {
    globalThis.__iagoRadarPool = createPool();
  }
  return globalThis.__iagoRadarPool;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
