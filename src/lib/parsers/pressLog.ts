/**
 * Parser for Moscow Police Department daily press logs.
 *
 * MPD publishes one "News Flash" article per day under category 23. Each
 * article body is a flat run of fixed-shape incident blocks:
 *
 *     26-M06700     Disorderly Conduct
 *     Incident Address: 700 BLK BRENT DR
 *     MOSCOW ID 83843
 *     Disposition: CLO
 *     Time Reported: 05:26
 *     Cad Comments: Group of people in white diesel pickup screaming and
 *     yelling and crying. Taking off now.
 *
 * The shape is rigid enough to parse deterministically -- no language model
 * involved. Case numbers run sequentially within a day, which lets us detect
 * when the published log is missing entries.
 */

import { extractDivByClass, htmlToText } from "./html";

export interface ParsedIncident {
  caseNumber: string;
  incidentType: string;
  blockAddress: string | null;
  cityLine: string | null;
  disposition: string | null;
  timeReported: string | null;
  cadComments: string | null;
}

export interface ParsedPressLog {
  detailId: number | null;
  title: string | null;
  logDate: string | null;
  incidents: ParsedIncident[];
  /** Case numbers absent from an otherwise sequential run. */
  missingCaseNumbers: string[];
}

export interface PressLogListEntry {
  detailId: number;
  title: string;
  logDate: string | null;
  url: string;
}

/** e.g. "26-M06700     Fraud" -- case number, whitespace, then the type. */
const INCIDENT_HEAD = /^(\d{2}-[A-Z]{1,3}\d{3,7})\s+(.*)$/;
const CITY_LINE = /^[A-Z .'\-]+\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/;
const LOG_DATE_IN_TITLE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

function labelled(line: string, label: string): string | null {
  const prefix = label + ":";
  if (line.toLowerCase().startsWith(prefix.toLowerCase())) {
    return line.slice(prefix.length).trim();
  }
  return null;
}

/** Normalise "5:26", "05:26", "0526" to "HH:MM"; null if unparseable. */
function normaliseTime(raw: string | null): string | null {
  if (!raw) return null;
  const colon = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h > 23 || m > 59) return null;
    return String(h).padStart(2, "0") + ":" + colon[2];
  }
  const bare = /^(\d{2})(\d{2})$/.exec(raw.trim());
  if (bare) {
    const h = Number(bare[1]);
    const m = Number(bare[2]);
    if (h > 23 || m > 59) return null;
    return bare[1] + ":" + bare[2];
  }
  return null;
}

/** Split the case number into its alpha prefix and numeric sequence. */
function splitCaseNumber(
  caseNumber: string,
): { prefix: string; seq: number; width: number } | null {
  const m = /^(\d{2}-[A-Z]{1,3})(\d{3,7})$/.exec(caseNumber);
  if (!m) return null;
  return { prefix: m[1], seq: Number(m[2]), width: m[2].length };
}

/**
 * Find case numbers missing from an otherwise contiguous run. Only compares
 * within a shared prefix, and refuses to report anything when the span is
 * implausibly wide (which would mean the log is not actually sequential).
 */
export function findMissingCaseNumbers(caseNumbers: string[]): string[] {
  const byPrefix = new Map<string, { seqs: number[]; width: number }>();

  for (const cn of caseNumbers) {
    const parts = splitCaseNumber(cn);
    if (!parts) continue;
    const bucket = byPrefix.get(parts.prefix) ?? { seqs: [], width: parts.width };
    bucket.seqs.push(parts.seq);
    byPrefix.set(parts.prefix, bucket);
  }

  const missing: string[] = [];
  for (const [prefix, bucket] of byPrefix) {
    const { seqs, width } = bucket;
    if (seqs.length < 2) continue;
    const min = Math.min(...seqs);
    const max = Math.max(...seqs);
    // A day's log spans tens of cases. A span in the thousands means these
    // are not one sequential run and gap detection would be meaningless.
    if (max - min > 500) continue;
    const present = new Set(seqs);
    for (let n = min; n <= max; n++) {
      if (!present.has(n)) missing.push(prefix + String(n).padStart(width, "0"));
    }
  }
  return missing.sort();
}

