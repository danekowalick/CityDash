/**
 * Ingests meeting outcomes from published minutes PDFs.
 *
 * Runs after the meetings job, over meetings that have a minutes_url. Each
 * PDF is hashed; unchanged minutes are skipped. Text is extracted, motions
 * and agenda items are parsed, and both are stored.
 *
 * Minutes that turn out to be scans with no text layer are recorded as such
 * rather than silently producing a meeting with no decisions.
 */

import { politeFetchBytes } from "../../lib/fetcher";
import { query, transaction } from "../../lib/db";
import { extractPdfText, looksLikePdf } from "../../lib/pdf";
import { parseCodeReferences, parseMinutes, type ParsedMinutes } from "../../lib/parsers/minutes";
import { finishRun, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "meeting-minutes";

export interface MinutesJobOptions {
  limit?: number;
  force?: boolean;
}

interface PendingMeeting {
  id: number;
  body: string;
  starts_at: Date;
  minutes_url: string;
  stored_hash: string | null;
}

/**
 * Meetings whose minutes we could read, most valuable first.
 *
 * With several years of history there are ~900 minutes PDFs, and a partial
 * run should still land the ones that matter. Priority order:
 *
 *   1. Meetings that adopted an ordinance (their date matches an ordinance's
 *      adoption date) -- these complete a decision chain from vote to code.
 *   2. City Council, where ordinances are passed.
 *   3. Everything else, newest first.
 */
async function pendingMeetings(limit: number): Promise<PendingMeeting[]> {
  return query<PendingMeeting>(
    `SELECT m.id, m.body, m.starts_at, m.minutes_url, mm.content_hash AS stored_hash
       FROM meetings m
       LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id
      WHERE m.minutes_url IS NOT NULL
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM ordinances o WHERE o.adopted_on = m.starts_at::date
        ) THEN 0 ELSE 1 END,
        CASE WHEN m.body = 'City Council' THEN 0 ELSE 1 END,
        m.starts_at DESC
      LIMIT $1`,
    [limit],
  );
}

async function persist(
  meeting: PendingMeeting,
  parsed: ParsedMinutes,
  contentHash: string,
  pageCount: number,
  rawDocumentId: number,
): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO meeting_minutes
         (meeting_id, minutes_url, content_hash, text, page_count, is_scanned,
          motion_count, raw_document_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (meeting_id) DO UPDATE SET
         minutes_url = EXCLUDED.minutes_url,
         content_hash = EXCLUDED.content_hash,
         text = EXCLUDED.text,
         page_count = EXCLUDED.page_count,
         is_scanned = EXCLUDED.is_scanned,
         motion_count = EXCLUDED.motion_count,
         raw_document_id = EXCLUDED.raw_document_id,
         captured_at = now()`,
      [
        meeting.id,
        meeting.minutes_url,
        contentHash,
        parsed.text || null,
        pageCount,
        parsed.isScanned,
        parsed.motions.length,
        rawDocumentId,
      ],
    );

    // Re-parsing replaces the previous reading of this document rather than
    // accumulating duplicates alongside it.
    await client.query(`DELETE FROM motions WHERE meeting_id = $1`, [meeting.id]);
    await client.query(`DELETE FROM agenda_items WHERE meeting_id = $1`, [meeting.id]);

    for (const motion of parsed.motions) {
      await client.query(
        `INSERT INTO motions
           (meeting_id, sequence, mover, seconder, action, outcome,
            ayes_raw, nays_raw, abstentions_raw, aye_count, nay_count, unanimous)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          meeting.id,
          motion.sequence,
          motion.mover,
          motion.seconder,
          motion.action,
          motion.outcome,
          motion.vote?.ayesRaw ?? null,
          motion.vote?.naysRaw ?? null,
          motion.vote?.abstentionsRaw ?? null,
          motion.vote?.ayeCount ?? null,
          motion.vote?.nayCount ?? null,
          motion.vote?.unanimous ?? false,
        ],
      );
    }

    // Chapters the minutes say this meeting amended. This is the link from
    // a decision to the law it changed.
    await client.query(`DELETE FROM meeting_code_references WHERE meeting_id = $1`, [meeting.id]);
    for (const reference of parseCodeReferences(parsed.text)) {
      await client.query(
        `INSERT INTO meeting_code_references (meeting_id, chapter_slug)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [meeting.id, reference.slug],
      );
    }

    for (const item of parsed.agendaItems) {
      await client.query(
        `INSERT INTO agenda_items (meeting_id, number, title, kind)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (meeting_id, number) DO UPDATE SET
           title = EXCLUDED.title, kind = EXCLUDED.kind`,
        [meeting.id, item.number, item.title, item.kind],
      );
    }
  });
}

export async function ingestMinutes(options: MinutesJobOptions = {}): Promise<void> {
  const limit = options.limit ?? 60;
  const runId = await startRun(SOURCE_ID);

  let itemsSeen = 0;
  let itemsNew = 0;
  let scanned = 0;
  let motionsFound = 0;

  try {
    const meetings = await pendingMeetings(limit);
    console.log("Considering " + meetings.length + " meetings with published minutes.");

    for (const meeting of meetings) {
      itemsSeen++;

      let pdf;
      try {
        pdf = await politeFetchBytes(meeting.minutes_url);
      } catch (error) {
        console.warn("  fetch failed for meeting " + meeting.id + ": " + String(error).slice(0, 100));
        continue;
      }

      if (!looksLikePdf(pdf.bytes)) {
        console.warn("  not a PDF: meeting " + meeting.id);
        continue;
      }

      if (!options.force && meeting.stored_hash === pdf.contentHash) continue;

      let extracted;
      try {
        extracted = await extractPdfText(pdf.bytes);
      } catch (error) {
        console.warn("  extraction failed for meeting " + meeting.id + ": " + String(error).slice(0, 100));
        continue;
      }

      const parsed = parseMinutes(extracted.pages);

      const rawDocumentId = await storeRawDocument(SOURCE_ID, {
        url: meeting.minutes_url,
        status: pdf.status,
        body: parsed.text,
        contentType: pdf.contentType,
        contentHash: pdf.contentHash,
      });

      await persist(meeting, parsed, pdf.contentHash, extracted.pageCount, rawDocumentId);

      itemsNew++;
      motionsFound += parsed.motions.length;

      const label = meeting.body + " " + meeting.starts_at.toISOString().slice(0, 10);
      if (parsed.isScanned) {
        scanned++;
        console.log("  SCANNED (no text layer): " + label);
      } else {
        const carried = parsed.motions.filter((m) => m.outcome === "carried").length;
        console.log(
          "  " + label + ": " + parsed.motions.length + " motions (" + carried +
            " carried), " + parsed.agendaItems.length + " agenda items",
        );
      }
    }

    console.log(
      "Done: " + itemsNew + " minutes processed, " + motionsFound + " motions, " +
        scanned + " scanned and unreadable.",
    );
    await finishRun(runId, "ok", { itemsSeen, itemsNew });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen, itemsNew, error: message });
    throw error;
  }
}
