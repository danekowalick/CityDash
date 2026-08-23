/**
 * A small RSS 2.0 reader for the City of Moscow's syndication feeds.
 *
 * The city publishes an alert feed (ModID=76) and a calendar feed
 * (ModID=58). Both are plain RSS 2.0 with no extensions we need beyond the
 * calendar's event-date element, so a dependency-free reader is enough and
 * avoids pulling a parser in for two endpoints.
 *
 * Only titles, links, dates, and the city's own descriptions are kept. The
 * feeds are the city's, and we link back rather than republishing.
 */

import { decodeEntities, htmlToText } from "./html";

export interface RssItem {
  title: string;
  link: string | null;
  /** ISO timestamp, or null when the feed omits or mangles the date. */
  publishedAt: string | null;
  description: string | null;
  guid: string;
}

function tagContent(xml: string, tag: string): string | null {
  const pattern = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "i");
  const m = pattern.exec(xml);
  if (!m) return null;
  // CDATA is unwrapped; entity-escaped markup is decoded by the caller.
  const inner = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return inner.trim();
}

/** RFC 822 dates, which is what CivicPlus emits. */
function parseRssDate(raw: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const seen = new Set<string>();

  for (const chunk of xml.split(/<item[\s>]/i).slice(1)) {
    const body = chunk.slice(0, chunk.search(/<\/item>/i) === -1 ? undefined : chunk.search(/<\/item>/i));

    const title = tagContent(body, "title");
    if (!title) continue;

    const link = tagContent(body, "link");
    const guid = tagContent(body, "guid") ?? link ?? title;
    if (seen.has(guid)) continue;
    seen.add(guid);

    const rawDescription = tagContent(body, "description");

    items.push({
      title: decodeEntities(title).replace(/\s+/g, " ").trim(),
      link: link ? decodeEntities(link).trim() : null,
      publishedAt: parseRssDate(tagContent(body, "pubDate")),
      // Descriptions carry entity-escaped HTML; flatten to text.
      description: rawDescription
        ? htmlToText(decodeEntities(rawDescription)).replace(/\s+/g, " ").trim() || null
        : null,
      guid: decodeEntities(guid).trim(),
    });
  }

  return items;
}
