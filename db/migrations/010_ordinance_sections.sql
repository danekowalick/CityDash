-- Which sections of the code an ordinance amended, not just which chapters.
--
-- The citation an ordinance leaves behind sits at the end of the individual
-- section it changed -- "(Ord. 2018-07, 05/21/2018; 2026-04, 07/06/2026)" --
-- so attribution can be section-level. Chapter-level was as far as the first
-- pass went, which told a reader that Ordinance 2021-09 touched 22 chapters
-- without saying which of the ~900 sections in them actually moved.
--
-- This does not give a before-and-after. That needs two captures of the same
-- chapter, and the first capture of each was taken in August 2026, so real
-- diffs only exist for amendments made from then on. What this does give is
-- the language each section carries *because of* that ordinance.

CREATE TABLE IF NOT EXISTS ordinance_sections (
  ordinance_number TEXT NOT NULL,
  chapter_slug     TEXT NOT NULL,
  section_number   TEXT NOT NULL,
  section_heading  TEXT,
  PRIMARY KEY (ordinance_number, chapter_slug, section_number)
);

CREATE INDEX IF NOT EXISTS ordinance_sections_ord_idx
  ON ordinance_sections (ordinance_number);
CREATE INDEX IF NOT EXISTS ordinance_sections_chapter_idx
  ON ordinance_sections (chapter_slug);
