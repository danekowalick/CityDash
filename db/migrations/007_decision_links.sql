-- The Decision Tracker: joining a council decision to the law it changed.
--
-- Two links make the chain, and both are deterministic:
--
--   1. Ordinance -> adopting meeting, by date. Chapter PDFs print the
--      adoption date, e.g. "(Ord. 2026-04, 07/06/2026)", and the Council met
--      that evening. This is an exact date equality and needs no table --
--      it is computed at query time so it stays current as meetings arrive.
--
--   2. Meeting -> code chapters, from the minutes text. Council agenda items
--      name what they amend: "Ordinance Amending Moscow City Code Title 4,
--      Chapters 1, 3, 4, and 6". Those references are extracted at ingest
--      and stored here.
--
-- Nothing is inferred. A chapter appears against a meeting only because the
-- minutes named it.

CREATE TABLE IF NOT EXISTS meeting_code_references (
  meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  chapter_slug TEXT NOT NULL,
  PRIMARY KEY (meeting_id, chapter_slug)
);

CREATE INDEX IF NOT EXISTS meeting_code_refs_chapter_idx
  ON meeting_code_references (chapter_slug);

-- Deliberately no foreign key to code_chapters: the minutes can cite a
-- chapter that has since been repealed and removed from the index, and
-- losing the reference would erase the very history this table exists to
-- keep. Joins tolerate a missing chapter.
