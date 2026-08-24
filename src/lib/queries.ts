/**
 * Read-side data access for the site.
 *
 * Every query is wrapped so an unreachable or un-migrated database renders an
 * honest empty state instead of a stack trace. A civic site that says "no data
 * yet" is far better than one that 500s, and it lets the UI be developed and
 * reviewed before ingestion has ever run.
 */

import type { QueryResultRow } from "pg";

import { query } from "./db";
import { describeError } from "./errors";

export interface DataResult<T> {
  rows: T[];
  /** Set when the database could not be read. Surfaced on /sources. */
  error: string | null;
}

async function safeQuery<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<DataResult<T>> {
  try {
    return { rows: (await query(sql, params)) as T[], error: null };
  } catch (error) {
    // describeError guarantees a non-empty string, so an unreachable
    // database can never be mistaken by the UI for an empty one.
    return { rows: [], error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Police
// ---------------------------------------------------------------------------

export interface IncidentRow {
  case_number: string;
  log_date: Date;
  incident_type: string;
  block_address: string | null;
  disposition: string | null;
  time_reported: string | null;
  cad_comments: string | null;
  source_url: string;
}

export function recentIncidents(limit = 60, type?: string) {
  if (type) {
    return safeQuery<IncidentRow>(
      `SELECT case_number, log_date, incident_type, block_address, disposition,
              time_reported, cad_comments, source_url
         FROM incidents
        WHERE incident_type = $2
        ORDER BY log_date DESC, time_reported DESC NULLS LAST
        LIMIT $1`,
      [limit, type],
    );
  }
  return safeQuery<IncidentRow>(
    `SELECT case_number, log_date, incident_type, block_address, disposition,
            time_reported, cad_comments, source_url
       FROM incidents
      ORDER BY log_date DESC, time_reported DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
}

export interface IncidentTypeCount {
  incident_type: string;
  total: string;
}

export function incidentTypeCounts(days = 30) {
  return safeQuery<IncidentTypeCount>(
    `SELECT incident_type, COUNT(*) AS total
       FROM incidents
      WHERE log_date >= CURRENT_DATE - ($1::int)
      GROUP BY incident_type
      ORDER BY total DESC, incident_type ASC`,
    [days],
  );
}

export interface LatestLogRow {
  log_date: Date;
  title: string;
  incident_count: number;
  case_gaps: number;
  source_url: string;
}

export function latestPressLog() {
  return safeQuery<LatestLogRow>(
    `SELECT DISTINCT ON (log_date)
            log_date, title, incident_count, case_gaps, source_url
       FROM press_logs
      ORDER BY log_date DESC, incident_count DESC
      LIMIT 1`,
  );
}

export function pressLogCoverage(limit = 30) {
  return safeQuery<LatestLogRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (log_date)
              log_date, title, incident_count, case_gaps, source_url
         FROM press_logs
        ORDER BY log_date DESC, incident_count DESC
     ) fullest
      ORDER BY log_date DESC
      LIMIT $1`,
    [limit],
  );
}

export interface HourBucket {
  hour: number;
  total: string;
}

export function incidentsByHour(days = 90) {
  return safeQuery<HourBucket>(
    `SELECT EXTRACT(HOUR FROM time_reported)::int AS hour, COUNT(*) AS total
       FROM incidents
      WHERE time_reported IS NOT NULL
        AND log_date >= CURRENT_DATE - ($1::int)
      GROUP BY hour
      ORDER BY hour`,
    [days],
  );
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export interface MeetingRow {
  id: number;
  name: string;
  body: string;
  description: string | null;
  starts_at: Date;
  location: string | null;
  agenda_url: string | null;
  minutes_url: string | null;
  youtube_id: string | null;
  source_url: string;
  document_count: string;
}

const MEETING_COLUMNS = `
  m.id, m.name, m.body, m.description, m.starts_at, m.location,
  m.agenda_url, m.minutes_url, m.youtube_id, m.source_url,
  (SELECT COUNT(*) FROM meeting_documents d WHERE d.meeting_id = m.id) AS document_count
`;

export function upcomingMeetings(limit = 20) {
  return safeQuery<MeetingRow>(
    `SELECT ${MEETING_COLUMNS}
       FROM meetings m
      WHERE m.starts_at >= now() AND m.is_published
      ORDER BY m.starts_at ASC
      LIMIT $1`,
    [limit],
  );
}

export function pastMeetings(limit = 30) {
  return safeQuery<MeetingRow>(
    `SELECT ${MEETING_COLUMNS}
       FROM meetings m
      WHERE m.starts_at < now() AND m.is_published
      ORDER BY m.starts_at DESC
      LIMIT $1`,
    [limit],
  );
}

// ---------------------------------------------------------------------------
// Source health
// ---------------------------------------------------------------------------

export interface SourceHealthRow {
  id: string;
  name: string;
  url: string;
  kind: string;
  cadence: string;
  publisher: string;
  terms_note: string | null;
  enabled: boolean;
  last_status: string | null;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  last_error: string | null;
  last_items_new: number | null;
}

export function sourceHealth() {
  return safeQuery<SourceHealthRow>(
    `SELECT s.id, s.name, s.url, s.kind, s.cadence, s.publisher, s.terms_note, s.enabled,
            r.status      AS last_status,
            r.started_at  AS last_started_at,
            r.finished_at AS last_finished_at,
            r.error       AS last_error,
            r.items_new   AS last_items_new
       FROM sources s
       LEFT JOIN LATERAL (
         SELECT status, started_at, finished_at, error, items_new
           FROM fetch_runs
          WHERE source_id = s.id
          ORDER BY started_at DESC
          LIMIT 1
       ) r ON TRUE
      ORDER BY s.enabled DESC, s.name ASC`,
  );
}

export interface CoverageStats {
  incident_count: string;
  log_count: string;
  meeting_count: string;
  earliest_log: Date | null;
  latest_log: Date | null;
  total_gaps: string;
}

export function coverageStats() {
  return safeQuery<CoverageStats>(
    `SELECT
       (SELECT COUNT(*) FROM incidents)              AS incident_count,
       (SELECT COUNT(DISTINCT log_date) FROM press_logs) AS log_count,
       (SELECT COUNT(*) FROM meetings)               AS meeting_count,
       (SELECT MIN(log_date) FROM press_logs)        AS earliest_log,
       (SELECT MAX(log_date) FROM press_logs)        AS latest_log,
       (SELECT COALESCE(SUM(case_gaps), 0) FROM (
          SELECT DISTINCT ON (log_date) case_gaps
            FROM press_logs ORDER BY log_date, incident_count DESC
        ) g) AS total_gaps`,
  );
}

// ---------------------------------------------------------------------------
// City code
// ---------------------------------------------------------------------------

export interface CodeChapterRow {
  slug: string;
  title_label: string;
  title_name: string;
  chapter_label: string;
  chapter_name: string;
  url: string;
  section_count: number | null;
  page_count: number | null;
  captured_at: Date | null;
  version_count: string;
  change_count: string;
}

const CHAPTER_COLUMNS = `
  c.slug, c.title_label, c.title_name, c.chapter_label, c.chapter_name, c.url,
  v.section_count, v.page_count, v.captured_at,
  (SELECT COUNT(*) FROM code_versions cv WHERE cv.chapter_slug = c.slug) AS version_count,
  (SELECT COUNT(*) FROM code_changes cc WHERE cc.chapter_slug = c.slug) AS change_count
`;

/** Every chapter, with its most recent capture. */
export function codeChapters() {
  return safeQuery<CodeChapterRow>(
    `SELECT ${CHAPTER_COLUMNS}
       FROM code_chapters c
       LEFT JOIN LATERAL (
         SELECT section_count, page_count, captured_at
           FROM code_versions
          WHERE chapter_slug = c.slug
          ORDER BY captured_at DESC
          LIMIT 1
       ) v ON TRUE
      ORDER BY c.title_label, c.chapter_label`,
  );
}

export function codeChapter(slug: string) {
  return safeQuery<CodeChapterRow>(
    `SELECT ${CHAPTER_COLUMNS}
       FROM code_chapters c
       LEFT JOIN LATERAL (
         SELECT section_count, page_count, captured_at
           FROM code_versions
          WHERE chapter_slug = c.slug
          ORDER BY captured_at DESC
          LIMIT 1
       ) v ON TRUE
      WHERE c.slug = $1`,
    [slug],
  );
}

export interface CodeChangeRow {
  id: string;
  chapter_slug: string;
  title_name: string;
  chapter_label: string;
  chapter_name: string;
  detected_at: Date;
  sections_added: number;
  sections_removed: number;
  sections_changed: number;
  words_added: number;
  words_removed: number;
  unstructured: boolean;
  from_version_id: string;
  to_version_id: string;
}

export function recentCodeChanges(limit = 25) {
  return safeQuery<CodeChangeRow>(
    `SELECT ch.id, ch.chapter_slug, c.title_name, c.chapter_label, c.chapter_name,
            ch.detected_at, ch.sections_added, ch.sections_removed, ch.sections_changed,
            ch.words_added, ch.words_removed, ch.unstructured,
            ch.from_version_id, ch.to_version_id
       FROM code_changes ch
       JOIN code_chapters c ON c.slug = ch.chapter_slug
      ORDER BY ch.detected_at DESC
      LIMIT $1`,
    [limit],
  );
}

export interface CodeVersionRow {
  id: string;
  content_hash: string;
  text: string;
  sections: unknown;
  section_count: number;
  page_count: number;
  captured_at: Date;
  source_url: string;
  status: "active" | "repealed" | "reserved" | "moved";
  status_ordinance: string | null;
}

const VERSION_COLUMNS = `
  id, content_hash, text, sections, section_count, page_count,
  captured_at, source_url, status, status_ordinance
`;

export function codeVersions(slug: string, limit = 20) {
  return safeQuery<CodeVersionRow>(
    `SELECT ${VERSION_COLUMNS}
       FROM code_versions
      WHERE chapter_slug = $1
      ORDER BY captured_at DESC
      LIMIT $2`,
    [slug, limit],
  );
}

export function codeVersionPair(fromId: string, toId: string) {
  return safeQuery<CodeVersionRow>(
    `SELECT ${VERSION_COLUMNS}
       FROM code_versions
      WHERE id = $1 OR id = $2`,
    [fromId, toId],
  );
}

export interface OrdinanceRow {
  number: string;
  adopted_on: Date | null;
  chapter_count: string;
}

export function ordinances(limit = 60) {
  return safeQuery<OrdinanceRow>(
    `SELECT o.number, o.adopted_on,
            (SELECT COUNT(*) FROM ordinance_citations oc WHERE oc.ordinance_number = o.number)
              AS chapter_count
       FROM ordinances o
      ORDER BY o.adopted_on DESC NULLS LAST, o.number DESC
      LIMIT $1`,
    [limit],
  );
}

export interface OrdinanceChapterRow {
  ordinance_number: string;
  slug: string;
  title_name: string;
  chapter_label: string;
  chapter_name: string;
}

export function chaptersAmendedBy(ordinanceNumber: string) {
  return safeQuery<OrdinanceChapterRow>(
    `SELECT oc.ordinance_number, c.slug, c.title_name, c.chapter_label, c.chapter_name
       FROM ordinance_citations oc
       JOIN code_chapters c ON c.slug = oc.chapter_slug
      WHERE oc.ordinance_number = $1
      ORDER BY c.title_label, c.chapter_label`,
    [ordinanceNumber],
  );
}

export function ordinancesForChapter(slug: string) {
  return safeQuery<OrdinanceRow>(
    `SELECT o.number, o.adopted_on, '0'::text AS chapter_count
       FROM ordinance_citations oc
       JOIN ordinances o ON o.number = oc.ordinance_number
      WHERE oc.chapter_slug = $1
      ORDER BY o.adopted_on DESC NULLS LAST, o.number DESC`,
    [slug],
  );
}

export interface CodeCurrencyRow {
  stamp: string | null;
  updated_at: Date;
}

export function codeCurrency() {
  return safeQuery<CodeCurrencyRow>(`SELECT stamp, updated_at FROM code_currency WHERE id = 1`);
}

// ---------------------------------------------------------------------------
// Meeting outcomes
// ---------------------------------------------------------------------------

export interface MotionRow {
  id: string;
  meeting_id: number;
  sequence: number;
  mover: string | null;
  seconder: string | null;
  action: string;
  outcome: "carried" | "failed" | "tabled" | "withdrawn" | "unknown";
  ayes_raw: string | null;
  nays_raw: string | null;
  abstentions_raw: string | null;
  aye_count: number | null;
  nay_count: number | null;
  unanimous: boolean;
}

export function motionsForMeeting(meetingId: number) {
  return safeQuery<MotionRow>(
    `SELECT id, meeting_id, sequence, mover, seconder, action, outcome,
            ayes_raw, nays_raw, abstentions_raw, aye_count, nay_count, unanimous
       FROM motions
      WHERE meeting_id = $1
      ORDER BY sequence`,
    [meetingId],
  );
}

export interface RecentDecisionRow extends MotionRow {
  body: string;
  starts_at: Date;
  minutes_url: string | null;
  source_url: string;
}

/**
 * How a decisions listing is narrowed.
 *
 * "refusals" is not an outcome but a shape of motion: a motion *to deny*
 * something. It deserves its own filter because outcome alone is misleading
 * there -- a motion to deny that carried is the city voting something down,
 * while one that failed means the thing stood. Matching is a plain keyword
 * test on the motion text, not an interpretation of it.
 */
export type DecisionFilter =
  | "all"
  | "carried"
  | "failed"
  | "unstated"
  | "refusals";

const DECISION_CLAUSE: Record<DecisionFilter, string> = {
  all: "",
  carried: "AND mo.outcome = 'carried'",
  failed: "AND mo.outcome IN ('failed', 'withdrawn', 'tabled')",
  unstated: "AND mo.outcome = 'unknown'",
  refusals: "AND mo.action ~* '^(deny|denial|reject|refuse)'",
};

/** The newest recorded decisions across every body. */
export function recentDecisions(limit = 40, filter: DecisionFilter = "all") {
  const clause = DECISION_CLAUSE[filter] ?? "";
  return safeQuery<RecentDecisionRow>(
    `SELECT mo.id, mo.meeting_id, mo.sequence, mo.mover, mo.seconder, mo.action,
            mo.outcome, mo.ayes_raw, mo.nays_raw, mo.abstentions_raw,
            mo.aye_count, mo.nay_count, mo.unanimous,
            m.body, m.starts_at, m.minutes_url, m.source_url
       FROM motions mo
       JOIN meetings m ON m.id = mo.meeting_id
      WHERE TRUE ${clause}
      ORDER BY m.starts_at DESC, mo.sequence ASC
      LIMIT $1`,
    [limit],
  );
}

export interface DecisionFilterCounts {
  all: string;
  carried: string;
  failed: string;
  unstated: string;
  refusals: string;
}

export function decisionFilterCounts() {
  return safeQuery<DecisionFilterCounts>(
    `SELECT
       COUNT(*) AS all,
       COUNT(*) FILTER (WHERE outcome = 'carried') AS carried,
       COUNT(*) FILTER (WHERE outcome IN ('failed', 'withdrawn', 'tabled')) AS failed,
       COUNT(*) FILTER (WHERE outcome = 'unknown') AS unstated,
       COUNT(*) FILTER (WHERE action ~* '^(deny|denial|reject|refuse)') AS refusals
       FROM motions`,
  );
}

export interface AgendaItemRow {
  number: number;
  title: string;
  kind: string | null;
}

export function agendaItemsForMeeting(meetingId: number) {
  return safeQuery<AgendaItemRow>(
    `SELECT number, title, kind FROM agenda_items
      WHERE meeting_id = $1 ORDER BY number`,
    [meetingId],
  );
}

export interface MinutesRow {
  meeting_id: number;
  minutes_url: string;
  page_count: number;
  is_scanned: boolean;
  motion_count: number;
  captured_at: Date;
  text: string | null;
}

export function minutesForMeeting(meetingId: number) {
  return safeQuery<MinutesRow>(
    `SELECT meeting_id, minutes_url, page_count, is_scanned, motion_count, captured_at, text
       FROM meeting_minutes WHERE meeting_id = $1`,
    [meetingId],
  );
}

export interface OutcomeStats {
  meetings_read: string;
  motions_total: string;
  carried: string;
  failed: string;
  unstated: string;
  scanned: string;
}

export function outcomeStats() {
  return safeQuery<OutcomeStats>(
    `SELECT
       (SELECT COUNT(*) FROM meeting_minutes WHERE NOT is_scanned)        AS meetings_read,
       (SELECT COUNT(*) FROM motions)                                    AS motions_total,
       (SELECT COUNT(*) FROM motions WHERE outcome = 'carried')          AS carried,
       (SELECT COUNT(*) FROM motions WHERE outcome = 'failed')           AS failed,
       (SELECT COUNT(*) FROM motions WHERE outcome = 'unknown')          AS unstated,
       (SELECT COUNT(*) FROM meeting_minutes WHERE is_scanned)           AS scanned`,
  );
}

/** Per-meeting motion counts, for annotating the meetings list. */
export interface MeetingOutcomeSummary {
  meeting_id: number;
  motion_count: number;
  carried: string;
  is_scanned: boolean;
}

export function meetingOutcomeSummaries() {
  return safeQuery<MeetingOutcomeSummary>(
    `SELECT mm.meeting_id, mm.motion_count, mm.is_scanned,
            (SELECT COUNT(*) FROM motions mo
              WHERE mo.meeting_id = mm.meeting_id AND mo.outcome = 'carried') AS carried
       FROM meeting_minutes mm`,
  );
}

export function meetingById(id: number) {
  return safeQuery<MeetingRow>(
    `SELECT ${MEETING_COLUMNS} FROM meetings m WHERE m.id = $1`,
    [id],
  );
}

/**
 * Past meetings joined to what we managed to read from their minutes, so the
 * list can be filtered server-side to the ones actually worth opening.
 */
export type MeetingFilter = "all" | "decisions" | "pending";

export function pastMeetingsFiltered(limit = 40, filter: MeetingFilter = "all") {
  const clause =
    filter === "decisions"
      ? "AND mm.motion_count > 0 AND NOT mm.is_scanned"
      : filter === "pending"
        ? "AND mm.meeting_id IS NULL"
        : "";

  return safeQuery<MeetingRow>(
    `SELECT ${MEETING_COLUMNS}
       FROM meetings m
       LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id
      WHERE m.starts_at < now() AND m.is_published ${clause}
      ORDER BY m.starts_at DESC
      LIMIT $1`,
    [limit],
  );
}

export interface MeetingFilterCounts {
  all: string;
  with_decisions: string;
  pending: string;
  scanned: string;
}

export function meetingFilterCounts() {
  return safeQuery<MeetingFilterCounts>(
    `SELECT
       (SELECT COUNT(*) FROM meetings WHERE starts_at < now() AND is_published) AS all,
       (SELECT COUNT(*) FROM meetings m JOIN meeting_minutes mm ON mm.meeting_id = m.id
         WHERE m.starts_at < now() AND m.is_published AND mm.motion_count > 0 AND NOT mm.is_scanned)
         AS with_decisions,
       (SELECT COUNT(*) FROM meetings m LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id
         WHERE m.starts_at < now() AND m.is_published AND mm.meeting_id IS NULL) AS pending,
       (SELECT COUNT(*) FROM meeting_minutes WHERE is_scanned) AS scanned`,
  );
}

// ---------------------------------------------------------------------------
// Decision Tracker
// ---------------------------------------------------------------------------

export interface AdoptingMeetingRow {
  meeting_id: number;
  body: string;
  starts_at: Date;
  minutes_url: string | null;
  source_url: string;
  is_scanned: boolean | null;
  motion_count: number | null;
}

/**
 * The Council meeting that adopted an ordinance, matched on date.
 *
 * Chapter PDFs print the adoption date -- "(Ord. 2026-04, 07/06/2026)" -- and
 * the Council met that evening. The match is exact date equality; nothing is
 * inferred, and an ordinance adopted outside our meeting coverage simply
 * returns no row.
 */
export function adoptingMeeting(ordinanceNumber: string) {
  return safeQuery<AdoptingMeetingRow>(
    `SELECT m.id AS meeting_id, m.body, m.starts_at, m.minutes_url, m.source_url,
            mm.is_scanned, mm.motion_count
       FROM ordinances o
       JOIN meetings m
         ON m.starts_at::date = o.adopted_on
        AND m.body = 'City Council'
       LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id
      WHERE o.number = $1
      ORDER BY m.starts_at
      LIMIT 1`,
    [ordinanceNumber],
  );
}

export interface CodeReferenceRow {
  meeting_id: number;
  chapter_slug: string;
  title_name: string | null;
  chapter_label: string | null;
  chapter_name: string | null;
}

/** Chapters the minutes of a meeting explicitly named as being amended. */
export function codeReferencesForMeeting(meetingId: number) {
  return safeQuery<CodeReferenceRow>(
    `SELECT r.meeting_id, r.chapter_slug,
            c.title_name, c.chapter_label, c.chapter_name
       FROM meeting_code_references r
       LEFT JOIN code_chapters c ON c.slug = r.chapter_slug
      WHERE r.meeting_id = $1
      ORDER BY r.chapter_slug`,
    [meetingId],
  );
}

export interface ChapterDiscussionRow {
  meeting_id: number;
  body: string;
  starts_at: Date;
  chapter_slug: string;
  motion_count: number | null;
}

/**
 * Every meeting whose minutes named this chapter -- the trail of discussion
 * leading up to and including an amendment.
 */
export function discussionsForChapter(slug: string, limit = 20) {
  return safeQuery<ChapterDiscussionRow>(
    `SELECT r.meeting_id, m.body, m.starts_at, r.chapter_slug, mm.motion_count
       FROM meeting_code_references r
       JOIN meetings m ON m.id = r.meeting_id
       LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id
      WHERE r.chapter_slug = $1
      ORDER BY m.starts_at DESC
      LIMIT $2`,
    [slug, limit],
  );
}

export interface TrackedDecisionRow {
  number: string;
  adopted_on: Date;
  meeting_id: number;
  body: string;
  starts_at: Date;
  motion_count: number | null;
  chapter_count: string;
  referenced_count: string;
}

/**
 * Ordinances that can be followed end to end: adopted on a date we hold a
 * Council meeting for, with minutes read.
 */
export function trackedDecisions(limit = 40) {
  return safeQuery<TrackedDecisionRow>(
    `SELECT o.number, o.adopted_on, m.id AS meeting_id, m.body, m.starts_at,
            mm.motion_count,
            (SELECT COUNT(*) FROM ordinance_citations oc WHERE oc.ordinance_number = o.number)
              AS chapter_count,
            (SELECT COUNT(*) FROM meeting_code_references r WHERE r.meeting_id = m.id)
              AS referenced_count
       FROM ordinances o
       JOIN meetings m
         ON m.starts_at::date = o.adopted_on AND m.body = 'City Council'
       JOIN meeting_minutes mm ON mm.meeting_id = m.id AND NOT mm.is_scanned
      ORDER BY o.adopted_on DESC
      LIMIT $1`,
    [limit],
  );
}

export interface TrackerStats {
  linked: string;
  total_ordinances: string;
  code_refs: string;
}

export function trackerStats() {
  return safeQuery<TrackerStats>(
    `SELECT
       (SELECT COUNT(DISTINCT o.number)
          FROM ordinances o
          JOIN meetings m ON m.starts_at::date = o.adopted_on AND m.body = 'City Council'
          JOIN meeting_minutes mm ON mm.meeting_id = m.id AND NOT mm.is_scanned) AS linked,
       (SELECT COUNT(*) FROM ordinances) AS total_ordinances,
       (SELECT COUNT(*) FROM meeting_code_references) AS code_refs`,
  );
}

// ---------------------------------------------------------------------------
// City news and the civic calendar
// ---------------------------------------------------------------------------

export interface CityNewsRow {
  guid: string;
  feed: string;
  title: string;
  link: string | null;
  description: string | null;
  published_at: Date | null;
}

export function cityNews(limit = 30, feed?: string) {
  if (feed) {
    return safeQuery<CityNewsRow>(
      `SELECT guid, feed, title, link, description, published_at
         FROM city_news WHERE feed = $2
        ORDER BY published_at DESC NULLS LAST, title
        LIMIT $1`,
      [limit, feed],
    );
  }
  return safeQuery<CityNewsRow>(
    `SELECT guid, feed, title, link, description, published_at
       FROM city_news
      ORDER BY published_at DESC NULLS LAST, title
      LIMIT $1`,
    [limit],
  );
}

export interface CalendarEntryRow {
  id: number;
  body: string;
  starts_at: Date;
  location: string | null;
  agenda_url: string | null;
  source_url: string;
  has_agenda: boolean;
}

/**
 * The civic calendar: every published meeting ahead, which is the spine a
 * resident actually needs. Social events are folded in once a workable
 * source exists -- the city's calendar feed currently carries one item.
 */
export function upcomingCalendar(days = 60, limit = 200) {
  return safeQuery<CalendarEntryRow>(
    `SELECT m.id, m.body, m.starts_at, m.location, m.agenda_url, m.source_url,
            (m.agenda_url IS NOT NULL) AS has_agenda
       FROM meetings m
      WHERE m.is_published
        AND m.starts_at >= now()
        AND m.starts_at < now() + ($1::int * interval '1 day')
      ORDER BY m.starts_at ASC
      LIMIT $2`,
    [days, limit],
  );
}

export interface BodyCountRow {
  body: string;
  total: string;
}

export function meetingBodies() {
  return safeQuery<BodyCountRow>(
    `SELECT body, COUNT(*) AS total
       FROM meetings
      WHERE is_published AND starts_at >= now()
      GROUP BY body
      ORDER BY MIN(starts_at)`,
  );
}

// ---------------------------------------------------------------------------
// Property: zoning and land use
// ---------------------------------------------------------------------------

export interface ZoningSummaryRow {
  zone_class: string;
  zone_desc: string | null;
  districts: string;
  acres: string;
}

export function zoningSummary() {
  return safeQuery<ZoningSummaryRow>(
    `SELECT zone_class,
            MAX(zone_desc) AS zone_desc,
            COUNT(*) AS districts,
            ROUND(SUM(area_sq_ft) / 43560.0) AS acres
       FROM zoning_districts
      GROUP BY zone_class
      ORDER BY SUM(area_sq_ft) DESC NULLS LAST`,
  );
}

export interface LandUseActionRow {
  id: number;
  label: string | null;
  kind: string | null;
  action: string | null;
  applicant: string | null;
  parcel: string | null;
  decided_on: Date | null;
}

export function landUseActions(limit = 40, kind?: string) {
  if (kind) {
    return safeQuery<LandUseActionRow>(
      `SELECT id, label, kind, action, applicant, parcel, decided_on
         FROM land_use_actions
        WHERE kind = $2
        ORDER BY decided_on DESC NULLS LAST, id DESC
        LIMIT $1`,
      [limit, kind],
    );
  }
  return safeQuery<LandUseActionRow>(
    `SELECT id, label, kind, action, applicant, parcel, decided_on
       FROM land_use_actions
      ORDER BY decided_on DESC NULLS LAST, id DESC
      LIMIT $1`,
    [limit],
  );
}

export interface LandUseKindRow {
  kind: string;
  total: string;
}

export function landUseKinds() {
  return safeQuery<LandUseKindRow>(
    `SELECT kind, COUNT(*) AS total
       FROM land_use_actions
      WHERE kind IS NOT NULL
      GROUP BY kind
      ORDER BY COUNT(*) DESC`,
  );
}

export interface LandUseYearRow {
  year: number;
  total: string;
}

export function landUseByYear(years = 12) {
  return safeQuery<LandUseYearRow>(
    `SELECT EXTRACT(YEAR FROM decided_on)::int AS year, COUNT(*) AS total
       FROM land_use_actions
      WHERE decided_on IS NOT NULL
        AND decided_on >= (CURRENT_DATE - ($1::int * interval '1 year'))
      GROUP BY year
      ORDER BY year`,
    [years],
  );
}

export interface PropertyStats {
  zoning_districts: string;
  land_use_actions: string;
  undated: string;
  latest_action: Date | null;
}

export function propertyStats() {
  return safeQuery<PropertyStats>(
    `SELECT
       (SELECT COUNT(*) FROM zoning_districts) AS zoning_districts,
       (SELECT COUNT(*) FROM land_use_actions) AS land_use_actions,
       (SELECT COUNT(*) FROM land_use_actions WHERE decided_on IS NULL) AS undated,
       (SELECT MAX(decided_on) FROM land_use_actions) AS latest_action`,
  );
}

export interface PoliceFreshnessRow {
  latest_log: Date | null;
  logs_held: string;
  last_checked: Date | null;
  last_status: string | null;
}

/**
 * When MPD last published, and when we last looked.
 *
 * These are different facts and the difference matters: MPD covers every day
 * but only posts on business days, so a weekend gap is the city's schedule,
 * not a broken scraper. Showing both lets a reader tell them apart instead of
 * guessing.
 */
export function policeFreshness() {
  return safeQuery<PoliceFreshnessRow>(
    `SELECT
       (SELECT MAX(log_date) FROM press_logs) AS latest_log,
       (SELECT COUNT(DISTINCT log_date) FROM press_logs) AS logs_held,
       (SELECT MAX(finished_at) FROM fetch_runs
         WHERE source_id = 'mpd-press-logs' AND status = 'ok') AS last_checked,
       (SELECT status FROM fetch_runs
         WHERE source_id = 'mpd-press-logs'
         ORDER BY started_at DESC LIMIT 1) AS last_status`,
  );
}

// ---------------------------------------------------------------------------
// Keyword search
// ---------------------------------------------------------------------------

/**
 * Substring matching rather than Postgres full-text.
 *
 * People search this data for case numbers ("CUP26-018"), fragments of a
 * street name, or a surname. Full-text tokenising splits those awkwardly and
 * stems words in ways that surprise; a plain case-insensitive substring match
 * does what a reader expects. At these row counts it is not a performance
 * question.
 */
/**
 * "!" rather than the conventional backslash, deliberately.
 *
 * A backslash has to survive both a TypeScript string literal and a template
 * literal on the way into the SQL, and it did not: `ESCAPE '!'` collapsed to
 * an empty ESCAPE clause (no escape character at all) and the escaping in the term was
 * swallowed too, so searching for "%" matched all 1,178 rows. "!" needs no
 * escaping in either language, so what is written is what Postgres receives.
 */
const LIKE_ESCAPE = "!";

export function likeTerm(term: string): string {
  // Escape the escape character first, or "!" would eat the ones added after.
  const escaped = term
    .trim()
    .replace(/!/g, "!!")
    .replace(/%/g, "!%")
    .replace(/_/g, "!_");
  return "%" + escaped + "%";
}

export interface DecisionSearchRow extends RecentDecisionRow {
  matched_in: string;
}

/** Motions matching a term, by what was moved or who moved it. */
export function searchDecisions(term: string, limit = 50) {
  return safeQuery<DecisionSearchRow>(
    `SELECT mo.id, mo.meeting_id, mo.sequence, mo.mover, mo.seconder, mo.action,
            mo.outcome, mo.ayes_raw, mo.nays_raw, mo.abstentions_raw,
            mo.aye_count, mo.nay_count, mo.unanimous,
            m.body, m.starts_at, m.minutes_url, m.source_url,
            CASE
              WHEN mo.action ILIKE $1 ESCAPE '!' THEN 'motion'
              WHEN mo.mover ILIKE $1 ESCAPE '!' OR mo.seconder ILIKE $1 ESCAPE '!' THEN 'member'
              ELSE 'meeting'
            END AS matched_in
       FROM motions mo
       JOIN meetings m ON m.id = mo.meeting_id
      WHERE mo.action ILIKE $1 ESCAPE '!'
         OR mo.mover ILIKE $1 ESCAPE '!'
         OR mo.seconder ILIKE $1 ESCAPE '!'
         OR m.body ILIKE $1 ESCAPE '!'
      ORDER BY m.starts_at DESC, mo.sequence
      LIMIT $2`,
    [likeTerm(term), limit],
  );
}

export interface AgendaSearchRow {
  meeting_id: number;
  number: number;
  title: string;
  kind: string | null;
  body: string;
  starts_at: Date;
}

/** Agenda items matching a term -- catches things discussed but not voted on. */
export function searchAgendaItems(term: string, limit = 40) {
  return safeQuery<AgendaSearchRow>(
    `SELECT a.meeting_id, a.number, a.title, a.kind, m.body, m.starts_at
       FROM agenda_items a
       JOIN meetings m ON m.id = a.meeting_id
      WHERE a.title ILIKE $1 ESCAPE '!'
      ORDER BY m.starts_at DESC, a.number
      LIMIT $2`,
    [likeTerm(term), limit],
  );
}

export interface MeetingSearchRow extends MeetingRow {
  motion_count: number | null;
}

/** Meetings whose body or description matches. */
export function searchMeetings(term: string, limit = 30) {
  return safeQuery<MeetingSearchRow>(
    `SELECT ${MEETING_COLUMNS}, mm.motion_count
       FROM meetings m
       LEFT JOIN meeting_minutes mm ON mm.meeting_id = m.id
      WHERE m.is_published
        AND (m.body ILIKE $1 ESCAPE '!' OR m.description ILIKE $1 ESCAPE '!')
      ORDER BY m.starts_at DESC
      LIMIT $2`,
    [likeTerm(term), limit],
  );
}

export interface DecisionSearchCounts {
  decisions: string;
  agenda_items: string;
  meetings: string;
}

export function searchCounts(term: string) {
  const like = likeTerm(term);
  return safeQuery<DecisionSearchCounts>(
    `SELECT
       (SELECT COUNT(*) FROM motions mo JOIN meetings m ON m.id = mo.meeting_id
         WHERE mo.action ILIKE $1 ESCAPE '!' OR mo.mover ILIKE $1 ESCAPE '!'
            OR mo.seconder ILIKE $1 ESCAPE '!' OR m.body ILIKE $1 ESCAPE '!') AS decisions,
       (SELECT COUNT(*) FROM agenda_items WHERE title ILIKE $1 ESCAPE '!') AS agenda_items,
       (SELECT COUNT(*) FROM meetings
         WHERE is_published AND (body ILIKE $1 ESCAPE '!' OR description ILIKE $1 ESCAPE '!')) AS meetings`,
    [like],
  );
}

/** Land use applications matching a term. */
export function searchLandUse(term: string, limit = 60) {
  return safeQuery<LandUseActionRow>(
    `SELECT id, label, kind, action, applicant, parcel, decided_on
       FROM land_use_actions
      WHERE action ILIKE $1 ESCAPE '!'
         OR applicant ILIKE $1 ESCAPE '!'
         OR label ILIKE $1 ESCAPE '!'
         OR parcel ILIKE $1 ESCAPE '!'
         OR kind ILIKE $1 ESCAPE '!'
      ORDER BY decided_on DESC NULLS LAST, id DESC
      LIMIT $2`,
    [likeTerm(term), limit],
  );
}

export function landUseSearchCount(term: string) {
  return safeQuery<{ total: string }>(
    `SELECT COUNT(*) AS total FROM land_use_actions
      WHERE action ILIKE $1 ESCAPE '!'
         OR applicant ILIKE $1 ESCAPE '!'
         OR label ILIKE $1 ESCAPE '!'
         OR parcel ILIKE $1 ESCAPE '!'
         OR kind ILIKE $1 ESCAPE '!'`,
    [likeTerm(term)],
  );
}

export interface AmendedSectionRow {
  chapter_slug: string;
  section_number: string;
  section_heading: string | null;
  chapter_label: string | null;
  chapter_name: string | null;
  title_name: string | null;
  /** The section's text as it now stands, from the latest capture. */
  section_text: string | null;
}

/**
 * The sections an ordinance amended, with the language each now carries.
 *
 * This is not a before-and-after: the first capture of every chapter was
 * taken in August 2026, so no earlier text exists to diff against for an
 * older ordinance. What it shows is the wording that stands *because of*
 * that ordinance, which is as close to "what it did" as the record allows.
 */
export function sectionsAmendedBy(ordinanceNumber: string) {
  return safeQuery<AmendedSectionRow>(
    `SELECT os.chapter_slug, os.section_number, os.section_heading,
            c.chapter_label, c.chapter_name, c.title_name,
            (
              SELECT s->>'text'
                FROM code_versions v,
                     LATERAL jsonb_array_elements(v.sections) s
               WHERE v.chapter_slug = os.chapter_slug
                 AND s->>'number' = os.section_number
               ORDER BY v.captured_at DESC
               LIMIT 1
            ) AS section_text
       FROM ordinance_sections os
       LEFT JOIN code_chapters c ON c.slug = os.chapter_slug
      WHERE os.ordinance_number = $1
      ORDER BY os.chapter_slug, os.section_number`,
    [ordinanceNumber],
  );
}

// ---------------------------------------------------------------------------
// Spending, read from agenda packets
// ---------------------------------------------------------------------------

/*
 * Every aggregate here is restricted to `trusted` register batches.
 *
 * A batch is trusted when our sum equals the total the register printed and we
 * read as many pages as its banner says it has. A batch that fails either test
 * is still recorded, and the meeting page says so and links to the PDF -- but
 * it never reaches a total, because publishing 17 lines of a 400-line register
 * would understate the city's spending far more damagingly than admitting we
 * could not read it.
 */
const TRUSTED_JOIN = `JOIN check_register_batches b ON b.id = cp.batch_id AND b.trusted`;

export interface SpendingFilters {
  fund?: string;
  account?: string;
  from?: string;
  to?: string;
}

/** Build the optional WHERE fragments shared by the filtered queries. */
function spendingWhere(
  filters: SpendingFilters,
  params: unknown[],
): string {
  const clauses: string[] = [];
  if (filters.fund) {
    params.push(filters.fund);
    clauses.push(`cp.fund = $${params.length}`);
  }
  if (filters.account) {
    params.push(filters.account);
    clauses.push(`cp.account = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    clauses.push(`cp.check_date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`cp.check_date <= $${params.length}::date`);
  }
  return clauses.length > 0 ? " AND " + clauses.join(" AND ") : "";
}

export interface SpendingStatsRow {
  payment_total_cents: string;
  payment_count: string;
  vendor_count: string;
  packets_read: string;
  registers_trusted: string;
  registers_untrusted: string;
  earliest_check: Date | null;
  latest_check: Date | null;
}

export function spendingStats() {
  return safeQuery<SpendingStatsRow>(
    `SELECT
       COALESCE((SELECT SUM(cp.amount_cents) FROM check_payments cp ${TRUSTED_JOIN}), 0)::text
         AS payment_total_cents,
       (SELECT COUNT(*) FROM check_payments cp ${TRUSTED_JOIN})::text AS payment_count,
       (SELECT COUNT(DISTINCT cp.vendor_key) FROM check_payments cp ${TRUSTED_JOIN})::text
         AS vendor_count,
       (SELECT COUNT(*) FROM meeting_packets)::text AS packets_read,
       (SELECT COUNT(*) FROM check_register_batches WHERE trusted)::text AS registers_trusted,
       (SELECT COUNT(*) FROM check_register_batches WHERE NOT trusted)::text AS registers_untrusted,
       (SELECT MIN(cp.check_date) FROM check_payments cp ${TRUSTED_JOIN}) AS earliest_check,
       (SELECT MAX(cp.check_date) FROM check_payments cp ${TRUSTED_JOIN}) AS latest_check`,
  );
}

export interface VendorRollupRow {
  vendor_key: string;
  vendor_name: string;
  payment_count: string;
  total_cents: string;
  meeting_count: string;
  last_check: Date | null;
}

/**
 * Who the city pays, largest first.
 *
 * Grouped by the normalised key, but displayed under the spelling the register
 * printed most often -- it writes "WHITCOM 911" one fortnight and "Whitcom 911"
 * the next, and picking the commonest is better than picking whichever sorted
 * first.
 */
export function topVendors(limit = 60, filters: SpendingFilters = {}) {
  const params: unknown[] = [limit];
  const where = spendingWhere(filters, params);
  return safeQuery<VendorRollupRow>(
    `SELECT cp.vendor_key,
            mode() WITHIN GROUP (ORDER BY cp.vendor_name) AS vendor_name,
            COUNT(*)::text AS payment_count,
            SUM(cp.amount_cents)::text AS total_cents,
            COUNT(DISTINCT cp.meeting_id)::text AS meeting_count,
            MAX(cp.check_date) AS last_check
       FROM check_payments cp ${TRUSTED_JOIN}
      WHERE TRUE ${where}
      GROUP BY cp.vendor_key
      ORDER BY SUM(cp.amount_cents) DESC
      LIMIT $1`,
    params,
  );
}

export interface PaymentRowRecord {
  id: string;
  meeting_id: number;
  body: string;
  starts_at: Date;
  check_number: string | null;
  check_date: Date | null;
  vendor_name: string;
  vendor_key: string;
  account: string | null;
  fund: string | null;
  amount_cents: string;
  amount_repaired: boolean;
  amount_uncertain: boolean;
  page: number | null;
  packet_url: string | null;
}

const PAYMENT_COLUMNS = `cp.id::text, cp.meeting_id, m.body, m.starts_at,
       cp.check_number, cp.check_date, cp.vendor_name, cp.vendor_key,
       cp.account, cp.fund, cp.amount_cents::text, cp.amount_repaired,
       cp.amount_uncertain, cp.page, mp.packet_url`;

/** The largest individual payments, which is what a reader looks for first. */
export function largestPayments(limit = 40, filters: SpendingFilters = {}) {
  const params: unknown[] = [limit];
  const where = spendingWhere(filters, params);
  return safeQuery<PaymentRowRecord>(
    `SELECT ${PAYMENT_COLUMNS}
       FROM check_payments cp
       ${TRUSTED_JOIN}
       JOIN meetings m ON m.id = cp.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = cp.meeting_id
      WHERE TRUE ${where}
      ORDER BY cp.amount_cents DESC
      LIMIT $1`,
    params,
  );
}

export function paymentsForVendor(vendorKey: string, limit = 300) {
  return safeQuery<PaymentRowRecord>(
    `SELECT ${PAYMENT_COLUMNS}
       FROM check_payments cp
       ${TRUSTED_JOIN}
       JOIN meetings m ON m.id = cp.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = cp.meeting_id
      WHERE cp.vendor_key = $1
      ORDER BY cp.check_date DESC NULLS LAST, cp.amount_cents DESC
      LIMIT $2`,
    [vendorKey, limit],
  );
}

export interface GroupTotalRow {
  label: string | null;
  total_cents: string;
  payment_count: string;
}

export function fundTotals(filters: SpendingFilters = {}) {
  const params: unknown[] = [];
  const where = spendingWhere(filters, params);
  return safeQuery<GroupTotalRow>(
    `SELECT cp.fund AS label, SUM(cp.amount_cents)::text AS total_cents,
            COUNT(*)::text AS payment_count
       FROM check_payments cp ${TRUSTED_JOIN}
      WHERE TRUE ${where}
      GROUP BY cp.fund
      ORDER BY SUM(cp.amount_cents) DESC`,
    params,
  );
}

export function accountTotals(limit = 40, filters: SpendingFilters = {}) {
  const params: unknown[] = [limit];
  const where = spendingWhere(filters, params);
  return safeQuery<GroupTotalRow>(
    `SELECT cp.account AS label, SUM(cp.amount_cents)::text AS total_cents,
            COUNT(*)::text AS payment_count
       FROM check_payments cp ${TRUSTED_JOIN}
      WHERE TRUE ${where}
      GROUP BY cp.account
      ORDER BY SUM(cp.amount_cents) DESC
      LIMIT $1`,
    params,
  );
}

export interface PaymentSearchRow extends PaymentRowRecord {
  matched_in: string;
}

/**
 * Search the payments.
 *
 * ILIKE against the parsed columns, deliberately -- not full-text over the
 * packet. Readers search for a firm name, a fund, or an account fragment, and
 * more importantly the raw packet carries 150-odd pages of contract and
 * engineering boilerplate per meeting: a search for "legal" across it returns
 * twenty hits of "ARTICLE 13. LEGAL FEES" and one real payment.
 */
export function searchPayments(term: string, limit = 80) {
  return safeQuery<PaymentSearchRow>(
    `SELECT ${PAYMENT_COLUMNS},
            CASE
              WHEN cp.vendor_name ILIKE $1 ESCAPE '!' THEN 'vendor'
              WHEN cp.account ILIKE $1 ESCAPE '!' THEN 'account'
              ELSE 'fund'
            END AS matched_in
       FROM check_payments cp
       ${TRUSTED_JOIN}
       JOIN meetings m ON m.id = cp.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = cp.meeting_id
      WHERE cp.vendor_name ILIKE $1 ESCAPE '!'
         OR cp.account ILIKE $1 ESCAPE '!'
         OR cp.fund ILIKE $1 ESCAPE '!'
      ORDER BY cp.amount_cents DESC
      LIMIT $2`,
    [likeTerm(term), limit],
  );
}

export interface StaffReportRow {
  id: string;
  meeting_id: number;
  body: string;
  starts_at: Date;
  sequence: number;
  agenda_item_title: string | null;
  responsible_staff: string | null;
  description: string | null;
  proposed_actions: string | null;
  fiscal_impact: string | null;
  fiscal_max_cents: string | null;
  start_page: number | null;
  end_page: number | null;
  packet_url: string | null;
}

const STAFF_REPORT_COLUMNS = `sr.id::text, sr.meeting_id, m.body, m.starts_at, sr.sequence,
       sr.agenda_item_title, sr.responsible_staff, sr.description, sr.proposed_actions,
       sr.fiscal_impact, sr.fiscal_max_cents::text, sr.start_page, sr.end_page, mp.packet_url`;

/**
 * Search the staff reports.
 *
 * Covers the description and the proposed actions as well as the fiscal
 * impact, because the fiscal impact field is frequently left blank: the FY2027
 * appropriation ordinance is a $149,942,154 budget whose FISCAL IMPACT is
 * empty, with every figure sitting in the description instead.
 */
export function searchStaffReports(term: string, limit = 40) {
  return safeQuery<StaffReportRow>(
    `SELECT ${STAFF_REPORT_COLUMNS}
       FROM packet_staff_reports sr
       JOIN meetings m ON m.id = sr.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = sr.meeting_id
      WHERE sr.agenda_item_title ILIKE $1 ESCAPE '!'
         OR sr.fiscal_impact ILIKE $1 ESCAPE '!'
         OR sr.description ILIKE $1 ESCAPE '!'
         OR sr.proposed_actions ILIKE $1 ESCAPE '!'
      ORDER BY m.starts_at DESC, sr.sequence
      LIMIT $2`,
    [likeTerm(term), limit],
  );
}

export interface PacketSegmentHitRow {
  id: string;
  meeting_id: number;
  body: string;
  starts_at: Date;
  kind: string;
  title: string | null;
  start_page: number;
  end_page: number;
  packet_url: string | null;
  excerpt: string;
}

/**
 * Search the parts of the packet kept as text but not parsed into rows -- above
 * all the Major Expenditures page, which is the only place a payment made in
 * the previous month appears at all.
 *
 * Restricted to the readable segments. Attachments carry no text by design, so
 * this cannot reach the boilerplate.
 */
export function searchPacketSegments(term: string, limit = 30) {
  return safeQuery<PacketSegmentHitRow>(
    `SELECT s.id::text, s.meeting_id, m.body, m.starts_at, s.kind, s.title,
            s.start_page, s.end_page, mp.packet_url,
            substring(s.text from greatest(1, position(lower($3) in lower(s.text)) - 90) for 260)
              AS excerpt
       FROM packet_segments s
       JOIN meetings m ON m.id = s.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = s.meeting_id
      WHERE s.text IS NOT NULL
        AND s.kind IN ('major_expenditures', 'disbursement_report', 'agenda')
        AND s.text ILIKE $1 ESCAPE '!'
      ORDER BY m.starts_at DESC, s.sequence
      LIMIT $2`,
    [likeTerm(term), limit, term.trim()],
  );
}

export interface SpendingSearchCountRow {
  payments: string;
  staff_reports: string;
  segments: string;
}

export function spendingSearchCounts(term: string) {
  return safeQuery<SpendingSearchCountRow>(
    `SELECT
       (SELECT COUNT(*) FROM check_payments cp ${TRUSTED_JOIN}
         WHERE cp.vendor_name ILIKE $1 ESCAPE '!' OR cp.account ILIKE $1 ESCAPE '!'
            OR cp.fund ILIKE $1 ESCAPE '!')::text AS payments,
       (SELECT COUNT(*) FROM packet_staff_reports sr
         WHERE sr.agenda_item_title ILIKE $1 ESCAPE '!' OR sr.fiscal_impact ILIKE $1 ESCAPE '!'
            OR sr.description ILIKE $1 ESCAPE '!' OR sr.proposed_actions ILIKE $1 ESCAPE '!')::text
         AS staff_reports,
       (SELECT COUNT(*) FROM packet_segments s
         WHERE s.text IS NOT NULL
           AND s.kind IN ('major_expenditures', 'disbursement_report', 'agenda')
           AND s.text ILIKE $1 ESCAPE '!')::text AS segments`,
    [likeTerm(term)],
  );
}

// --- The packet behind one meeting ------------------------------------------

export interface PacketRow {
  meeting_id: number;
  packet_url: string;
  page_count: number;
  byte_size: string | null;
  text_page_count: number;
  image_page_count: number;
  is_scanned: boolean;
  segment_count: number;
  register_count: number;
  payment_count: number;
  payment_total_cents: string;
  staff_report_count: number;
  captured_at: Date;
}

export function packetForMeeting(meetingId: number) {
  return safeQuery<PacketRow>(
    `SELECT meeting_id, packet_url, page_count, byte_size::text, text_page_count,
            image_page_count, is_scanned, segment_count, register_count,
            payment_count, payment_total_cents::text, staff_report_count, captured_at
       FROM meeting_packets WHERE meeting_id = $1`,
    [meetingId],
  );
}

export interface PacketSegmentRow {
  id: string;
  sequence: number;
  kind: string;
  title: string | null;
  start_page: number;
  end_page: number;
  has_text: boolean;
}

export function packetSegmentsForMeeting(meetingId: number) {
  return safeQuery<PacketSegmentRow>(
    `SELECT id::text, sequence, kind, title, start_page, end_page,
            (text IS NOT NULL) AS has_text
       FROM packet_segments WHERE meeting_id = $1 ORDER BY sequence`,
    [meetingId],
  );
}

export interface RegisterBatchRow {
  id: string;
  sequence: number;
  report_date: Date | null;
  prepared_by: string | null;
  start_page: number;
  end_page: number;
  page_count: number;
  declared_page_count: number | null;
  declared_total_cents: string | null;
  parsed_total_cents: string;
  row_count: number;
  repaired_count: number;
  uncertain_count: number;
  trusted: boolean;
}

export function registerBatchesForMeeting(meetingId: number) {
  return safeQuery<RegisterBatchRow>(
    `SELECT id::text, sequence, report_date, prepared_by, start_page, end_page,
            page_count, declared_page_count, declared_total_cents::text,
            parsed_total_cents::text, row_count, repaired_count, uncertain_count, trusted
       FROM check_register_batches WHERE meeting_id = $1 ORDER BY sequence`,
    [meetingId],
  );
}

export function paymentsForMeeting(meetingId: number, limit = 800) {
  return safeQuery<PaymentRowRecord>(
    `SELECT ${PAYMENT_COLUMNS}
       FROM check_payments cp
       ${TRUSTED_JOIN}
       JOIN meetings m ON m.id = cp.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = cp.meeting_id
      WHERE cp.meeting_id = $1
      ORDER BY cp.amount_cents DESC
      LIMIT $2`,
    [meetingId, limit],
  );
}

export function staffReportsForMeeting(meetingId: number) {
  return safeQuery<StaffReportRow>(
    `SELECT ${STAFF_REPORT_COLUMNS}
       FROM packet_staff_reports sr
       JOIN meetings m ON m.id = sr.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = sr.meeting_id
      WHERE sr.meeting_id = $1
      ORDER BY sr.sequence`,
    [meetingId],
  );
}

export interface UntrustedRegisterRow extends RegisterBatchRow {
  meeting_id: number;
  body: string;
  starts_at: Date;
  packet_url: string | null;
}

/** Registers excluded from every total, and why. Shown openly on /spending. */
export function untrustedRegisters(limit = 25) {
  return safeQuery<UntrustedRegisterRow>(
    `SELECT b.id::text, b.sequence, b.report_date, b.prepared_by, b.start_page, b.end_page,
            b.page_count, b.declared_page_count, b.declared_total_cents::text,
            b.parsed_total_cents::text, b.row_count, b.repaired_count, b.uncertain_count,
            b.trusted, b.meeting_id, m.body, m.starts_at, mp.packet_url
       FROM check_register_batches b
       JOIN meetings m ON m.id = b.meeting_id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = b.meeting_id
      WHERE NOT b.trusted
      ORDER BY m.starts_at DESC, b.sequence
      LIMIT $1`,
    [limit],
  );
}
