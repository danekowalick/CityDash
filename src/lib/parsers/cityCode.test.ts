import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractPdfText, looksLikePdf } from "../pdf";
import {
  normaliseCodeText,
  normaliseSectionNumber,
  parseCodeCurrency,
  parseCodeIndex,
  parseChapterStatus,
  parseOrdinanceCitations,
  slugForChapter,
  splitCodeSections,
} from "./cityCode";

const FIXTURES = join(__dirname, "..", "fixtures");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const readBytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

const BASE = "https://www.ci.moscow.id.us";

describe("parseCodeIndex against the real City Code page", () => {
  const chapters = parseCodeIndex(readFixture("city-code-index.html"), BASE);

  it("finds the whole code", () => {
    expect(chapters.length).toBeGreaterThanOrEqual(120);
  });

  it("groups chapters under all eleven titles", () => {
    const titles = new Set(chapters.map((c) => c.titleLabel));
    expect(titles.size).toBe(11);
    expect(titles).toContain("Title 01");
    expect(titles).toContain("Title 04");
  });

  it("reads a known chapter exactly", () => {
    const landUses = chapters.find((c) => c.documentId === 1286);
    expect(landUses).toMatchObject({
      titleLabel: "Title 04",
      chapterLabel: "Chapter 03",
      chapterName: "Permitted Land Uses",
      slug: "title-04/chapter-03",
    });
    expect(landUses!.url).toBe(BASE + "/DocumentCenter/View/1286/Chapter-03---Permitted-Land-Uses-PDF");
  });

  it("strips the (PDF) suffix from chapter names", () => {
    for (const chapter of chapters) {
      expect(chapter.chapterName).not.toMatch(/\(PDF\)/i);
      expect(chapter.chapterName.length).toBeGreaterThan(0);
    }
  });

  it("gives every chapter a unique slug", () => {
    const slugs = chapters.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps chapters with the same number in different titles apart", () => {
    // "Chapter 01" exists under several titles; they must not collide.
    const firstChapters = chapters.filter((c) => c.chapterLabel === "Chapter 01");
    expect(firstChapters.length).toBeGreaterThan(1);
    expect(new Set(firstChapters.map((c) => c.slug)).size).toBe(firstChapters.length);
  });
});

describe("parseCodeCurrency", () => {
  it("reads the currency stamp from the real page", () => {
    expect(parseCodeCurrency(readFixture("city-code-index.html"))).toBe(
      "July 6, 2026, Ordinance 2026-04",
    );
  });

  it("returns null when absent", () => {
    expect(parseCodeCurrency("<p>Nothing here</p>")).toBeNull();
  });
});

describe("slugForChapter", () => {
  it("builds a stable key", () => {
    expect(slugForChapter("Title 04", "Chapter 03")).toBe("title-04/chapter-03");
  });
});

describe("normaliseSectionNumber", () => {
  it("collapses the spaced hyphen the PDF renders", () => {
    expect(normaliseSectionNumber("1 - 3")).toBe("1-3");
    expect(normaliseSectionNumber("§ 4 - 2A")).toBe("4-2A");
    expect(normaliseSectionNumber("1 - 1.")).toBe("1-1");
  });
});

describe("normaliseCodeText", () => {
  it("collapses the irregular spacing of justified two-column text", () => {
    expect(normaliseCodeText(["The   ordinances   contained   in   this"])).toBe(
      "The ordinances contained in this",
    );
  });

  it("strips repeated running heads", () => {
    const page = "§ 1 - 1   TITLE 1 — GENERAL   § 1 - 3  Sec. 1 - 1.  Repeal.";
    expect(normaliseCodeText([page])).not.toContain("TITLE 1");
    expect(normaliseCodeText([page])).toContain("Sec. 1 - 1.");
  });

  it("normalises curly quotes so a font change is not a law change", () => {
    expect(normaliseCodeText(["the “City” of ‘Moscow’"])).toBe(
      'the "City" of \'Moscow\'',
    );
  });
});

describe("parseOrdinanceCitations", () => {
  it("reads a single citation", () => {
    expect(parseOrdinanceCitations("(Ord. 2018 - 07, 05/21/2018)")).toEqual([
      { number: "2018-07", adoptedOn: "2018-05-21" },
    ]);
  });

  it("reads several citations from one parenthetical", () => {
    const found = parseOrdinanceCitations(
      "(Ord. 2018 - 07, 05/21/2018; 2019 - 07, 0 7/15/2019 ; 2026 - 04 , 07/06/2026 )",
    );
    expect(found.map((f) => f.number)).toEqual(["2026-04", "2019-07", "2018-07"]);
    expect(found[0].adoptedOn).toBe("2026-07-06");
  });

  it("survives digits broken apart by extraction", () => {
    // "0 7/15/2019" is what pdf extraction actually produces.
    const found = parseOrdinanceCitations("(Ord. 2019 - 07, 0 7/15/2019)");
    expect(found).toEqual([{ number: "2019-07", adoptedOn: "2019-07-15" }]);
  });

  it("keeps an ordinance whose date is missing", () => {
    expect(parseOrdinanceCitations("(Ord. 2021 - 09)")).toEqual([
      { number: "2021-09", adoptedOn: null },
    ]);
  });

  it("rejects an impossible date rather than inventing one", () => {
    const found = parseOrdinanceCitations("(Ord. 2020 - 01, 99/99/2020)");
    expect(found).toEqual([{ number: "2020-01", adoptedOn: null }]);
  });

  it("finds nothing in text without citations", () => {
    expect(parseOrdinanceCitations("No ordinances are mentioned here.")).toEqual([]);
  });

  it("de-duplicates an ordinance cited many times", () => {
    const found = parseOrdinanceCitations(
      "(Ord. 2018-07, 05/21/2018) some text (Ord. 2018-07, 05/21/2018)",
    );
    expect(found).toHaveLength(1);
  });
});

