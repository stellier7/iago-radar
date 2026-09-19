import { loadEnv } from "./load-env";

loadEnv();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Drains a city's crawl queue locally, with no serverless time limit. This is
 * the intended way to do the first full pass and to re-validate data quality.
 *
 *   npm run crawl                          # all of Tegucigalpa
 *   npm run crawl -- --max-cells=3         # smoke test, 3 grid cells
 *   npm run crawl -- --city=comayagua
 */
async function main() {
  const { runCrawlSlice } = await import("../lib/crawl/runner");
  const { getPool } = await import("../lib/db");

  const citySlug = arg("city") ?? "tegucigalpa";
  const maxCells = arg("max-cells") ? Number(arg("max-cells")) : undefined;
  const budgetMs = Number(arg("budget-seconds") ?? 60 * 60) * 1000;

  console.log(`Crawling ${citySlug}${maxCells ? ` (max ${maxCells} cells)` : ""}...`);
  const started = Date.now();

  const result = await runCrawlSlice({
    citySlug,
    trigger: "manual",
    budgetMs,
    maxCells,
    onProgress: (message) => console.log(`  ${message}`),
  });

  console.log("");
  console.log(`Run ${result.runId} - ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  cells processed : ${result.cellsProcessed}`);
  console.log(`  cells failed    : ${result.cellsFailed}`);
  console.log(`  elements seen   : ${result.elementsSeen}`);
  console.log(`  rows written    : ${result.businessesUpserted}`);
  console.log(`  outstanding     : ${result.outstanding}`);
  console.log(result.finished ? "  status          : run complete" : "  status          : run still has cells queued");

  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
