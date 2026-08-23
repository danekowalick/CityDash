/**
 * Ingests the Moscow city code.
 *
 * For each chapter: fetch the PDF, hash the bytes, and only if that hash has
 * moved since the last capture do we extract text, split it into sections,
 * store a new version, and diff it against the previous one.
 *
 * The hash is over the *published bytes*, not our extracted text, so a change
 * in our own extraction never masquerades as the city amending the code.
 *
 * Note on raw_documents: that table is TEXT, and a PDF is not. We store the
 * extracted text there keyed by the PDF's byte hash. That preserves the point
 * of the raw store -- reparsing section splitting later without re-crawling
 * 128 PDFs -- while keeping the schema text-only.
 */

import { politeFetch, politeFetchBytes } from "../../lib/fetcher";
import { query, transaction } from "../../lib/db";
import { extractPdfText, looksLikePdf, NotAPdfError } from "../../lib/pdf";
import {
  normaliseCodeText,
  parseChapterStatus,
  parseCodeCurrency,
  parseCodeIndex,
  parseOrdinanceCitations,
  splitCodeSections,
  type CodeChapterLink,
  type CodeSection,
} from "../../lib/parsers/cityCode";
import { diffChapterText } from "../../lib/diff";
import { finishRun, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "city-code";
const INDEX_URL = "https://www.ci.moscow.id.us/393/City-Code";
const BASE_URL = "https://www.ci.moscow.id.us";

export interface CityCodeJobOptions {
  /** Cap on chapters fetched in one run. */
  limit?: number;
  /** Re-extract and re-store even when the PDF bytes are unchanged. */
  force?: boolean;
}

interface StoredVersion {
  id: number;
  contentHash: string;
  text: string;
  sections: CodeSection[];
}

async function latestVersion(slug: string): Promise<StoredVersion | null> {
  const rows = await query<{
    id: string;
    content_hash: string;
    text: string;
    sections: CodeSection[];
  }>(
    `SELECT id, content_hash, text, sections
       FROM code_versions
      WHERE chapter_slug = $1
      ORDER BY captured_at DESC
      LIMIT 1`,
    [slug],
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    contentHash: rows[0].content_hash,
    text: rows[0].text,
    sections: Array.isArray(rows[0].sections) ? rows[0].sections : [],
  };
}

async function upsertChapters(chapters: CodeChapterLink[]): Promise<void> {
  await transaction(async (client) => {
    for (const chapter of chapters) {
      await client.query(
        `INSERT INTO code_chapters
           (slug, title_label, title_name, chapter_label, chapter_name, document_id, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO UPDATE SET
           title_name = EXCLUDED.title_name,
           chapter_name = EXCLUDED.chapter_name,
           document_id = EXCLUDED.document_id,
           url = EXCLUDED.url,
           last_seen_at = now()`,
        [
          chapter.slug,
          chapter.titleLabel,
          chapter.titleName,
          chapter.chapterLabel,
          chapter.chapterName,
          chapter.documentId,
          chapter.url,
        ],
      );
    }
  });
}

async function recordOrdinances(
  slug: string,
  citations: ReturnType<typeof parseOrdinanceCitations>,
): Promise<void> {
  if (citations.length === 0) return;

  await transaction(async (client) => {
    for (const citation of citations) {
      await client.query(
        `INSERT INTO ordinances (number, adopted_on)
         VALUES ($1, $2)
         ON CONFLICT (number) DO UPDATE SET
           adopted_on = COALESCE(ordinances.adopted_on, EXCLUDED.adopted_on)`,
        [citation.number, citation.adoptedOn],
      );
      await client.query(
        `INSERT INTO ordinance_citations (ordinance_number, chapter_slug)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [citation.number, slug],
      );
    }
  });
}

/**
 * Attribute each section to the ordinances cited within it.
 *
 * The chapter-level link says an ordinance touched this chapter; this says
 * which of its sections carry that ordinance's mark, which is what a reader
 * actually wants when asking what an ordinance did.
 */
async function recordOrdinanceSections(
  slug: string,
  sections: CodeSection[],
): Promise<void> {
  await transaction(async (client) => {
    await client.query(`DELETE FROM ordinance_sections WHERE chapter_slug = $1`, [slug]);

    for (const section of sections) {
      for (const citation of parseOrdinanceCitations(section.text)) {
        // The ordinance row itself is written by recordOrdinances; this table
        // deliberately carries no foreign key so a citation to an ordinance we
        // have not otherwise seen is still recorded rather than dropped.
        await client.query(
          `INSERT INTO ordinance_sections
             (ordinance_number, chapter_slug, section_number, section_heading)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ordinance_number, chapter_slug, section_number)
             DO UPDATE SET section_heading = EXCLUDED.section_heading`,
          [citation.number, slug, section.number, section.heading || null],
        );
      }
    }
  });
}

export async function ingestCityCode(options: CityCodeJobOptions = {}): Promise<void> {
  const runId = await startRun(SOURCE_ID);
  let itemsSeen = 0;
  let itemsNew = 0;

  try {
    const index = await politeFetch(INDEX_URL);
    await storeRawDocument(SOURCE_ID, index);

    const chapters = parseCodeIndex(index.body, BASE_URL);
    if (chapters.length === 0) {
      throw new Error("Parsed zero chapters from the code index -- the page layout changed");
    }

    const currency = parseCodeCurrency(index.body);
    if (currency) {
      await query(
        `INSERT INTO code_currency (id, stamp, updated_at) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET stamp = EXCLUDED.stamp, updated_at = now()`,
        [currency],
      );
    }

    await upsertChapters(chapters);
    console.log(
      "Index: " + chapters.length + " chapters" +
        (currency ? ", code current through " + currency : ""),
    );

    const selected = options.limit ? chapters.slice(0, options.limit) : chapters;

    for (const chapter of selected) {
      itemsSeen++;

      let pdf;
      try {
        pdf = await politeFetchBytes(chapter.url);
      } catch (error) {
        console.warn("  fetch failed for " + chapter.slug + ": " + String(error).slice(0, 120));
        continue;
      }

      // The portal serves an HTML error page for a stale document id; that
      // must not be stored as if it were the chapter.
      if (!looksLikePdf(pdf.bytes)) {
        console.warn("  not a PDF: " + chapter.slug + " (" + chapter.url + ")");
        continue;
      }

      const previous = await latestVersion(chapter.slug);
      if (!options.force && previous && previous.contentHash === pdf.contentHash) {
        continue;
      }

      let extracted;
      try {
        extracted = await extractPdfText(pdf.bytes);
      } catch (error) {
        if (error instanceof NotAPdfError) continue;
        console.warn("  extraction failed for " + chapter.slug + ": " + String(error).slice(0, 120));
        continue;
      }

      const text = normaliseCodeText(extracted.pages);
      const sections = splitCodeSections(text);

      // Keyed by the PDF byte hash so a reparse can find the right capture.
      const rawDocumentId = await storeRawDocument(SOURCE_ID, {
        url: chapter.url,
        status: pdf.status,
        body: text,
        contentType: pdf.contentType,
        contentHash: pdf.contentHash,
      });

      const status = parseChapterStatus(text);

      const inserted = await query<{ id: string }>(
        `INSERT INTO code_versions
           (chapter_slug, content_hash, text, sections, section_count,
            page_count, document_id, source_url, raw_document_id, status, status_ordinance)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (chapter_slug, content_hash) DO UPDATE SET
           text = EXCLUDED.text,
           sections = EXCLUDED.sections,
           section_count = EXCLUDED.section_count,
           status = EXCLUDED.status,
           status_ordinance = EXCLUDED.status_ordinance
         RETURNING id`,
        [
          chapter.slug,
          pdf.contentHash,
          text,
          JSON.stringify(sections),
          sections.length,
          extracted.pageCount,
          chapter.documentId,
          chapter.url,
          rawDocumentId,
          status.status,
          status.byOrdinance,
        ],
      );
      const versionId = Number(inserted[0].id);

      await recordOrdinances(chapter.slug, parseOrdinanceCitations(text));
      await recordOrdinanceSections(chapter.slug, sections);

      if (previous && previous.id !== versionId) {
        const diff = diffChapterText(previous.text, text, previous.sections, sections);

        if (diff.changes.length > 0) {
          await query(
            `INSERT INTO code_changes
               (chapter_slug, from_version_id, to_version_id, sections_added,
                sections_removed, sections_changed, words_added, words_removed, unstructured)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (from_version_id, to_version_id) DO NOTHING`,
            [
              chapter.slug,
              previous.id,
              versionId,
              diff.sectionsAdded,
              diff.sectionsRemoved,
              diff.sectionsChanged,
              diff.wordsAdded,
              diff.wordsRemoved,
              diff.unstructuredChange,
            ],
          );
          console.log(
            "  CHANGED " + chapter.slug + ": " +
              diff.sectionsChanged + " sections changed, +" +
              diff.wordsAdded + "/-" + diff.wordsRemoved + " words",
          );
        }
      } else {
        console.log(
          "  captured " + chapter.slug + " (" + sections.length + " sections, " +
            extracted.pageCount + "pp)",
        );
      }

      itemsNew++;
    }

    await finishRun(runId, "ok", { itemsSeen, itemsNew });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen, itemsNew, error: message });
    throw error;
  }
}
