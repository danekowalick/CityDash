/**
 * Ingests public meetings from the CivicClerk OData API.
 *
 * Two things about this endpoint are easy to get wrong:
 *
 *  1. It hard-caps a page at 15 records no matter what $top asks for, and
 *     returns an "@odata.nextLink" continuation. A single request silently
 *     yields one page.
 *  2. Sorting descending surfaces recurring placeholder events scheduled
 *     years ahead, which carry no agendas at all. We walk forward from a
 *     start date instead, so real meetings with documents come first.
 */

import { politeFetchJson } from "../../lib/fetcher";
import { transaction } from "../../lib/db";
import {
  nextLink,
  normaliseEventsResponse,
  type NormalisedMeeting,
} from "../../lib/parsers/civicclerk";
import { finishRun, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "civicclerk-meetings";
const API_URL = "https://moscowid.api.civicclerk.com/v1/Events";

/** Safety stop so a pagination bug cannot walk the archive forever. */
const MAX_PAGES = 400;

export interface MeetingsJobOptions {
  /** How many days back to pull. */
  pastDays?: number;
  maxPages?: number;
}

/**
 * $top is a total budget decremented across continuations, not a page size,
 * so it caps the whole walk. It is also validated: the API answers 400 to
 * anything around 2000 and above. A long backfill therefore cannot be done
 * with one large budget -- the range is split into windows instead, each
 * walked with a budget comfortably inside the limit.
 */
const WINDOW_BUDGET = 400;
const WINDOW_DAYS = 365;

function windowUrl(fromIso: string, toIso: string): string {
  const url = new URL(API_URL);
  url.searchParams.set(
    "$filter",
    "startDateTime ge " + fromIso + " and startDateTime lt " + toIso,
  );
  url.searchParams.set("$orderby", "startDateTime asc");
  url.searchParams.set("$top", String(WINDOW_BUDGET));
  return url.toString();
}

/** The API stores naive local wall-clock values; send the same shape. */
function naiveIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Split [since, until] into windows the API will actually serve. */
function dateWindows(since: Date, until: Date): Array<[string, string]> {
  const windows: Array<[string, string]> = [];
  let cursor = new Date(since);

  while (cursor < until) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + WINDOW_DAYS);
    const end = next < until ? next : until;
    windows.push([naiveIso(cursor), naiveIso(end)]);
    cursor = end;
  }
  return windows;
}

async function persistMeetings(meetings: NormalisedMeeting[]): Promise<number> {
  let stored = 0;

  await transaction(async (client) => {
    for (const meeting of meetings) {
      await client.query(
        `INSERT INTO meetings
           (id, name, body, description, starts_at, location,
            agenda_url, minutes_url, youtube_id, is_published, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           body = EXCLUDED.body,
           description = EXCLUDED.description,
           starts_at = EXCLUDED.starts_at,
           location = EXCLUDED.location,
           agenda_url = EXCLUDED.agenda_url,
           minutes_url = EXCLUDED.minutes_url,
           youtube_id = EXCLUDED.youtube_id,
           is_published = EXCLUDED.is_published,
           source_url = EXCLUDED.source_url,
           ingested_at = now()`,
        [
          meeting.id,
          meeting.name,
          meeting.body,
          meeting.description,
          meeting.startsAt.toISOString(),
          meeting.location,
          meeting.agendaUrl,
          meeting.minutesUrl,
          meeting.youtubeId,
          meeting.isPublished,
          meeting.sourceUrl,
        ],
      );

      for (const doc of meeting.documents) {
        await client.query(
          `INSERT INTO meeting_documents (meeting_id, label, url, kind)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (meeting_id, url) DO UPDATE SET
             label = EXCLUDED.label,
             kind = EXCLUDED.kind`,
          [meeting.id, doc.label, doc.url, doc.kind],
        );
      }

      stored++;
    }
  });

  return stored;
}

export async function ingestMeetings(options: MeetingsJobOptions = {}): Promise<void> {
  const pastDays = options.pastDays ?? 180;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const runId = await startRun(SOURCE_ID);

  try {
    const since = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000);
    // Look a year ahead too: recurring meetings are scheduled well in advance.
    const until = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const collected: NormalisedMeeting[] = [];
    const seenIds = new Set<number>();
    let pages = 0;

    for (const [from, to] of dateWindows(since, until)) {
      let url: string | null = windowUrl(from, to);
      let windowCount = 0;

      while (url && pages < maxPages) {
        const { data, document } = await politeFetchJson(url);
        await storeRawDocument(SOURCE_ID, document);
        pages++;

        const batch = normaliseEventsResponse(data);
        if (batch.length === 0) break;

        for (const meeting of batch) {
          if (seenIds.has(meeting.id)) continue;
          seenIds.add(meeting.id);
          collected.push(meeting);
          windowCount++;
        }

        const following: string | null = nextLink(data);
        // A continuation that does not advance would loop forever.
        url = following && following !== url ? following : null;
      }

      console.log("  " + from.slice(0, 10) + " to " + to.slice(0, 10) + ": " + windowCount + " meetings");
    }

    console.log(
      "Fetched " + pages + " page(s), normalised " + collected.length + " meetings.",
    );

    const stored = await persistMeetings(collected);
    const withAgenda = collected.filter((m) => m.agendaUrl).length;
    const withMinutes = collected.filter((m) => m.minutesUrl).length;
    console.log(
      "  stored " + stored + " (" + withAgenda + " with agendas, " +
        withMinutes + " with minutes)",
    );

    await finishRun(runId, "ok", { itemsSeen: collected.length, itemsNew: stored });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen: 0, itemsNew: 0, error: message });
    throw error;
  }
}
