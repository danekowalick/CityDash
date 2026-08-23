/**
 * Applies db/migrations/*.sql in filename order, then syncs the source
 * registry. Migrations are written to be re-runnable, so this is safe to
 * invoke on every deploy.
 */

import "./env";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { pool, transaction } from "../lib/db";
import { SOURCES } from "./sources";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

async function applyMigrations(): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await transaction(async (client) => {
      await client.query(sql);
    });
    console.log("  applied " + file);
  }
}

async function syncSources(): Promise<void> {
  await transaction(async (client) => {
    for (const source of SOURCES) {
      await client.query(
        `INSERT INTO sources (id, name, url, kind, cadence, publisher, terms_note, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           url = EXCLUDED.url,
           kind = EXCLUDED.kind,
           cadence = EXCLUDED.cadence,
           publisher = EXCLUDED.publisher,
           terms_note = EXCLUDED.terms_note,
           enabled = EXCLUDED.enabled`,
        [
          source.id,
          source.name,
          source.url,
          source.kind,
          source.cadence,
          source.publisher,
          source.termsNote,
          source.enabled,
        ],
      );
    }
  });
  console.log("  synced " + SOURCES.length + " sources");
}

async function main(): Promise<void> {
  console.log("Applying migrations...");
  await applyMigrations();
  console.log("Syncing source registry...");
  await syncSources();
  console.log("Done.");
  await pool().end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
