import { describe, expect, it } from "vitest";
import { likeTerm } from "./queries";

/**
 * These guard a bug that shipped once: the LIKE escape was written with a
 * backslash, which did not survive the TypeScript string literal on its way
 * into SQL. Searching for "%" matched all 1,178 rows instead of none.
 */
describe("likeTerm", () => {
  it("wraps an ordinary term in wildcards", () => {
    expect(likeTerm("solar")).toBe("%solar%");
  });

  it("trims surrounding whitespace", () => {
    expect(likeTerm("  solar  ")).toBe("%solar%");
  });

  it("escapes a percent so it matches a literal percent", () => {
    // Motions really do say "not to exceed 10% of the estimated amount".
    expect(likeTerm("10%")).toBe("%10!%%");
  });

  it("escapes an underscore so it is not a single-character wildcard", () => {
    expect(likeTerm("a_b")).toBe("%a!_b%");
  });

  it("escapes the escape character itself", () => {
    expect(likeTerm("!")).toBe("%!!%");
  });

  it("escapes the escape character before the wildcards it introduces", () => {
    // If "!" were escaped last it would double the "!" added for "%".
    expect(likeTerm("!%")).toBe("%!!!%%");
  });

  it("leaves case numbers and parcels untouched", () => {
    expect(likeTerm("CUP26-018")).toBe("%CUP26-018%");
    expect(likeTerm("RP41N04W284438")).toBe("%RP41N04W284438%");
  });

  it("handles an empty term", () => {
    expect(likeTerm("   ")).toBe("%%");
  });
});
