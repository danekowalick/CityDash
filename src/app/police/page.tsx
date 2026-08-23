import Link from "next/link";
import type { Metadata } from "next";

import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, EmptyState, Row, RowList, SectionHeading } from "@/components/ui";
import {
  describeDisposition,
  formatCalendarDate,
  formatClockTime,
  formatLogDayLabel,
  knownDispositions,
  pluralise,
  relativeTime,
} from "@/lib/format";
import {
  policeFreshness,
  incidentTypeCounts,
  incidentsByHour,
  pressLogCoverage,
  recentIncidents,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Police activity",
  description:
    "Moscow Police Department daily press logs, parsed into searchable incidents.",
};

/** A bare CSS bar chart. No chart library, no client JavaScript. */
function HourHistogram({ buckets }: { buckets: Array<{ hour: number; total: string }> }) {
  const counts = new Map(buckets.map((b) => [b.hour, Number(b.total)]));
  const peak = Math.max(1, ...counts.values());

  return (
    <div className="card p-4">
      <div className="scroll-x">
        <div className="flex min-w-[34rem] items-end gap-1" style={{ height: "7rem" }}>
          {Array.from({ length: 24 }, (_, hour) => {
            const total = counts.get(hour) ?? 0;
            const height = Math.max(2, Math.round((total / peak) * 100));
            return (
              <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{ height: height + "%", background: "var(--accent)", opacity: 0.85 }}
                  title={total + " incidents reported at " + hour + ":00"}
                />
                <span className="faint mono text-[0.625rem]">
                  {hour % 6 === 0 ? hour : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="faint mt-2 text-xs">
        Incidents by hour reported, last 90 days. Peak hour: {peak} incidents.
      </p>
    </div>
  );
}

export default async function PolicePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

  const [incidents, types, hours, coverage, freshness] = await Promise.all([
    recentIncidents(120, type),
    incidentTypeCounts(30),
    incidentsByHour(90),
    pressLogCoverage(14),
    policeFreshness(),
  ]);

  const fresh = freshness.rows[0] ?? null;

  const gapDays = coverage.rows.filter((row) => row.case_gaps > 0);

  // Nearly seventy distinct types appear in a month, most of them once. Show
  // the ones that actually recur and account for the long tail in a line of
  // text rather than a wall of chips.
  const TYPES_SHOWN = 24;
  const shownTypes = types.rows.slice(0, TYPES_SHOWN);
  const hiddenTypes = types.rows.slice(TYPES_SHOWN);
  const hiddenTotal = hiddenTypes.reduce((sum, row) => sum + Number(row.total), 0);

  const sections: NavSection[] = [
    { id: "coverage", label: "Coverage", count: coverage.rows.length },
    { id: "types", label: "By type", count: types.rows.length },
    { id: "when", label: "When calls come in" },
    { id: "feed", label: "Incidents", count: incidents.rows.length },
    { id: "codes", label: "Disposition codes" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">Police</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Daily activity log</h1>
        <p className="muted mt-2 max-w-prose">
          Moscow PD publishes a log of calls for service each day. Those pages are parsed
          into individual incidents here so they can be counted, filtered, and compared
          over time.
        </p>
        <p className="muted mt-2 max-w-prose text-sm">
          These are <strong>calls for service</strong> — not charges, and not convictions.
          Many entries resolve to nothing at all. Addresses are shown exactly as MPD
          publishes them, at block level.
        </p>
      </section>

      <WithSectionNav sections={sections}>
      <div className="space-y-10">
      {fresh?.latest_log ? (
        <section className="card p-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p>
              <span className="muted">Most recent log published by MPD:</span>{" "}
              <strong>{formatCalendarDate(fresh.latest_log)}</strong>
            </p>
            <p className="faint text-xs">
              {fresh.last_checked
                ? "We last checked for new logs " + relativeTime(fresh.last_checked) + "."
                : "Not yet checked."}
            </p>
          </div>
          {/*
            MPD covers every day but only posts on business days, so a
            weekend gap is their schedule rather than a fault here. Saying so
            stops "no new log" being read as "the site is broken".
          */}
          <p className="muted mt-2 max-w-prose text-xs">
            Moscow PD logs every day but publishes on business days, so weekend
            activity usually appears the following Monday. This site checks five times a
            day; if the newest log above is older than that, MPD has not posted it yet.
            Feed health is on{" "}
            <Link href="/sources" className="link-underline">
              the sources page
            </Link>
            .
          </p>
        </section>
      ) : null}

      {/* Coverage and integrity ------------------------------------------ */}
      {coverage.rows.length > 0 ? (
        <section id="coverage">
          <SectionHeading
            title="Coverage"
            hint="Which daily logs we hold, and whether any published log was incomplete."
          />
          <div className="scroll-x">
            <div className="flex gap-1.5">
              {coverage.rows
                .slice()
                .reverse()
                .map((row) => (
                  <a
                    key={row.log_date.toString()}
                    href={row.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card min-w-[4.5rem] flex-1 p-2 text-center transition-colors hover:border-[var(--accent)]"
                    title={
                      formatCalendarDate(row.log_date) +
                      ": " +
                      row.incident_count +
                      " incidents" +
                      (row.case_gaps > 0 ? ", " + row.case_gaps + " case gaps" : "")
                    }
                  >
                    <span className="faint block text-[0.625rem]">
                      {formatLogDayLabel(row.log_date)}
                    </span>
                    <span className="mono block text-lg font-semibold leading-tight">
                      {row.incident_count}
                    </span>
                    {row.case_gaps > 0 ? (
                      <span className="mono text-[0.625rem]" style={{ color: "var(--warn)" }}>
                        {row.case_gaps} gap{row.case_gaps === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </a>
                ))}
            </div>
          </div>
          {gapDays.length > 0 ? (
            <p className="muted mt-3 text-sm">
              Case numbers run sequentially within a day, so a gap means the published log
              skipped an entry. {gapDays.length} of the last {coverage.rows.length} logs
              had at least one. We show that rather than quietly presenting an incomplete
              day as complete.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Type filter ------------------------------------------------------ */}
      {types.rows.length > 0 ? (
        <section id="types">
          <SectionHeading title="By type" hint="Counts over the last 30 days." />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/police"
              className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
              style={
                type ? undefined : { borderColor: "var(--accent)", background: "var(--accent-soft)" }
              }
            >
              All
            </Link>
            {shownTypes.map((row) => {
              const active = row.incident_type === type;
              return (
                <Link
                  key={row.incident_type}
                  href={
                    active
                      ? "/police"
                      : { pathname: "/police", query: { type: row.incident_type } }
                  }
                  className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
                  style={
                    active
                      ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                      : undefined
                  }
                >
                  {row.incident_type}
                  <span className="faint mono ml-1.5">{row.total}</span>
                </Link>
              );
            })}
          </div>
          {hiddenTypes.length > 0 ? (
            <p className="faint mt-2 text-xs">
              Plus {pluralise(hiddenTypes.length, "less common type")} accounting for{" "}
              {pluralise(hiddenTotal, "call")}. Every type remains filterable by URL.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* When calls come in ----------------------------------------------- */}
      {hours.rows.length > 0 ? (
        <section id="when">
          <SectionHeading title="When calls come in" />
          <HourHistogram buckets={hours.rows} />
        </section>
      ) : null}

      {/* Incident feed ---------------------------------------------------- */}
      <section id="feed">
        <SectionHeading
          title={type ? type : "Recent incidents"}
          hint={
            type
              ? "Filtered to " + type + "."
              : "Most recent first, across every log we hold."
          }
          action={
            type ? (
              <Link href="/police" className="link-underline text-sm">
                Clear filter
              </Link>
            ) : undefined
          }
        />

        {incidents.rows.length === 0 ? (
          <EmptyState
            error={incidents.error}
            emptyMessage={
              type
                ? "No incidents of this type have been ingested."
                : "No incidents have been ingested yet."
            }
            hint="Run npm run ingest to fetch the latest logs."
          />
        ) : (
          <RowList>
            {incidents.rows.map((incident) => {
              const meaning = describeDisposition(incident.disposition);
              return (
                <Row key={incident.case_number}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <span className="font-medium">{incident.incident_type}</span>
                      <span className="faint mono ml-2 text-xs">{incident.case_number}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      {incident.disposition ? (
                        <Badge>{meaning ?? incident.disposition}</Badge>
                      ) : null}
                      <span className="faint mono text-xs">
                        {formatCalendarDate(incident.log_date)}
                        {incident.time_reported
                          ? " · " + formatClockTime(incident.time_reported)
                          : ""}
                      </span>
                    </div>
                  </div>

                  <p className="muted mt-0.5 text-sm">
                    {incident.block_address ?? "Location not published"}
                  </p>

                  {incident.cad_comments ? (
                    <p className="mt-1 max-w-prose text-sm">{incident.cad_comments}</p>
                  ) : null}

                  <a
                    href={incident.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="faint link-underline mt-1 inline-block text-xs"
                  >
                    Original log
                  </a>
                </Row>
              );
            })}
          </RowList>
        )}
      </section>

      {/* Disposition legend ---------------------------------------------- */}
      <section id="codes">
        <SectionHeading
          title="Disposition codes"
          hint="MPD publishes these bare. A reader should not have to guess."
        />
        <dl className="card grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {knownDispositions().map(({ code, meaning }) => (
            <div key={code} className="flex gap-2">
              <dt className="mono font-semibold">{code}</dt>
              <dd className="muted">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="faint mt-2 text-xs">
          Codes we do not recognise are displayed exactly as published rather than guessed
          at.
        </p>
      </section>
      </div>
      </WithSectionNav>
    </div>
  );
}
