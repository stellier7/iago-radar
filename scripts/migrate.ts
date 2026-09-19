import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { loadEnv } from "./load-env";

loadEnv();

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

async function main() {
  const { getPool } = await import("../lib/db");
  const pool = getPool();

  await pool.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await pool.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`✓ ${file}`);
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migrations up to date.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
