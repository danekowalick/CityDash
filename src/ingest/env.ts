/**
 * Loads .env for CLI entrypoints. Next.js does this itself, so this is only
 * imported by the ingestion scripts. Import it before anything that reads
 * process.env.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

for (const name of [".env.local", ".env"]) {
  const path = join(process.cwd(), name);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

export {};