describe("looksLikePdf", () => {
  it("accepts a real PDF", () => {
    expect(looksLikePdf(readBytes("chapter-01.pdf"))).toBe(true);
  });

  it("rejects an HTML error page", () => {
    expect(looksLikePdf(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBe(false);
  });
});

describe("end to end on the real Chapter 01 PDF", () => {
  it("extracts, normalises, and splits into sections", async () => {
    const { pages, pageCount } = await extractPdfText(readBytes("chapter-01.pdf"));
    expect(pageCount).toBe(3);

    const text = normaliseCodeText(pages);
    expect(text).toContain("Repeal of Existing Ordinances");
    expect(text).not.toMatch(/TITLE\s+1\s+—\s+GENERAL/);

    const sections = splitCodeSections(text);
    expect(sections.map((s) => s.number)).toEqual(["1-1", "1-2", "1-3"]);
    expect(sections[0].heading).toContain("Repeal of Existing Ordinances");
    expect(sections[0].text.length).toBeGreaterThan(100);
  });

  it("reads the amendment history out of the chapter itself", async () => {
    const { pages } = await extractPdfText(readBytes("chapter-01.pdf"));
    const citations = parseOrdinanceCitations(normaliseCodeText(pages));
    expect(citations.map((c) => c.number)).toContain("2021-09");
    expect(citations.map((c) => c.number)).toContain("2009-04");
  });
});

describe("end to end on the real Permitted Land Uses PDF", () => {
  it("splits a long chapter into many sections", async () => {
    const { pages, pageCount } = await extractPdfText(readBytes("chapter-land-uses.pdf"));
    expect(pageCount).toBeGreaterThan(20);

    const sections = splitCodeSections(normaliseCodeText(pages));
    expect(sections.length).toBeGreaterThanOrEqual(3);
    for (const section of sections) {
      expect(section.number).toMatch(/^\d+-\d+[A-Za-z]?$/);
    }
  });

  it("finds the ordinance the code is currently updated through", async () => {
    const { pages } = await extractPdfText(readBytes("chapter-land-uses.pdf"));
    const citations = parseOrdinanceCitations(normaliseCodeText(pages));
    expect(citations.map((c) => c.number)).toContain("2026-04");
    expect(citations.find((c) => c.number === "2026-04")?.adoptedOn).toBe("2026-07-06");
  });
});

describe("parseChapterStatus", () => {
  it("recognises a repealed chapter and the ordinance that repealed it", () => {
    expect(
      parseChapterStatus("Chapter 11 <REPEALED> (Ord. 2021 - 09, 07/19/2021)"),
    ).toEqual({ status: "repealed", byOrdinance: "2021-09" });
  });

  it("survives the angle brackets being broken apart by extraction", () => {
    expect(parseChapterStatus("Chapter 3 BICYCLES < REPEALED > (Ord. 2022-11, 08/15/2022)")
      .status).toBe("repealed");
  });

  it("tolerates an unterminated marker", () => {
    // One real chapter reads "<REPEALED" with no closing bracket.
    expect(parseChapterStatus("Chapter 12 <REPEALED (Ord. 2021-09, 07/19/2021)").status).toBe(
      "repealed",
    );
  });

  it("recognises a reserved chapter, which cites no ordinance", () => {
    expect(parseChapterStatus("Chapter 8 < RESERVED >")).toEqual({
      status: "reserved",
      byOrdinance: null,
    });
  });

  it("recognises a moved chapter", () => {
    expect(
      parseChapterStatus("Chapter 4 RECREATIONAL VEHICLE PARKS < MOVED AND RESERVED > (Ord. 2020-01, 01/06/2020)")
        .status,
    ).toBe("moved");
  });

  it("treats a normal chapter as active", () => {
    expect(parseChapterStatus("Sec. 1-1. Repeal of Existing Ordinances. The ordinances...")).toEqual(
      { status: "active", byOrdinance: null },
    );
  });
});

describe("running head stripping on truncated references", () => {
  it("strips a head whose second reference is missing", () => {
    const text = normaliseCodeText([
      "§ 9 - TITLE 2 — ADMINISTRATION § 9 - Chapter 9 <REPEALED>",
    ]);
    expect(text).not.toContain("ADMINISTRATION");
    expect(text).toContain("<REPEALED>");
  });

  it("strips a head using underscore placeholders", () => {
    const text = normaliseCodeText([
      "§ 8 - ___ TITLE 7 — CONSTRUCTION REGULATIONS § 8 - ___ Chapter 8 < RESERVED >",
    ]);
    expect(text).not.toContain("CONSTRUCTION REGULATIONS");
    expect(text).toContain("RESERVED");
  });

  it("still strips the ordinary two-reference form", () => {
    const text = normaliseCodeText(["§ 1 - 1 TITLE 1 — GENERAL § 1 - 3 Sec. 1 - 1. Repeal."]);
    expect(text).not.toContain("TITLE 1");
    expect(text).toContain("Sec. 1 - 1.");
  });
});
