import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseRss } from "./rss";

const FIXTURES = join(__dirname, "..", "fixtures");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("parseRss", () => {
  it("reads a minimal feed", () => {
    const items = parseRss(`<rss><channel>
      <item>
        <title>Public Hearing Notices</title>
        <link>https://www.ci.moscow.id.us/593</link>
        <pubDate>Fri, 21 Aug 2026 14:50 -0800</pubDate>
        <description>Current public hearing notices.</description>
        <guid>https://www.ci.moscow.id.us/593</guid>
      </item>
    </channel></rss>`);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Public Hearing Notices");
    expect(items[0].link).toBe("https://www.ci.moscow.id.us/593");
    expect(items[0].description).toBe("Current public hearing notices.");
    expect(items[0].publishedAt).toMatch(/^2026-08-21T/);
  });

  it("flattens entity-escaped markup in a description", () => {
    const items = parseRss(`<rss><channel><item>
      <title>Meeting</title>
      <description>&lt;strong&gt;Event date:&lt;/strong&gt; September 3, 2026&lt;br&gt;Second Floor</description>
    </item></channel></rss>`);
    expect(items[0].description).toContain("Event date: September 3, 2026");
    expect(items[0].description).not.toContain("<strong>");
  });

  it("unwraps CDATA", () => {
    const items = parseRss(`<rss><channel><item>
      <title><![CDATA[Snow & Ice Removal]]></title>
    </item></channel></rss>`);
    expect(items[0].title).toBe("Snow & Ice Removal");
  });

  it("decodes entities in titles", () => {
    const items = parseRss(`<rss><channel><item>
      <title>Parks &amp; Recreation</title>
    </item></channel></rss>`);
    expect(items[0].title).toBe("Parks & Recreation");
  });

  it("returns null rather than an invalid date", () => {
    const items = parseRss(`<rss><channel><item>
      <title>Undated</title><pubDate>not a date</pubDate>
    </item></channel></rss>`);
    expect(items[0].publishedAt).toBeNull();
  });

  it("de-duplicates repeated guids", () => {
    const item = `<item><title>A</title><guid>same</guid></item>`;
    expect(parseRss(`<rss><channel>${item}${item}</channel></rss>`)).toHaveLength(1);
  });

  it("skips an item with no title", () => {
    expect(parseRss(`<rss><channel><item><link>x</link></item></channel></rss>`)).toEqual([]);
  });

  it("returns nothing for an empty or malformed document", () => {
    expect(parseRss("")).toEqual([]);
    expect(parseRss("<html>not rss</html>")).toEqual([]);
  });
});

describe("against the real city feeds", () => {
  it("reads the alert feed", () => {
    const items = parseRss(readFixture("city-news-rss.xml"));
    expect(items.length).toBeGreaterThanOrEqual(40);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.guid.length).toBeGreaterThan(0);
    }
    expect(items.some((i) => i.title.includes("Public Hearing"))).toBe(true);
    expect(items.filter((i) => i.publishedAt !== null).length).toBeGreaterThan(0);
  });

  it("reads the calendar feed and flattens its event description", () => {
    const items = parseRss(readFixture("city-calendar-rss.xml"));
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].description).toContain("Event date:");
    expect(items[0].description).not.toContain("&lt;");
  });
});
