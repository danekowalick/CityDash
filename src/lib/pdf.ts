/**
 * PDF text extraction, isolated behind one function so the rest of the code
 * base never imports pdfjs directly.
 *
 * The city publishes each code chapter as a two-column justified PDF, which
 * extracts with heavy and irregular inter-word spacing ("The   ordinances
 * contained   in   this"). That spacing is a rendering artefact and is not
 * stable between revisions, so callers must normalise before diffing --
 * see normaliseCodeText in parsers/cityCode.ts.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ExtractedPdf {
  pages: string[];
  pageCount: number;
}

/** True when the bytes actually begin with a PDF header. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  // "%PDF-"
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export class NotAPdfError extends Error {
  constructor(url: string) {
    super("Response for " + url + " is not a PDF (the portal likely returned an error page)");
    this.name = "NotAPdfError";
  }
}

/**
 * Extract text page by page. Pages are kept separate so the caller can strip
 * per-page running heads before joining them.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdf> {
  const doc = await getDocument({
    data: bytes,
    useSystemFonts: true,
    // These PDFs carry no interactive content; suppressing the extras keeps
    // extraction quiet and avoids needless font/network work.
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(joinTextItems(content.items));
    page.cleanup();
  }

  await doc.destroy();
  return { pages, pageCount: pages.length };
}

interface PositionedItem {
  str: string;
  width?: number;
  height?: number;
  transform?: number[];
  hasEOL?: boolean;
}

/**
 * Join a page's text runs using their positions rather than inserting a space
 * between every one.
 *
 * A PDF has no notion of words: it emits runs of glyphs at coordinates, and
 * kerning splits a single word across several runs. Joining them all with a
 * space produced text like "se parate", "Abstenti ons", "Mosc ow", and
 * "0 7/15/2019" -- which is not just ugly, it defeated parsers keyed on those
 * words. Roughly one motion in eight was affected.
 *
 * So a space is inserted only where the geometry implies one: a gap wide
 * enough relative to the font size, or a move to a new line. Runs that end
 * where the next begins are concatenated directly.
 */
export function joinTextItems(items: unknown[]): string {
  let out = "";
  let prevEndX: number | null = null;
  let prevY: number | null = null;

  for (const raw of items) {
    const item = raw as PositionedItem;
    if (typeof item.str !== "string") continue;
    if (item.str === "") {
      if (item.hasEOL) prevY = null;
      continue;
    }

    const transform = item.transform;
    const x = Array.isArray(transform) ? transform[4] : null;
    const y = Array.isArray(transform) ? transform[5] : null;
    const fontSize = Array.isArray(transform) ? Math.abs(transform[3]) || 10 : 10;

    if (out !== "") {
      const newLine =
        prevY === null || y === null || Math.abs(y - prevY) > fontSize * 0.5;

      if (newLine) {
        out += " ";
      } else if (prevEndX !== null && x !== null) {
        // A real inter-word space is around a quarter of the font size; a
        // kerning split is far narrower. Half that sits comfortably between.
        out += x - prevEndX > fontSize * 0.13 ? " " : "";
      } else {
        out += " ";
      }
    }

    out += item.str;
    prevEndX = x !== null ? x + (item.width ?? 0) : null;
    prevY = y;
  }

  return out;
}
