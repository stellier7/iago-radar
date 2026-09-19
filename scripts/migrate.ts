import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { loadEnv } from "./load-env";

loadEnv();

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/**
 * Arbitrary constant key for the Postgres advisory lock. Two deploys building at
 * once must not apply the same migration twice.
 */
const MIGRATION_LOCK_KEY = 8_527_301;

async function main() {
  // The Vercel build runs this with --if-configured so a project without a
  // database yet still deploys; the app then shows a setup screen instead.
  if (process.argv.includes("--if-configured") && !process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set - skipping migrations.");
    return;
  }

  const { getPool } = await import("../lib/db");
  const pool = getPool();

  const lock = await pool.connect();
  try {
    await lock.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    await lock.query(`
      create table if not exists schema_migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set(
      (await lock.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
    );

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`- ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await lock.query("begin");
        await lock.query(sql);
        await lock.query("insert into schema_migrations (name) values ($1)", [file]);
        await lock.query("commit");
        console.log(`✓ ${file}`);
      } catch (error) {
        await lock.query("rollback").catch(() => {});
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }

    console.log("Migrations up to date.");
  } finally {
    await lock.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    lock.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
