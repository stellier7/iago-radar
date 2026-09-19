export type SetupProblem = {
  title: string;
  detail: string;
  steps: string[];
};

/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = "42P01";

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const MISSING_DATABASE_URL: SetupProblem = {
  title: "No database configured yet",
  detail: "DATABASE_URL is not set, so there is nothing to read businesses from.",
  steps: [
    "Create a free Neon or Vercel Postgres database.",
    "Set DATABASE_URL in Vercel (use the pooled connection string), plus CRON_SECRET and OSM_CONTACT.",
    "Redeploy. The build applies the migrations for you.",
  ],
};

const NOT_MIGRATED: SetupProblem = {
  title: "Database is reachable but empty",
  detail: "The tables do not exist yet, so the migrations have not run against this database.",
  steps: [
    "Redeploy, which runs the migrations during the build.",
    "Or run them yourself: DATABASE_URL=… npm run db:migrate",
  ],
};

function classify(error: unknown): SetupProblem | null {
  const code = (error as { code?: string }).code;
  if (code === UNDEFINED_TABLE) return NOT_MIGRATED;

  const message = (error as Error)?.message ?? "";
  if (message.includes("DATABASE_URL is not set")) return MISSING_DATABASE_URL;

  // Anything else is a genuine fault, not a setup step.
  return null;
}

export type LoadResult<T> = { ok: true; data: T } | { ok: false; problem: SetupProblem };

/**
 * Runs a page's queries, turning the two predictable first-deploy failures into
 * instructions instead of a stack trace. Real errors still propagate.
 */
export async function loadOrExplainSetup<T>(load: () => Promise<T>): Promise<LoadResult<T>> {
  if (!isDatabaseConfigured()) return { ok: false, problem: MISSING_DATABASE_URL };

  try {
    return { ok: true, data: await load() };
  } catch (error) {
    const problem = classify(error);
    if (problem) return { ok: false, problem };
    throw error;
  }
}
