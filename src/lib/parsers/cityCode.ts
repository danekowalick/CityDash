/**
 * Parsers for the Moscow city code.
 *
 * The code is published as one PDF per chapter, grouped into eleven Titles on
 * https://www.ci.moscow.id.us/393/City-Code. Each chapter PDF carries the
 * ordinances that amended it, in the form:
 *
 *     (Ord. 2018-07, 05/21/2018; 2019-07, 07/15/2019; 2026-04, 07/06/2026)
 *
 * so the amendment history can be read straight out of the code text.
 *
 * Everything here is deterministic string work. Diffing the code is a text
 * diff, not an interpretation, which is the whole point: the site reports the
 * language that actually changed rather than a summary of it.
 */

import { decodeEntities, htmlToText } from "./html";

// ---------------------------------------------------------------------------
// The chapter index
// ---------------------------------------------------------------------------

export interface CodeChapterLink {
  /** e.g. "Title 04 - Land Use Regulations (Zoning Code)" */
  titleName: string;
  /** e.g. "Title 04" */
  titleLabel: string;
  /** e.g. "Chapter 03" */
  chapterLabel: string;
  /** e.g. "Permitted Land Uses" */
  chapterName: string;
  /** CivicPlus document id. Changes when the city uploads a replacement. */
  documentId: number;
  url: string;
  /** Stable key: "title-04/chapter-03". Survives a document id change. */
  slug: string;
}

const SECTION_SPLIT = /<div class="relatedDocumentsSection/i;
const WIDGET_TITLE = /<h4[^>]*class="[^"]*\bwidgetTitle\b[^"]*"[^>]*>([\s\S]*?)<\/h4>/i;
const CHAPTER_LINK = /href="(\/DocumentCenter\/View\/(\d+)\/[^"]*)"[^>]*>([\s\S]{0,200}?)<\/a>/gi;

function padLabel(kind: string, value: string): string {
  const n = Number(value);
  return kind + " " + (Number.isFinite(n) ? String(n).padStart(2, "0") : value);
}

/** "Title 04 - Land Use Regulations" -> { label: "Title 04", name } */
function readTitleHeading(raw: string): { label: string; name: string } | null {
  const text = htmlToText(raw).trim();
  const m = /^Title\s+(\d+)\s*[-–—]?\s*(.*)$/i.exec(text);
  if (!m) return null;
  return { label: padLabel("Title", m[1]), name: text };
}

/** "Chapter 03 - Permitted Land Uses (PDF)" -> { label, name } */
function readChapterHeading(raw: string): { label: string; name: string } | null {
  const text = decodeEntities(htmlToText(raw))
    .replace(/\s*\(PDF\)\s*$/i, "")
    .trim();
  const m = /^Chapter\s+([0-9]+[A-Za-z]?)\s*[-–—]\s*(.+)$/i.exec(text);
  if (!m) return null;
  return { label: padLabel("Chapter", m[1]), name: m[2].trim() };
}

export function slugForChapter(titleLabel: string, chapterLabel: string): string {
  const part = (value: string) => value.toLowerCase().replace(/\s+/g, "-");
  return part(titleLabel) + "/" + part(chapterLabel);
}

/**
 * Parse the City Code index page into one entry per chapter.
 *
 * Chapter numbers restart within each Title -- there are several "Chapter 01"
 * chapters -- so a chapter is only identified by the pair.
 */
export function parseCodeIndex(html: string, baseUrl: string): CodeChapterLink[] {
  const chapters: CodeChapterLink[] = [];
  const seen = new Set<string>();

  for (const section of html.split(SECTION_SPLIT).slice(1)) {
    const headingMatch = WIDGET_TITLE.exec(section);
    if (!headingMatch) continue;
    const title = readTitleHeading(headingMatch[1]);
    if (!title) continue;

    CHAPTER_LINK.lastIndex = 0;
    let link: RegExpExecArray | null;
    while ((link = CHAPTER_LINK.exec(section)) !== null) {
      const chapter = readChapterHeading(link[3]);
      if (!chapter) continue;

      const slug = slugForChapter(title.label, chapter.label);
      if (seen.has(slug)) continue;
      seen.add(slug);

      chapters.push({
        titleName: title.name,
        titleLabel: title.label,
        chapterLabel: chapter.label,
        chapterName: chapter.name,
        documentId: Number(link[2]),
        url: new URL(link[1], baseUrl).toString(),
        slug,
      });
    }
  }

  return chapters;
}

/** "The Code has been updated through July 6, 2026, Ordinance 2026-04." */
export function parseCodeCurrency(html: string): string | null {
  const text = htmlToText(html);
  const m = /updated through\s+([^.<]{3,120})/i.exec(text);
  return m ? m[1].replace(/\s+/g, " ").trim().replace(/[.,;]$/, "") : null;
}

// ---------------------------------------------------------------------------
// Chapter text
// ---------------------------------------------------------------------------

/**
 * Running heads repeat the section range on every page:
 *   "§ 1 - 1   TITLE 1 — GENERAL   § 1 - 3"
 * They move when content reflows across a page boundary, which would show up
 * as a change in the diff even though no law changed. They are stripped.
 *
 * Repealed and reserved chapters carry a truncated form -- "§ 9 -" with no
 * second number, or "§ 8 - ___" -- so the trailing reference is optional.
 */
