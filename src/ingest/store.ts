/**
 * Shared persistence for ingestion jobs: run bookkeeping and the raw
 * document store.
 *
 * Raw documents are written before anything is parsed. When a parser breaks
 * -- and CivicPlus markup will change -- we reparse from this table instead
 * of re-crawling, which would otherwise lose everything the publisher has
 * since rotated out of its archive.
 */

import type { FetchedDocument } from "../lib/fetcher";
import { query, queryOne } from "../lib/db";

export async function startRun(sourceId: string): Promise<number> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO fetch_runs (source_id, status) VALUES ($1, 'running') RETURNING id`,
    [sourceId],
  );
  return Number(row!.id);
}

export interface RunOutcome {
  itemsSeen: number;
  itemsNew: number;
  error?: string | null;
}

export async function finishRun(
  runId: number,
  status: "ok" | "error",
  outcome: RunOutcome,
): Promise<void> {
  await query(
    `UPDATE fetch_runs
        SET finished_at = now(), status = $2, items_seen = $3, items_new = $4, error = $5
      WHERE id = $1`,
    [runId, status, outcome.itemsSeen, outcome.itemsNew, outcome.error ?? null],
  );
}

/**
 * Store a fetched document, keyed by (url, content_hash). Re-fetching
 * unchanged content just refreshes last_seen_at, so the table holds one row
 * per distinct *version* of a page rather than one per fetch.
 */
export async function storeRawDocument(
  sourceId: string,
  document: FetchedDocument,
): Promise<number> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO raw_documents (source_id, url, content_hash, content_type, body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (url, content_hash)
       DO UPDATE SET last_seen_at = now()
     RETURNING id`,
    [
      sourceId,
      document.url,
      document.contentHash,
      document.contentType,
      document.body,
    ],
  );
  return Number(row!.id);
}

/** True if we have already stored this exact version of this URL. */
export async function hasSeenVersion(url: string, contentHash: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM raw_documents WHERE url = $1 AND content_hash = $2`,
    [url, contentHash],
  );
  return row !== null;
}
