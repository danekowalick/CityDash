import { describe, expect, it } from "vitest";
import { hashContent, parseRobots, robotsAllows } from "./fetcher";

const AGENT = "CityDashBot/0.1 (+https://example.org/citydash; contact@example.org)";

describe("parseRobots", () => {
  it("reads the wildcard group", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /admin", "Disallow: /private", "Crawl-delay: 2"].join("\n"),
      AGENT,
    );
    expect(rules.disallow).toEqual(["/admin", "/private"]);
    expect(rules.crawlDelayMs).toBe(2000);
  });

  it("prefers a group naming our agent over the wildcard", () => {
    const rules = parseRobots(
      [
        "User-agent: *",
        "Disallow: /",
        "",
        "User-agent: CityDashBot",
        "Disallow: /secret",
        "Crawl-delay: 5",
      ].join("\n"),
      AGENT,
    );
    expect(rules.disallow).toEqual(["/secret"]);
    expect(rules.crawlDelayMs).toBe(5000);
  });

  it("applies a group shared by consecutive user-agent lines", () => {
    const rules = parseRobots(
      ["User-agent: SomeBot", "User-agent: *", "Disallow: /nope"].join("\n"),
      AGENT,
    );
    expect(rules.disallow).toEqual(["/nope"]);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots(
      ["# a comment", "User-agent: *", "Disallow: /x # trailing", "", "Allow: /x/ok"].join("\n"),
      AGENT,
    );
    expect(rules.disallow).toEqual(["/x"]);
    expect(rules.allow).toEqual(["/x/ok"]);
  });

  it("returns empty rules for an empty file", () => {
    expect(parseRobots("", AGENT)).toEqual({ disallow: [], allow: [], crawlDelayMs: null });
  });

  it("does not treat a bare Disallow as blocking everything", () => {
    const rules = parseRobots(["User-agent: *", "Disallow:"].join("\n"), AGENT);
    expect(rules.disallow).toEqual([]);
    expect(robotsAllows(rules, "/anything")).toBe(true);
  });
});

describe("robotsAllows", () => {
  const rules = parseRobots(
    ["User-agent: *", "Disallow: /admin", "Allow: /admin/public"].join("\n"),
    AGENT,
  );

  it("allows an unlisted path", () => {
    expect(robotsAllows(rules, "/m/newsflash/Home/Detail/4354")).toBe(true);
  });

  it("blocks a disallowed path", () => {
    expect(robotsAllows(rules, "/admin/settings")).toBe(false);
  });

  it("lets a more specific Allow override a Disallow", () => {
    expect(robotsAllows(rules, "/admin/public/report")).toBe(true);
  });
});

describe("hashContent", () => {
  it("is stable for identical input and differs otherwise", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
    expect(hashContent("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});
