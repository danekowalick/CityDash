import { describe, expect, it } from "vitest";

import { stripNulls } from "./pdf";

/** A real U+0000, built rather than typed so it cannot be lost in an edit. */
const NUL = String.fromCharCode(0);

describe("stripNulls", () => {
  it("removes a NUL that a badly embedded font put into a glyph run", () => {
    // Postgres rejects these outright with
    //   invalid byte sequence for encoding "UTF8": 0x00
    // and one such page aborted a whole packet insert in production.
    expect(stripNulls("Professional" + NUL + " Services")).toBe("Professional Services");
  });

  it("removes every occurrence, not just the first", () => {
    expect(stripNulls(NUL + "a" + NUL + "b" + NUL)).toBe("ab");
  });

  it("leaves ordinary text alone", () => {
    const text = "Moore Elia Kraft & Stacey, LLP  $5,061.00";
    expect(stripNulls(text)).toBe(text);
  });

  it("leaves other whitespace and control characters alone", () => {
    // Only 0x00 is unstorable; tabs and newlines are meaningful and legal.
    expect(stripNulls("a\tb\nc")).toBe("a\tb\nc");
  });
});
