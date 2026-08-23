import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { condenseWordChanges, diffChapter, diffChapterText } from "./diff";
import { extractPdfText } from "./pdf";
import { normaliseCodeText, splitCodeSections } from "./parsers/cityCode";
import type { CodeSection } from "./parsers/cityCode";

const FIXTURES = join(__dirname, "fixtures");
const readBytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

const section = (number: string, heading: string, text: string): CodeSection => ({
  number,
  heading,
  text,
});

describe("diffChapter", () => {
  it("reports nothing when the chapter is unchanged", () => {
    const sections = [section("1-1", "Repeal", "The ordinances contained in this Chapter.")];
    const result = diffChapter(sections, sections);
    expect(result.changes).toEqual([]);
    expect(result.wordsAdded).toBe(0);
    expect(result.wordsRemoved).toBe(0);
  });

  it("detects a one-word amendment and locates it by section", () => {
    const before = [section("1-3", "Rules", "The Council shall approve the application.")];
    const after = [section("1-3", "Rules", "The Commission shall approve the application.")];

    const result = diffChapter(before, after);
    expect(result.sectionsChanged).toBe(1);
    expect(result.changes[0].number).toBe("1-3");
    expect(result.wordsAdded).toBe(1);
    expect(result.wordsRemoved).toBe(1);

    const added = result.changes[0].words.filter((w) => w.added).map((w) => w.value.trim());
    const removed = result.changes[0].words.filter((w) => w.removed).map((w) => w.value.trim());
    expect(added).toEqual(["Commission"]);
    expect(removed).toEqual(["Council"]);
  });

  it("reports an added section", () => {
    const before = [section("1-1", "One", "First.")];
    const after = [section("1-1", "One", "First."), section("1-2", "Two", "Second section text.")];

    const result = diffChapter(before, after);
    expect(result.sectionsAdded).toBe(1);
    expect(result.sectionsChanged).toBe(0);
    expect(result.changes[0]).toMatchObject({ kind: "added", number: "1-2" });
    expect(result.changes[0].text).toBe("Second section text.");
  });

  it("reports a removed section", () => {
    const before = [section("1-1", "One", "First."), section("1-2", "Two", "Second.")];
    const after = [section("1-1", "One", "First.")];

    const result = diffChapter(before, after);
    expect(result.sectionsRemoved).toBe(1);
    expect(result.changes[0]).toMatchObject({ kind: "removed", number: "1-2" });
  });

  it("matches sections by number even when they are reordered", () => {
    const before = [section("1-1", "One", "Alpha."), section("1-2", "Two", "Beta.")];
    const after = [section("1-2", "Two", "Beta."), section("1-1", "One", "Alpha.")];
    expect(diffChapter(before, after).changes).toEqual([]);
  });

  it("ignores a pure whitespace difference", () => {
    // Re-typesetting the same sentence must not read as an amendment.
    const before = [section("1-1", "One", "The Council shall approve.")];
    const after = [section("1-1", "One", "The  Council   shall approve.")];
    expect(diffChapter(before, after).changes).toEqual([]);
  });

  it("handles a section renumbered as a removal plus an addition", () => {
    const before = [section("1-1", "One", "Same text here.")];
    const after = [section("1-2", "One", "Same text here.")];

    const result = diffChapter(before, after);
    expect(result.sectionsRemoved).toBe(1);
    expect(result.sectionsAdded).toBe(1);
  });
});

describe("condenseWordChanges", () => {
  it("elides long unchanged runs but keeps context around a change", () => {
    const filler = "word ".repeat(200);
    const condensed = condenseWordChanges(
      [
        { value: filler, added: false, removed: false },
        { value: "new", added: true, removed: false },
        { value: filler, added: false, removed: false },
      ],
      40,
    );

    expect(condensed.some((c) => c.added)).toBe(true);
    const rendered = condensed.map((c) => c.value).join("");
    expect(rendered).toContain("…");
    expect(rendered.length).toBeLessThan(filler.length);
  });

  it("drops unchanged parts that touch no change at all", () => {
    const condensed = condenseWordChanges([
      { value: "untouched", added: false, removed: false },
    ]);
    expect(condensed).toEqual([]);
  });

  it("keeps a short unchanged run intact", () => {
    const condensed = condenseWordChanges([
      { value: "before ", added: false, removed: false },
      { value: "new", added: true, removed: false },
    ]);
    expect(condensed.map((c) => c.value)).toEqual(["before ", "new"]);
  });
});

describe("diffChapterText", () => {
  it("falls back to a whole-text diff when sections explain nothing", () => {
    // Text changed, but neither version parses into sections.
    const result = diffChapterText("Preamble one.", "Preamble two.", [], []);
    expect(result.unstructuredChange).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].heading).toContain("outside a recognised section");
    expect(result.wordsAdded).toBe(1);
    expect(result.wordsRemoved).toBe(1);
  });

  it("prefers the structured diff when sections do explain the change", () => {
    const before = [section("1-1", "One", "Alpha.")];
    const after = [section("1-1", "One", "Beta.")];
    const result = diffChapterText("Alpha.", "Beta.", before, after);
    expect(result.unstructuredChange).toBe(false);
    expect(result.changes[0].number).toBe("1-1");
  });

  it("reports nothing when the text is identical", () => {
    const result = diffChapterText("Same.", "Same.", [], []);
    expect(result.changes).toEqual([]);
    expect(result.unstructuredChange).toBe(false);
  });
});

describe("against the real Chapter 01 PDF", () => {
  it("finds no change when a chapter is compared with itself", async () => {
    const { pages } = await extractPdfText(readBytes("chapter-01.pdf"));
    const sections = splitCodeSections(normaliseCodeText(pages));
    expect(sections.length).toBeGreaterThan(0);

    const result = diffChapter(sections, sections);
    expect(result.changes).toEqual([]);
  });

  it("pinpoints a simulated amendment inside real code text", async () => {
    const { pages } = await extractPdfText(readBytes("chapter-01.pdf"));
    const original = splitCodeSections(normaliseCodeText(pages));

    // Simulate the city amending one word of Section 1-2.
    const amended = original.map((s) =>
      s.number === "1-2"
        ? { ...s, text: s.text.replace(/\brepealed\b/i, "superseded") }
        : s,
    );

    const result = diffChapter(original, amended);
    expect(result.sectionsChanged).toBe(1);
    expect(result.changes[0].number).toBe("1-2");
    expect(
      result.changes[0].words.filter((w) => w.added).map((w) => w.value.trim()),
    ).toContain("superseded");
  });
});