const RUNNING_HEAD =
  /§\s*\d+\s*-\s*(?:[\dA-Za-z]+|_{2,})?\s*TITLE\s+\d+\s*[—–-]\s*[A-Z0-9 ,&'().\/-]{2,70}?\s*§\s*\d+\s*-\s*(?:[\dA-Za-z]+|_{2,})?/gi;

/** A bare page number sitting alone at a page edge. */
const EDGE_PAGE_NUMBER = /^\s*\d{1,4}\s+|\s+\d{1,4}\s*$/g;

/**
 * Turn extracted PDF pages into one normalised string suitable for diffing.
 *
 * Normalisation is deliberately aggressive about whitespace because the
 * source is justified two-column text: the same sentence re-typeset produces
 * different runs of spaces, and without this every reissue of a chapter would
 * appear to have changed everywhere.
 */
export function normaliseCodeText(pages: string[]): string {
  return pages
    .map((page) => {
      const withoutHeads = page.replace(RUNNING_HEAD, " ");
      return withoutHeads.replace(EDGE_PAGE_NUMBER, " ");
    })
    .join(" ")
    .replace(/ /g, " ")
    // Soft hyphens and ligature artefacts.
    .replace(/­/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export interface CodeSection {
  /** Normalised identifier, e.g. "1-3" or "4-2A". */
  number: string;
  heading: string;
  text: string;
}

/** "Sec. 1 - 3." and "§ 1 - 3" both normalise to "1-3". */
export function normaliseSectionNumber(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/^§/, "").replace(/[.:]$/, "");
}

const BODY_SECTION = /Sec\.\s*(\d+\s*-\s*\d+[A-Za-z]?)\s*\.\s*/g;
const TOC_SECTION = /Sec\.\s*(\d+\s*-\s*\d+[A-Za-z]?)\s*:\s*/g;

/**
 * Split a normalised chapter into its sections.
 *
 * Diffing per section rather than per page is what makes the output readable:
 * a reader learns "Section 4-3 changed" instead of "page 7 changed", and the
 * result is immune to content shifting between pages.
 */
export function splitCodeSections(text: string): CodeSection[] {
  const collect = (pattern: RegExp): CodeSection[] => {
    pattern.lastIndex = 0;
    const marks: Array<{ number: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      marks.push({
        number: normaliseSectionNumber(m[1]),
        start: m.index,
        end: m.index + m[0].length,
      });
    }

    return marks.map((mark, i) => {
      const body = text.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : text.length).trim();
      // The heading runs until the first sentence end; the rest is the body.
      const headingMatch = /^(.{0,120}?\.)\s/.exec(body);
      const heading = headingMatch ? headingMatch[1].replace(/\.$/, "").trim() : "";
      return { number: mark.number, heading, text: body };
    });
  };

  const body = collect(BODY_SECTION);
  // Some chapters use the colon form throughout; fall back rather than
  // returning nothing.
  return body.length > 0 ? body : collect(TOC_SECTION);
}

// ---------------------------------------------------------------------------
// Ordinance citations
// ---------------------------------------------------------------------------

export interface OrdinanceCitation {
  /** e.g. "2026-04" */
  number: string;
  /** ISO date, e.g. "2026-07-06" */
  adoptedOn: string | null;
}

const CITATION_GROUP = /\(\s*Ord[^)]{0,400}?\)/gi;

/**
 * Pull ordinance references out of chapter text.
 *
 * Extraction inserts stray spaces inside numbers and dates ("0 7/15/2019"),
 * so the citation is de-spaced entirely before matching rather than trying to
 * tolerate every possible break.
 */
export function parseOrdinanceCitations(text: string): OrdinanceCitation[] {
  const found = new Map<string, OrdinanceCitation>();

  CITATION_GROUP.lastIndex = 0;
  let group: RegExpExecArray | null;
  while ((group = CITATION_GROUP.exec(text)) !== null) {
    const compact = group[0].replace(/\s+/g, "");
    const entry = /(\d{4})-(\d{1,3})(?:,(\d{1,2})\/(\d{1,2})\/(\d{4}))?/g;

    let m: RegExpExecArray | null;
    while ((m = entry.exec(compact)) !== null) {
      const number = m[1] + "-" + m[2].padStart(2, "0");
      let adoptedOn: string | null = null;

      if (m[3] && m[4] && m[5]) {
        const month = Number(m[3]);
        const day = Number(m[4]);
        const year = Number(m[5]);
        // Guard against a mis-joined number producing an impossible date.
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1887) {
          adoptedOn =
            m[5] + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        }
      }

      const existing = found.get(number);
      // Keep whichever mention carried a date.
      if (!existing || (!existing.adoptedOn && adoptedOn)) {
        found.set(number, { number, adoptedOn });
      }
    }
  }

  return [...found.values()].sort((a, b) => (a.number < b.number ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Chapter status
// ---------------------------------------------------------------------------

export type ChapterStatus = "active" | "repealed" | "reserved" | "moved";

export interface ChapterStatusInfo {
  status: ChapterStatus;
  /** The ordinance that repealed or moved the chapter, when it says. */
  byOrdinance: string | null;
}

/**
 * A dozen chapters of the code are placeholders reading "<REPEALED>" or
 * "<RESERVED>". They parse to zero sections, which is correct -- there is no
 * law in them -- but that is not the same as failing to parse, and a reader
 * looking for a rule that used to exist deserves to be told it was repealed
 * and by which ordinance.
 *
 * Extraction breaks the angle-bracket markers apart ("< REPEALED >"), so
 * matching ignores spacing.
 */
export function parseChapterStatus(text: string): ChapterStatusInfo {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  const citations = parseOrdinanceCitations(text);
  const byOrdinance = citations.length > 0 ? citations[0].number : null;

  if (compact.includes("<MOVEDANDRESERVED")) return { status: "moved", byOrdinance };
  if (compact.includes("<REPEALED")) return { status: "repealed", byOrdinance };
  if (compact.includes("<RESERVED")) return { status: "reserved", byOrdinance: null };
  return { status: "active", byOrdinance: null };
}
