import Link from "next/link";

import { MotionCard } from "@/components/Motion";
import { EmptyState, Row, RowList, SectionHeading, Stat, Badge } from "@/components/ui";
import {
  formatCalendarDate,
  formatClockTime,
  formatDate,
  formatDateTime,
  relativeTime,
} from "@/lib/format";
import {
  coverageStats,
  incidentTypeCounts,
  latestPressLog,
  recentDecisions,
  recentIncidents,
  upcomingMeetings,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [meetings, log, incidents, types, coverage, decisions] = await Promise.all([
    upcomingMeetings(4),
    latestPressLog(),
    recentIncidents(8),
    incidentTypeCounts(30),
    coverageStats(),
    recentDecisions(5),
  ]);

  const nextMeeting = meetings.rows[0] ?? null;
  const latestLog = log.rows[0] ?? null;
  const stats = coverage.rows[0] ?? null;
  const topTypes = types.rows.slice(0, 6);
  const hasAnyData = Boolean(nextMeeting || latestLog);

  return (
    <div className="space-y-12">
      <section>
        <p className="eyebrow">This week in Moscow</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          What is happening in the city
        </h1>
        <p className="muted mt-2 max-w-prose">
          Public meetings, police activity, and city decisions — pulled from the
          city&rsquo;s own records and linked back to the document each figure came from.
        </p>
      </section>

      {!hasAnyData ? (
        <EmptyState
          error={log.error ?? coverage.error}
          emptyMessage="No data has been ingested yet."
          hint="Run npm run db:migrate followed by npm run ingest to populate the site."
        />
      ) : null}

      {/* Headline numbers ------------------------------------------------ */}
      {stats ? (
        <section>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Next meeting"
              value={nextMeeting ? relativeTime(nextMeeting.starts_at) : "—"}
              detail={nextMeeting ? nextMeeting.body : "Nothing scheduled"}
              href="/meetings"
            />
            <Stat
              label="Latest police log"
              value={latestLog ? latestLog.incident_count : "—"}
              detail={
                latestLog
                  ? (latestLog.incident_count === 1 ? "incident" : "incidents") +
                    " on " +
                    formatCalendarDate(latestLog.log_date)
                  : "Not yet ingested"
              }
              href="/police"
            />
            <Stat
              label="Incidents recorded"
              value={Number(stats.incident_count).toLocaleString("en-US")}
              detail={
                stats.earliest_log && stats.latest_log
                  ? "across " + stats.log_count + " daily logs"
                  : "no logs yet"
              }
              href="/police"
            />
            <Stat
              label="Meetings tracked"
              value={Number(stats.meeting_count).toLocaleString("en-US")}
              detail="agendas, minutes, and video"
              href="/meetings"
            />
          </div>
        </section>
      ) : null}

      {/* Upcoming meetings ----------------------------------------------- */}
      <section>
        <SectionHeading
          title="Coming up"
          hint="Meetings where decisions get made — and where the public can speak."
          action={
            <Link href="/meetings" className="link-underline text-sm">
              All meetings
            </Link>
          }
        />
        {meetings.rows.length === 0 ? (
          <EmptyState
            error={meetings.error}
            emptyMessage="No upcoming meetings are published."
            hint="The city usually posts agendas a few days ahead."
          />
        ) : (
          <RowList>
            {meetings.rows.map((meeting) => (
              <Row key={meeting.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <Link href="/meetings" className="font-medium hover:text-[var(--accent)]">
                      {meeting.body}
                    </Link>
                    <p className="muted text-sm">
                      {formatDateTime(meeting.starts_at)}
                      {meeting.location ? " · " + meeting.location : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="accent">{relativeTime(meeting.starts_at)}</Badge>
                    {meeting.agenda_url ? (
                      <a
                        href={meeting.agenda_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-underline text-sm"
                      >
                        Agenda
                      </a>
                    ) : (
                      <span className="faint text-sm">No agenda yet</span>
                    )}
                  </div>
                </div>
              </Row>
            ))}
          </RowList>
        )}
      </section>

      {/* Recent decisions ------------------------------------------------- */}
      {decisions.rows.length > 0 ? (
        <section>
          <SectionHeading
            title="Recently decided"
            hint="Motions as recorded in the minutes."
            action={
              <Link href="/meetings" className="link-underline text-sm">
                All decisions
              </Link>
            }
          />
          <ul className="card px-4">
            {decisions.rows.map((decision) => (
              <MotionCard
                key={decision.id}
                motion={decision}
                context={decision.body + " · " + formatDate(decision.starts_at)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Police ----------------------------------------------------------- */}
      <section>
        <SectionHeading
          title="Latest police activity"
          hint={
            latestLog
              ? "From the MPD daily press log for " + formatCalendarDate(latestLog.log_date) + "."
              : "From the MPD daily press log."
          }
          action={
            <Link href="/police" className="link-underline text-sm">
              All incidents
            </Link>
          }
        />

        {topTypes.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {topTypes.map((type) => (
              <Link
                key={type.incident_type}
                href={{ pathname: "/police", query: { type: type.incident_type } }}
                className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
              >
                {type.incident_type}
                <span className="faint mono ml-1.5">{type.total}</span>
              </Link>
            ))}
          </div>
        ) : null}

        {incidents.rows.length === 0 ? (
          <EmptyState
            error={incidents.error}
            emptyMessage="No incidents have been ingested yet."
          />
        ) : (
          <RowList>
            {incidents.rows.map((incident) => (
              <Row key={incident.case_number}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-medium">{incident.incident_type}</span>
                  <span className="faint mono text-xs">
                    {formatClockTime(incident.time_reported) ?? ""}
                  </span>
                </div>
                <p className="muted text-sm">
                  {incident.block_address ?? "Location not published"}
                </p>
              </Row>
            ))}
          </RowList>
        )}
      </section>

      {/* Standing note about what this site is ---------------------------- */}
      <section className="card p-5 text-sm" style={{ background: "var(--opinion)" }}>
        <h2 className="font-semibold">How to read this site</h2>
        <p className="muted mt-2 max-w-prose">
          Police entries are <strong>calls for service</strong> — a record that someone
          called and an officer responded. They are not charges, and they are not
          convictions. Addresses are published by MPD at block level and shown exactly as
          published; no names appear anywhere on this site.
        </p>
        <p className="muted mt-2 max-w-prose">
          Nothing here is written, summarised, or interpreted by an AI model. Every number
          is counted from a parsed public document, and every record links back to it.
        </p>
      </section>
    </div>
  );
}