/** Parse the plain-text body of a press log into structured incidents. */
export function parsePressLogText(text: string): ParsedIncident[] {
  const lines = text.split("\n");
  const incidents: ParsedIncident[] = [];

  let current: ParsedIncident | null = null;
  let commentLines: string[] = [];
  let inComments = false;

  const flush = () => {
    if (!current) return;
    const joined = commentLines.join(" ").replace(/\s+/g, " ").trim();
    current.cadComments = joined.length > 0 ? joined : null;
    incidents.push(current);
    current = null;
    commentLines = [];
    inComments = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const head = INCIDENT_HEAD.exec(line);
    if (head) {
      flush();
      current = {
        caseNumber: head[1],
        incidentType: head[2].trim(),
        blockAddress: null,
        cityLine: null,
        disposition: null,
        timeReported: null,
        cadComments: null,
      };
      continue;
    }

    if (!current) continue;
    // Blank lines inside a comment block are layout, not separators.
    if (line === "") continue;

    const address = labelled(line, "Incident Address");
    if (address !== null) {
      current.blockAddress = address || null;
      inComments = false;
      continue;
    }

    const disposition = labelled(line, "Disposition");
    if (disposition !== null) {
      current.disposition = disposition || null;
      inComments = false;
      continue;
    }

    const time = labelled(line, "Time Reported");
    if (time !== null) {
      current.timeReported = normaliseTime(time);
      inComments = false;
      continue;
    }

    const comments = labelled(line, "Cad Comments");
    if (comments !== null) {
      inComments = true;
      if (comments) commentLines.push(comments);
      continue;
    }

    // An unlabelled all-caps "MOSCOW ID 83843" line follows the address.
    if (!inComments && current.cityLine === null && CITY_LINE.test(line)) {
      current.cityLine = line;
      continue;
    }

    if (inComments) commentLines.push(line);
  }

  flush();
  return incidents;
}

/** Pull "08/20/2026" out of "MPD Press Log 08/20/2026" as an ISO date. */
export function logDateFromTitle(title: string): string | null {
  const m = LOG_DATE_IN_TITLE.exec(title);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return m[3] + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

/** Parse a full press log detail page (/m/newsflash/Home/Detail/{id}). */
export function parsePressLogPage(html: string): ParsedPressLog {
  const titleMatch =
    /<h1[^>]*class="[^"]*\barticle-header-title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = titleMatch ? htmlToText(titleMatch[1]).trim() || null : null;

  const idMatch = /\/m\/newsflash\/Home\/Detail\/(\d+)/.exec(html);
  const detailId = idMatch ? Number(idMatch[1]) : null;

  const content = extractDivByClass(html, "article-content");
  const incidents = content ? parsePressLogText(htmlToText(content)) : [];

  return {
    detailId,
    title,
    logDate: title ? logDateFromTitle(title) : null,
    incidents,
    missingCaseNumbers: findMissingCaseNumbers(incidents.map((i) => i.caseNumber)),
  };
}

/** Parse the category listing page into links to each daily log. */
export function parsePressLogList(html: string, baseUrl: string): PressLogListEntry[] {
  const anchor =
    /<a\s+href="(\/m\/newsflash\/Home\/Detail\/(\d+))"[^>]*class="[^"]*\barticle-title-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const seen = new Set<number>();
  const entries: PressLogListEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = anchor.exec(html)) !== null) {
    const detailId = Number(match[2]);
    if (seen.has(detailId)) continue;
    seen.add(detailId);

    const title = htmlToText(match[3]).trim();
    entries.push({
      detailId,
      title,
      logDate: logDateFromTitle(title),
      url: new URL(match[1], baseUrl).toString(),
    });
  }

  return entries;
}
