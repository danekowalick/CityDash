/**
 * Ingests Moscow Police Department daily press logs.
 *
 * Two steps: read the News Flash category listing to discover which daily
 * logs exist, then fetch each one we have not already stored and parse it
 * into incidents.
 */

import { politeFetch } from "../../lib/fetcher";
import { transaction } from "../../lib/db";
import {
  parsePressLogList,
  parsePressLogPage,
  type ParsedIncident,
} from "../../lib/parsers/pressLog";
import { finishRun, hasSeenVersion, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "mpd-press-logs";
const LIST_URL = "https://www.ci.moscow.id.us/m/newsflash?cat=23";
const BASE_URL = "https://www.ci.moscow.id.us";

export interface PressLogJobOptions {
  /** Cap on how many daily logs to fetch in one run. */
  limit?: number;
  /** Re-fetch and reparse logs already stored. */
  force?: boolean;
}

async function persistLog(
  detailId: number,
  title: string,
  logDate: string,
  url: string,
  incidents: ParsedIncident[],
  missingCaseNumbers: string[],
  rawDocumentId: number,
): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO press_logs
         (detail_id, log_date, title, source_url, incident_count, case_gaps, raw_document_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (detail_id) DO UPDATE SET
         log_date = EXCLUDED.log_date,
         title = EXCLUDED.title,
         source_url = EXCLUDED.source_url,
         incident_count = EXCLUDED.incident_count,
         case_gaps = EXCLUDED.case_gaps,
         raw_document_id = EXCLUDED.raw_document_id,
         ingested_at = now()`,
      [
        detailId,
        logDate,
        title,
        url,
        incidents.length,
        missingCaseNumbers.length,
        rawDocumentId,
      ],
    );

    for (const incident of incidents) {
      await client.query(
        `INSERT INTO incidents
           (case_number, log_date, incident_type, block_address, city_line,
            disposition, time_reported, cad_comments, source_url, raw_document_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (case_number) DO UPDATE SET
           log_date = EXCLUDED.log_date,
           incident_type = EXCLUDED.incident_type,
           block_address = EXCLUDED.block_address,
           city_line = EXCLUDED.city_line,
           disposition = EXCLUDED.disposition,
           time_reported = EXCLUDED.time_reported,
           cad_comments = EXCLUDED.cad_comments,
           source_url = EXCLUDED.source_url,
           raw_document_id = EXCLUDED.raw_document_id`,
        [
          incident.caseNumber,
          logDate,
          incident.incidentType,
          incident.blockAddress,
          incident.cityLine,
          incident.disposition,
          incident.timeReported,
          incident.cadComments,
          url,
          rawDocumentId,
        ],
      );
    }
  });
}

export async function ingestPressLogs(options: PressLogJobOptions = {}): Promise<void> {
  const limit = options.limit ?? 10;
  const runId = await startRun(SOURCE_ID);

  let itemsSeen = 0;
  let itemsNew = 0;

  try {
    const listing = await politeFetch(LIST_URL);
    await storeRawDocument(SOURCE_ID, listing);

    const entries = parsePressLogList(listing.body, BASE_URL)
      .filter((entry) => entry.logDate !== null)
      .slice(0, limit);

    console.log("Found " + entries.length + " press logs to consider.");

    for (const entry of entries) {
      itemsSeen++;
      const page = await politeFetch(entry.url);

      if (!options.force && (await hasSeenVersion(page.url, page.contentHash))) {
        console.log("  unchanged: " + entry.title);
        continue;
      }

      const rawDocumentId = await storeRawDocument(SOURCE_ID, page);
      const parsed = parsePressLogPage(page.body);

      if (parsed.incidents.length === 0) {
        console.warn("  no incidents parsed from " + entry.url + " -- check the parser");
        continue;
      }

      await persistLog(
        entry.detailId,
        parsed.title ?? entry.title,
        parsed.logDate ?? entry.logDate!,
        entry.url,
        parsed.incidents,
        parsed.missingCaseNumbers,
        rawDocumentId,
      );

      itemsNew++;
      const gapNote =
        parsed.missingCaseNumbers.length > 0
          ? "  (" + parsed.missingCaseNumbers.length + " case gaps)"
          : "";
      console.log(
        "  stored " + entry.title + ": " + parsed.incidents.length + " incidents" + gapNote,
      );
    }

    await finishRun(runId, "ok", { itemsSeen, itemsNew });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen, itemsNew, error: message });
    throw error;
  }
}
