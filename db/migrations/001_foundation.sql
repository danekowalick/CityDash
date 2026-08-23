-- Foundation: source registry, run history, and the raw document store.
--
-- Design note: raw documents are stored BEFORE parsing and are never discarded.
-- CivicPlus markup will change and parsers will break; when that happens we
-- reparse from this table rather than re-crawling (which loses anything the
-- site has since rotated out of its archive).

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('api', 'rss', 'scrape', 'file')),
  cadence       TEXT NOT NULL,
  publisher     TEXT NOT NULL,
  -- Record of the terms-of-use review for this source. No scraper ships
  -- without a human writing something here first.
  terms_note    TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id            BIGSERIAL PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  items_seen    INTEGER NOT NULL DEFAULT 0,
  items_new     INTEGER NOT NULL DEFAULT 0,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS fetch_runs_source_started_idx
  ON fetch_runs (source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS raw_documents (
  id            BIGSERIAL PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  content_type  TEXT,
  body          TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (url, content_hash)
);

CREATE INDEX IF NOT EXISTS raw_documents_source_idx ON raw_documents (source_id, last_seen_at DESC);
