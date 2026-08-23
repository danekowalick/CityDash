-- Meeting outcomes: what each body actually decided.
--
-- Parsed from the minutes PDFs the city publishes through CivicClerk. These
-- are the recorded decisions -- motions, who moved and seconded, the vote as
-- printed, and whether it carried.

CREATE TABLE IF NOT EXISTS meeting_minutes (
  meeting_id      INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  minutes_url     TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  text            TEXT,
  page_count      INTEGER NOT NULL DEFAULT 0,
  -- Some minutes are scanned images with no text layer (the Human Rights
  -- Commission's, for one). Recording that explicitly matters: a meeting we
  -- cannot read is not a meeting that decided nothing.
  is_scanned      BOOLEAN NOT NULL DEFAULT FALSE,
  motion_count    INTEGER NOT NULL DEFAULT 0,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_document_id BIGINT REFERENCES raw_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS meeting_minutes_scanned_idx ON meeting_minutes (is_scanned);

CREATE TABLE IF NOT EXISTS motions (
  id               BIGSERIAL PRIMARY KEY,
  meeting_id       INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sequence         INTEGER NOT NULL,
  -- Null when the minutes used a pronoun ("He moved to approve...").
  -- Recording "He" as a member's name would attribute a vote to nobody.
  mover            TEXT,
  seconder         TEXT,
  action           TEXT NOT NULL,
  outcome          TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (outcome IN ('carried', 'failed', 'tabled', 'withdrawn', 'unknown')),
  -- Vote as printed. Kept verbatim alongside the parsed counts so a reader can
  -- always see the original wording.
  ayes_raw         TEXT,
  nays_raw         TEXT,
  abstentions_raw  TEXT,
  -- Null when the minutes say "Unanimous", which states no number.
  aye_count        INTEGER,
  nay_count        INTEGER,
  unanimous        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (meeting_id, sequence)
);

CREATE INDEX IF NOT EXISTS motions_meeting_idx ON motions (meeting_id, sequence);
CREATE INDEX IF NOT EXISTS motions_outcome_idx ON motions (outcome);

CREATE TABLE IF NOT EXISTS agenda_items (
  id          BIGSERIAL PRIMARY KEY,
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT NOT NULL,
  kind        TEXT,
  UNIQUE (meeting_id, number)
);

CREATE INDEX IF NOT EXISTS agenda_items_meeting_idx ON agenda_items (meeting_id, number);
