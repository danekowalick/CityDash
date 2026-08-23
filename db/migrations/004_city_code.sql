-- Phase 3: the city code, its versions, and the changes between them.
--
-- The city publishes one PDF per chapter. We capture each chapter on a
-- schedule, hash it, and when the hash moves we store a new version and
-- compute a real text diff against the previous one.

-- A chapter of the code. Chapter numbers restart inside each Title -- there
-- are eleven "Chapter 01" chapters -- so the stable key is the pair, held as
-- a slug like "title-04/chapter-03".
--
-- document_id is deliberately NOT the key: the city issues a new CivicPlus
-- document id when it replaces a chapter, and treating that as a new chapter
-- would lose the very history we are trying to keep.
CREATE TABLE IF NOT EXISTS code_chapters (
  slug           TEXT PRIMARY KEY,
  title_label    TEXT NOT NULL,
  title_name     TEXT NOT NULL,
  chapter_label  TEXT NOT NULL,
  chapter_name   TEXT NOT NULL,
  document_id    INTEGER NOT NULL,
  url            TEXT NOT NULL,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_chapters_title_idx
  ON code_chapters (title_label, chapter_label);

-- One row per distinct capture of a chapter's text.
--
-- `sections` holds the parsed section array so a diff between any two
-- versions can be recomputed without re-downloading or re-extracting a PDF.
CREATE TABLE IF NOT EXISTS code_versions (
  id              BIGSERIAL PRIMARY KEY,
  chapter_slug    TEXT NOT NULL REFERENCES code_chapters(slug) ON DELETE CASCADE,
  -- Hash of the PDF bytes: the change signal published by the city.
  content_hash    TEXT NOT NULL,
  text            TEXT NOT NULL,
  sections        JSONB NOT NULL DEFAULT '[]'::jsonb,
  section_count   INTEGER NOT NULL DEFAULT 0,
  page_count      INTEGER NOT NULL DEFAULT 0,
  document_id     INTEGER,
  source_url      TEXT NOT NULL,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_document_id BIGINT REFERENCES raw_documents(id) ON DELETE SET NULL,
  UNIQUE (chapter_slug, content_hash)
);

CREATE INDEX IF NOT EXISTS code_versions_chapter_idx
  ON code_versions (chapter_slug, captured_at DESC);

-- A detected change between two consecutive versions of a chapter. Counts are
-- stored so the "recent changes" feed is cheap; the diff itself is recomputed
-- from the two versions' sections when a reader opens it.
CREATE TABLE IF NOT EXISTS code_changes (
  id               BIGSERIAL PRIMARY KEY,
  chapter_slug     TEXT NOT NULL REFERENCES code_chapters(slug) ON DELETE CASCADE,
  from_version_id  BIGINT NOT NULL REFERENCES code_versions(id) ON DELETE CASCADE,
  to_version_id    BIGINT NOT NULL REFERENCES code_versions(id) ON DELETE CASCADE,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sections_added   INTEGER NOT NULL DEFAULT 0,
  sections_removed INTEGER NOT NULL DEFAULT 0,
  sections_changed INTEGER NOT NULL DEFAULT 0,
  words_added      INTEGER NOT NULL DEFAULT 0,
  words_removed    INTEGER NOT NULL DEFAULT 0,
  -- True when the text moved but no section boundary explains it.
  unstructured     BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (from_version_id, to_version_id)
);

CREATE INDEX IF NOT EXISTS code_changes_detected_idx ON code_changes (detected_at DESC);

-- Ordinances, read out of the chapter text itself. Each chapter cites the
-- ordinances that amended it, e.g. "(Ord. 2018-07, 05/21/2018; 2026-04,
-- 07/06/2026)", which gives an amendment history without needing the
-- Document Center's ordinance folders.
CREATE TABLE IF NOT EXISTS ordinances (
  number      TEXT PRIMARY KEY,
  adopted_on  DATE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ordinances_adopted_idx ON ordinances (adopted_on DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS ordinance_citations (
  ordinance_number TEXT NOT NULL REFERENCES ordinances(number) ON DELETE CASCADE,
  chapter_slug     TEXT NOT NULL REFERENCES code_chapters(slug) ON DELETE CASCADE,
  PRIMARY KEY (ordinance_number, chapter_slug)
);

CREATE INDEX IF NOT EXISTS ordinance_citations_chapter_idx
  ON ordinance_citations (chapter_slug);

-- The city stamps its code index with what it is current through, e.g.
-- "July 6, 2026, Ordinance 2026-04". One row.
CREATE TABLE IF NOT EXISTS code_currency (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stamp      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
