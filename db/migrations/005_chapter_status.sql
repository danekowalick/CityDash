-- A dozen chapters of the code are placeholders: "<REPEALED>", "<RESERVED>",
-- or "<MOVED AND RESERVED>". They parse to zero sections, which is correct --
-- there is no law in them -- but that is not the same as a parse failure, and
-- a reader looking for a rule that used to exist should be told it was
-- repealed and by which ordinance rather than shown an empty page.

ALTER TABLE code_versions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'repealed', 'reserved', 'moved'));

ALTER TABLE code_versions
  ADD COLUMN IF NOT EXISTS status_ordinance TEXT;

CREATE INDEX IF NOT EXISTS code_versions_status_idx ON code_versions (status);
