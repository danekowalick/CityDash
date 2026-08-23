-- MPD sometimes publishes more than one News Flash article covering the same
-- calendar date -- a partial log posted early, then a fuller one, or a
-- correction. The original UNIQUE(log_date) rejected the second article and
-- aborted the whole ingestion run.
--
-- The published article (detail_id) is the real identity, so that stays the
-- primary key and log_date becomes a plain indexed column. Reads pick the
-- fullest article for each date via DISTINCT ON.
--
-- Incidents are unaffected: they are keyed by case_number, which is globally
-- unique, so a re-published log updates rows rather than duplicating them.

ALTER TABLE press_logs DROP CONSTRAINT IF EXISTS press_logs_log_date_key;

CREATE INDEX IF NOT EXISTS press_logs_date_fullest_idx
  ON press_logs (log_date DESC, incident_count DESC);
