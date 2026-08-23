/**
 * Diffing city code between two captured versions of a chapter.
 *
 * This is a real text diff, not a summary. The site shows the language that
 * was actually added or removed, so a reader can check it against the
 * ordinance themselves.
 *
 * Two levels:
 *   1. Sections are matched by number, giving "Section 4-3 changed" rather
 *      than "page 7 changed" -- and making the result immune to content
 *      shifting across page boundaries.
 *   2. Within a changed section, a word-level diff shows the exact edit.
 */

import { diffWords } from "diff";

import type { CodeSection } from "./parsers/cityCode";

export type SectionChangeKind = "added" | "removed" | "changed";

export interface WordChange {
  value: string;
  added: boolean;
  removed: boolean;
}

export interface SectionChange {
  kind: SectionChangeKind;
  number: string;
  heading: string;
  /** Word-level detail. Empty for wholly added or removed sections. */
  words: WordChange[];
  /** Full text, for added and removed sections. */
  text: string;
  wordsAdded: number;
  wordsRemoved: number;
}

export interface ChapterDiff {
  changes: SectionChange[];
  sectionsAdded: number;
  sectionsRemoved: number;
  sectionsChanged: number;
  wordsAdded: number;
  wordsRemoved: number;
  /** True when the text differs but no section boundary explains it. */
  unstructuredChange: boolean;
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Trim a word-level diff to the changed parts plus a little context, so a
 * one-word amendment does not render an entire section of unchanged text.
 */
export function condenseWordChanges(changes: WordChange[], contextChars = 120): WordChange[] {
  const keep: WordChange[] = [];

  for (let i = 0; i < changes.length; i++) {
    const part = changes[i];
    if (part.added || part.removed) {
      keep.push(part);
      continue;
    }

    const prevChanged = i > 0 && (changes[i - 1].added || changes[i - 1].removed);
    const nextChanged =
      i + 1 < changes.length && (changes[i + 1].added || changes[i + 1].removed);

    if (!prevChanged && !nextChanged) continue;

    if (part.value.length <= contextChars * 2) {
      keep.push(part);
      continue;
    }

    // Keep the tail before a change and the head after one, eliding the middle.
    const head = prevChanged ? part.value.slice(0, contextChars) : "";
    const tail = nextChanged ? part.value.slice(-contextChars) : "";
    keep.push({
      value: (head ? head + " " : "") + "…" + (tail ? " " + tail : ""),
      added: false,
      removed: false,
    });
  }

  return keep;
}

/** Diff two captured versions of the same chapter, section by section. */
export function diffChapter(
  before: CodeSection[],
  after: CodeSection[],
  options: { condense?: boolean } = {},
): ChapterDiff {
  const condense = options.condense ?? true;

  const beforeByNumber = new Map(before.map((s) => [s.number, s]));
  const afterByNumber = new Map(after.map((s) => [s.number, s]));

  const changes: SectionChange[] = [];
  let wordsAdded = 0;
  let wordsRemoved = 0;

  // Removed sections, in their original order.
  for (const section of before) {
    if (afterByNumber.has(section.number)) continue;
    const removed = countWords(section.text);
    wordsRemoved += removed;
    changes.push({
      kind: "removed",
      number: section.number,
      heading: section.heading,
      words: [],
      text: section.text,
      wordsAdded: 0,
      wordsRemoved: removed,
    });
  }

  // Added and modified sections, in the new document's order.
  for (const section of after) {
    const previous = beforeByNumber.get(section.number);

    if (!previous) {
      const added = countWords(section.text);
      wordsAdded += added;
      changes.push({
        kind: "added",
        number: section.number,
        heading: section.heading,
        words: [],
        text: section.text,
        wordsAdded: added,
        wordsRemoved: 0,
      });
      continue;
    }

    if (previous.text === section.text) continue;

    const parts = diffWords(previous.text, section.text).map((part) => ({
      value: part.value,
      added: Boolean(part.added),
      removed: Boolean(part.removed),
    }));

    let sectionAdded = 0;
    let sectionRemoved = 0;
    for (const part of parts) {
      if (part.added) sectionAdded += countWords(part.value);
      else if (part.removed) sectionRemoved += countWords(part.value);
    }

    // diffWords reports pure whitespace shifts as changes; ignore those.
    if (sectionAdded === 0 && sectionRemoved === 0) continue;

    wordsAdded += sectionAdded;
    wordsRemoved += sectionRemoved;

    changes.push({
      kind: "changed",
      number: section.number,
      heading: section.heading,
      words: condense ? condenseWordChanges(parts) : parts,
      text: section.text,
      wordsAdded: sectionAdded,
      wordsRemoved: sectionRemoved,
    });
  }

  const sectionsAdded = changes.filter((c) => c.kind === "added").length;
  const sectionsRemoved = changes.filter((c) => c.kind === "removed").length;
  const sectionsChanged = changes.filter((c) => c.kind === "changed").length;

  return {
    changes,
    sectionsAdded,
    sectionsRemoved,
    sectionsChanged,
    wordsAdded,
    wordsRemoved,
    unstructuredChange: false,
  };
}

/**
 * Diff whole chapters, falling back to a plain word diff when the text
 * changed but section parsing cannot account for it -- for example when the
 * city reissues a chapter in a different layout. Saying "something changed
 * but we cannot attribute it to a section" is honest; silently reporting no
 * change would not be.
 */
export function diffChapterText(
  beforeText: string,
  afterText: string,
  beforeSections: CodeSection[],
  afterSections: CodeSection[],
): ChapterDiff {
  const structured = diffChapter(beforeSections, afterSections);
  const textDiffers = beforeText !== afterText;
  const structuredFoundNothing = structured.changes.length === 0;

  if (textDiffers && structuredFoundNothing) {
    const parts = diffWords(beforeText, afterText).map((part) => ({
      value: part.value,
      added: Boolean(part.added),
      removed: Boolean(part.removed),
    }));

    let added = 0;
    let removed = 0;
    for (const part of parts) {
      if (part.added) added += countWords(part.value);
      else if (part.removed) removed += countWords(part.value);
    }

    if (added === 0 && removed === 0) return structured;

    return {
      changes: [
        {
          kind: "changed",
          number: "—",
          heading: "Changes outside a recognised section",
          words: condenseWordChanges(parts),
          text: afterText,
          wordsAdded: added,
          wordsRemoved: removed,
        },
      ],
      sectionsAdded: 0,
      sectionsRemoved: 0,
      sectionsChanged: 1,
      wordsAdded: added,
      wordsRemoved: removed,
      unstructuredChange: true,
    };
  }

  return structured;
}
