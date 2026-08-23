-- City announcements, closures, and public hearing notices, from the
-- syndication feeds the city publishes for exactly this purpose.
--
-- Titles, dates, links, and the city's own one-line descriptions only. We
-- link back to the city rather than republishing its pages.

CREATE TABLE IF NOT EXISTS city_news (
  guid         TEXT PRIMARY KEY,
  feed         TEXT NOT NULL,
  title        TEXT NOT NULL,
  link         TEXT,
  description  TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS city_news_published_idx
  ON city_news (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS city_news_feed_idx ON city_news (feed);
