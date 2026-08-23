import Link from "next/link";
import type { Metadata } from "next";

import { MotionCard } from "@/components/Motion";
import {
  MEETING_STATE_NOTE,
  MeetingStatusBadge,
  meetingState,
} from "@/components/MeetingStatus";
import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, EmptyState, Row, RowList, SectionHeading, Stat } from "@/components/ui";
import { formatDateTime, pluralise, relativeTime } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import {
  decisionFilterCounts,
  meetingFilterCounts,
  meetingOutcomeSummaries,
  outcomeStats,
  pastMeetingsFiltered,
  recentDecisions,
  upcomingMeetings,
  type DecisionFilter,
  type MeetingFilter,
  type MeetingOutcomeSummary,
  type MeetingRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public meetings & decisions",
  description:
    "City Council, Planning and Zoning, and commission meetings for Moscow, Idaho — with agendas, minutes, and what each body actually decided.",
};

const meetingHref = (id: number) => dynamicHref("/meetings/" + id);

function MeetingEntry({
  meeting,
  summary,
}: {
  meeting: MeetingRow;
  summary?: MeetingOutcomeSummary;
}) {
  const state = meetingState(summary, meeting.starts_at);
  const hasDecisions = state === "decisions";
  const upcoming = state === "upcoming";

  return (
    <Row>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-medium">
            <Link href={meetingHref(meeting.id)} className="hover:text-[var(--accent)]">
              {meeting.body}
            </Link>
          </h3>
          <p className="muted text-sm">
            {formatDateTime(meeting.starts_at)}
            {meeting.location ? " · " + meeting.location : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {upcoming ? <Badge tone="accent">{relativeTime(meeting.starts_at)}</Badge> : null}
          <MeetingStatusBadge state={state} motionCount={summary?.motion_count} />
        </div>
      </div>

      {/* Say what opening this will get you, rather than leaving it a gamble. */}
      {!upcoming && !hasDecisions ? (
        <p className="faint mt-1 text-xs">{MEETING_STATE_NOTE[state]}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {hasDecisions ? (
          <Link href={meetingHref(meeting.id)} className="link-underline font-medium">
            What was decided
          </Link>
        ) : (
          <Link href={meetingHref(meeting.id)} className="faint link-underline">
            Details
          </Link>
        )}
        {meeting.agenda_url ? (
          <a href={meeting.agenda_url} target="_blank" rel="noopener noreferrer" className="link-underline">
            Agenda
          </a>
        ) : null}
        {meeting.minutes_url ? (
          <a href={meeting.minutes_url} target="_blank" rel="noopener noreferrer" className="link-underline">
            Minutes
          </a>
        ) : null}
        {meeting.youtube_id ? (
          <a
            href={"https://www.youtube.com/watch?v=" + meeting.youtube_id}
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline"
          >
            Video
          </a>
        ) : null}
      </div>
    </Row>
  );
}

const DECISION_FILTERS: Array<{ key: DecisionFilter; label: string; hint: string }> = [
  { key: "all", label: "All", hint: "Every recorded motion." },
  {
    key: "carried",
    label: "Passed",
    hint: "Motions that carried. Note this is the motion passing, not necessarily a thing being approved.",
  },
  {
    key: "failed",
    label: "Did not pass",
    hint: "Motions that failed, were tabled, or were withdrawn.",
  },
  {
    key: "refusals",
    label: "Motions to deny",
    hint: "Motions to deny or reject something. Read the outcome alongside: a motion to deny that carried is a refusal; one that failed means the thing stood.",
  },
  {
    key: "unstated",
    label: "Outcome not stated",
    hint: "The minutes record the motion but no result.",
  },
];

const FILTERS: Array<{ key: MeetingFilter; label: string }> = [
  { key: "decisions", label: "With decisions" },
  { key: "all", label: "All" },
  { key: "pending", label: "Minutes pending" },
];

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; outcome?: string }>;
}) {
  const { show, outcome } = await searchParams;
  const filter: MeetingFilter =
    show === "all" || show === "pending" ? show : "decisions";

  const decisionFilter: DecisionFilter = DECISION_FILTERS.some((f) => f.key === outcome)
    ? (outcome as DecisionFilter)
    : "all";
  const activeDecision = DECISION_FILTERS.find((f) => f.key === decisionFilter)!;

  const [upcoming, past, decisions, stats, summaries, counts, decisionCounts] = await Promise.all([
    upcomingMeetings(20),
    pastMeetingsFiltered(40, filter),
    recentDecisions(decisionFilter === "all" ? 10 : 60, decisionFilter),
    outcomeStats(),
    meetingOutcomeSummaries(),
    meetingFilterCounts(),
    decisionFilterCounts(),
  ]);

  const summaryById = new Map(summaries.rows.map((s) => [s.meeting_id, s]));
  const totals = stats.rows[0] ?? null;
  const filterCounts = counts.rows[0] ?? null;
  const decisionTotals = decisionCounts.rows[0] ?? null;

  const countFor = (key: MeetingFilter): number | undefined => {
    if (!filterCounts) return undefined;
    if (key === "all") return Number(filterCounts.all);
    if (key === "decisions") return Number(filterCounts.with_decisions);
    return Number(filterCounts.pending);
  };

  const sections: NavSection[] = [
    { id: "decisions", label: "Decisions", count: decisions.rows.length },
    { id: "upcoming", label: "Upcoming", count: upcoming.rows.length },
    { id: "past", label: "Past meetings", count: past.rows.length },
    { id: "how", label: "How this is read" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">Meetings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Where decisions get made
        </h1>
        <p className="muted mt-2 max-w-prose">
          Every published meeting of the City Council, Planning and Zoning, and the
          city&rsquo;s commissions — with the agenda, the minutes, and the motions each
          body actually voted on, read out of the minutes themselves.
        </p>
      </section>

      {totals && Number(totals.motions_total) > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Decisions recorded" value={Number(totals.motions_total).toLocaleString("en-US")} />
          <Stat
            label="Passed"
            value={totals.carried}
            detail="see them all"
            href={dynamicHref("/meetings?outcome=carried")}
          />
          <Stat
            label="Did not pass"
            // Matches the filter, which counts tabled and withdrawn motions
            // alongside failed ones -- all of them are a motion not passing.
            value={decisionTotals ? decisionTotals.failed : totals.failed}
            detail={Number(totals.unstated) > 0 ? totals.unstated + " outcome not stated" : undefined}
            href={dynamicHref("/meetings?outcome=failed")}
          />
          <Stat
            label="Minutes read"
            value={totals.meetings_read}
            detail={Number(totals.scanned) > 0 ? totals.scanned + " scanned, unreadable" : undefined}
          />
        </div>
      ) : null}

      <WithSectionNav sections={sections}>
        <div className="space-y-10">
          <section id="decisions">
            <SectionHeading
              title="Decisions"
              hint="Motions as recorded in the minutes, newest first."
            />

            <div className="mb-3 flex flex-wrap gap-2">
              {DECISION_FILTERS.map((option) => {
                const active = decisionFilter === option.key;
                const count = decisionTotals
                  ? Number(decisionTotals[option.key as keyof typeof decisionTotals])
                  : undefined;
                return (
                  <Link
                    key={option.key}
                    href={
                      option.key === "all"
                        ? "/meetings"
                        : { pathname: "/meetings", query: { outcome: option.key } }
                    }
                    scroll={false}
                    title={option.hint}
                    className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
                    style={
                      active
                        ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                        : undefined
                    }
                  >
                    {option.label}
                    {count !== undefined ? (
                      <span className="faint mono ml-1.5">{count}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>

            {/* The unfiltered hint just restates the section heading. */}
            {decisionFilter !== "all" ? (
              <p className="muted mb-4 max-w-prose text-sm">{activeDecision.hint}</p>
            ) : null}

            {/*
              Worth stating wherever these are filtered: the outcome describes
              the motion, not the thing. "Deny the application of College Cabs"
              carried -- that is the city refusing something, recorded as a
              motion that passed.
            */}
            {decisionFilter === "carried" || decisionFilter === "refusals" ? (
              <p
                className="card mb-4 p-3 text-sm"
                style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
              >
                <strong>Carried means the motion passed, not that a thing was
                approved.</strong>{" "}
                A motion to <em>deny</em> that carried is the city voting something down.
                Read the wording of each motion, not just its badge.
              </p>
            ) : null}

            {decisions.rows.length === 0 ? (
              <EmptyState
                error={decisions.error}
                emptyMessage={
                  decisionFilter === "all"
                    ? "No decisions have been parsed yet."
                    : "No decisions match this filter."
                }
                hint={
                  decisionFilter === "all"
                    ? "Run npm run ingest:minutes to read the published minutes."
                    : undefined
                }
              />
            ) : (
              <ul className="card px-4">
                {decisions.rows.map((decision) => (
                  <MotionCard
                    key={decision.id}
                    motion={decision}
                    context={
                      <Link href={meetingHref(decision.meeting_id)} className="link-underline">
                        {decision.body} · {formatDateTime(decision.starts_at)}
                      </Link>
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section id="upcoming">
            <SectionHeading
              title="Upcoming"
              hint="Agendas are usually posted a few days before the meeting."
            />
            {upcoming.rows.length === 0 ? (
              <EmptyState
                error={upcoming.error}
                emptyMessage="No upcoming meetings are published."
              />
            ) : (
              <RowList>
                {upcoming.rows.map((meeting) => (
                  <MeetingEntry key={meeting.id} meeting={meeting} summary={summaryById.get(meeting.id)} />
                ))}
              </RowList>
            )}
          </section>

          <section id="past">
            <SectionHeading
              title="Past meetings"
              hint="Filtered to the ones whose minutes we could read, by default."
            />

            <div className="mb-4 flex flex-wrap gap-2">
              {FILTERS.map((option) => {
                const isActive = filter === option.key;
                const count = countFor(option.key);
                return (
                  <Link
                    key={option.key}
                    href={
                      option.key === "decisions"
                        ? "/meetings"
                        : { pathname: "/meetings", query: { show: option.key } }
                    }
                    scroll={false}
                    className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
                    style={
                      isActive
                        ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                        : undefined
                    }
                  >
                    {option.label}
                    {count !== undefined ? (
                      <span className="faint mono ml-1.5">{count}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>

            {past.rows.length === 0 ? (
              <EmptyState
                error={past.error}
                emptyMessage={
                  filter === "decisions"
                    ? "No past meetings with recorded decisions yet."
                    : "No past meetings match this filter."
                }
              />
            ) : (
              <RowList>
                {past.rows.map((meeting) => (
                  <MeetingEntry key={meeting.id} meeting={meeting} summary={summaryById.get(meeting.id)} />
                ))}
              </RowList>
            )}
          </section>

          <section id="how" className="card p-5 text-sm" style={{ background: "var(--opinion)" }}>
            <h2 className="font-semibold">How decisions are read</h2>
            <p className="muted mt-2 max-w-prose">
              Minutes are parsed for motions: who moved, who seconded, what was moved, and
              the vote as printed. Nothing is summarised or interpreted. Where the minutes
              record a vote but state no result, the site says the outcome was not stated
              rather than inferring one — a unanimous aye almost certainly carried, but
              &ldquo;almost certainly&rdquo; is not a public record.
            </p>
            <p className="muted mt-2 max-w-prose">
              {filterCounts && Number(filterCounts.scanned) > 0
                ? Number(filterCounts.scanned) +
                  " sets of minutes are published as scanned images with no text layer. Those are marked unreadable rather than shown as meetings that decided nothing."
                : "Minutes published as scanned images are marked unreadable rather than shown as meetings that decided nothing."}
            </p>
            <p className="faint mt-2 max-w-prose">
              Public comment periods are usually open at Council meetings; hearings have
              their own deadlines. Contact the City Clerk at{" "}
              <a href="tel:+12088837015" className="link-underline">
                (208) 883-7015
              </a>
              .
            </p>
          </section>
        </div>
      </WithSectionNav>
    </div>
  );
}
