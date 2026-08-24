/**
 * Ingestion CLI.
 *
 *   npm run ingest                      # every enabled job
 *   npm run ingest police-press-logs    # one job
 *   npm run ingest -- --limit 30        # deepen the press log backfill
 *   npm run ingest -- --force           # reparse even unchanged pages
 *   npm run ingest civicclerk-meetings -- --days 2200   # deepen meeting history
 */

import "./env";

import { pool } from "../lib/db";
import { ingestMeetings } from "./jobs/meetings";
import { ingestCityCode } from "./jobs/cityCode";
import { ingestCityNews } from "./jobs/cityNews";
import { ingestMinutes } from "./jobs/minutes";
import { ingestPackets } from "./jobs/packets";
import { ingestPressLogs } from "./jobs/pressLogs";
import { ingestProperty } from "./jobs/property";

interface JobDefinition {
  name: string;
  description: string;
  run: (options: { limit?: number; force?: boolean; days?: number }) => Promise<void>;
}

const JOBS: JobDefinition[] = [
  {
    name: "police-press-logs",
    description: "Moscow PD daily press logs",
    run: (options) => ingestPressLogs(options),
  },
  {
    name: "civicclerk-meetings",
    description: "City of Moscow public meetings",
    run: (options) => ingestMeetings({ pastDays: options.days }),
  },
  {
    name: "agenda-packets",
    description: "Spending read from the packets bound behind each agenda",
    run: (options) => ingestPackets(options),
  },
  {
    name: "meeting-minutes",
    description: "Outcomes parsed from published meeting minutes",
    run: (options) => ingestMinutes(options),
  },
  {
    name: "city-news",
    description: "City announcements and calendar feeds",
    run: () => ingestCityNews(),
  },
  {
    name: "latah-gis",
    description: "Zoning districts and land use applications",
    run: () => ingestProperty(),
  },
  {
    name: "city-code",
    description: "Moscow city code chapters and their diffs",
    run: (options) => ingestCityCode(options),
  },
];

function parseArgs(argv: string[]) {
  const names: string[] = [];
  let limit: number | undefined;
  let days: number | undefined;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) limit = value;
    } else if (arg === "--days") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) days = value;
    } else if (arg === "--force") {
      force = true;
    } else if (!arg.startsWith("-")) {
      names.push(arg);
    }
  }

  return { names, limit, days, force };
}

async function main(): Promise<void> {
  const { names, limit, days, force } = parseArgs(process.argv.slice(2));

  const selected = names.length > 0
    ? JOBS.filter((job) => names.includes(job.name))
    : JOBS;

  if (selected.length === 0) {
    console.error("No matching job. Available jobs:");
    for (const job of JOBS) console.error("  " + job.name + " -- " + job.description);
    process.exitCode = 1;
    return;
  }

  let failed = false;

  for (const job of selected) {
    console.log("\n=== " + job.name + " (" + job.description + ") ===");
    try {
      await job.run({ limit, force, days });
    } catch (error) {
      failed = true;
      console.error("FAILED: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  await pool().end();
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
