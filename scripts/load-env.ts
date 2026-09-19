import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

/**
 * Loads .env.local then .env, matching the precedence Next.js uses, so CLI
 * scripts and the app read the same configuration.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, quiet: true });
    }
  }
}
