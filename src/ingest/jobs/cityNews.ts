/**
 * Ingests the City of Moscow's RSS feeds: alerts and announcements, and the
 * calendar feed.
 *
 * These are syndication feeds the city publishes for reuse, so this is the
 * least intrusive source on the site -- no scraping, and we keep only what a
 * feed reader would.
 */

import { politeFetch } from "../../lib/fetcher";
import { transaction } from "../../lib/db";
import { parseRss } from "../../lib/parsers/rss";
import { finishRun, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "city-news-rss";

const FEEDS: Array<{ name: string; url: string }> = [
  { name: "alerts", url: "https://www.ci.moscow.id.us/RSSFeed.aspx?ModID=76&CID=All" },
  { name: "calendar", url: "https://www.ci.moscow.id.us/RSSFeed.aspx?ModID=58&CID=All" },
];

export async function ingestCityNews(): Promise<void> {
  const runId = await startRun(SOURCE_ID);
  let itemsSeen = 0;
  let itemsNew = 0;

  try {
    for (const feed of FEEDS) {
      const document = await politeFetch(feed.url, { accept: "application/rss+xml,text/xml" });
      await storeRawDocument(SOURCE_ID, document);

      const items = parseRss(document.body);
      itemsSeen += items.length;

      await transaction(async (client) => {
        for (const item of items) {
          const result = await client.query(
            `INSERT INTO city_news (guid, feed, title, link, description, published_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guid) DO UPDATE SET
               title = EXCLUDED.title,
               link = EXCLUDED.link,
               description = EXCLUDED.description,
               published_at = EXCLUDED.published_at,
               last_seen_at = now()
             RETURNING (xmax = 0) AS inserted`,
            [item.guid, feed.name, item.title, item.link, item.description, item.publishedAt],
          );
          if (result.rows[0]?.inserted) itemsNew++;
        }
      });

      console.log("  " + feed.name + ": " + items.length + " items");
    }

    console.log("Done: " + itemsSeen + " items seen, " + itemsNew + " new.");
    await finishRun(runId, "ok", { itemsSeen, itemsNew });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen, itemsNew, error: message });
    throw error;
  }
}
