-- Phase 1 domain tables: police incidents and public meetings.

-- One row per incident line in an MPD daily press log.
--
-- These are CALLS FOR SERVICE, not charges or convictions. Addresses are
-- block-level as published (e.g. "700 BLK BRENT DR") and are stored exactly
-- as published -- we never attempt to resolve them to a household. No names.
CREATE TABLE IF NOT EXISTS incidents (
  case_number     TEXT PRIMARY KEY,
  log_date        DATE NOT NULL,
  incident_type   TEXT NOT NULL,
  block_address   TEXT,
  city_line       TEXT,
  disposition     TEXT,
  time_reported   TIME,
  cad_comments    TEXT,
  source_url      TEXT NOT NULL,
  raw_document_id BIGINT REFERENCES raw_documents(id) ON DELETE SET NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incidents_log_date_idx ON incidents (log_date DESC);
CREATE INDEX IF NOT EXISTS incidents_type_idx     ON incidents (incident_type);
CREATE INDEX IF NOT EXISTS incidents_type_date_idx ON incidents (incident_type, log_date DESC);

-- One row per published daily log, so we can show coverage and detect
-- days we are missing entirely.
CREATE TABLE IF NOT EXISTS press_logs (
  detail_id       INTEGER PRIMARY KEY,
  log_date        DATE NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  incident_count  INTEGER NOT NULL DEFAULT 0,
  -- Case numbers within a log run sequentially. Gaps mean the published log
  -- is incomplete -- we surface that rather than hiding it.
  case_gaps       INTEGER NOT NULL DEFAULT 0,
  raw_document_id BIGINT REFERENCES raw_documents(id) ON DELETE SET NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS press_logs_date_idx ON press_logs (log_date DESC);

-- Public meetings from the CivicClerk portal.
CREATE TABLE IF NOT EXISTS meetings (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  body            TEXT NOT NULL,
  description     TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  location        TEXT,
  agenda_url      TEXT,
  minutes_url     TEXT,
  youtube_id      TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT TRUE,
  source_url      TEXT NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_starts_at_idx ON meetings (starts_at DESC);
CREATE INDEX IF NOT EXISTS meetings_body_idx      ON meetings (body);

-- Documents attached to a meeting (agenda packets, minutes, staff reports).
CREATE TABLE IF NOT EXISTS meeting_documents (
  id              BIGSERIAL PRIMARY KEY,
  meeting_id      INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  url             TEXT NOT NULL,
  kind            TEXT,
  UNIQUE (meeting_id, url)
);
