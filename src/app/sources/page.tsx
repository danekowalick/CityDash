import type { Metadata } from "next";

import { Badge, EmptyState, SectionHeading } from "@/components/ui";
import { formatCalendarDate } from "@/lib/format";
import { coverageStats, sourceHealth } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sources & data health",
  description:
    "Every feed City Dash ingests, how often it runs, whether it is currently working, and the terms review behind it.",
};

function statusBadge(status: string | null, enabled: boolean) {
  if (!enabled) return <Badge>Not enabled</Badge>;
  if (status === "ok") return <Badge tone="accent">Working</Badge>;
  if (status === "error") return <Badge tone="alert">Failing</Badge>;
  if (status === "running") return <Badge tone="warn">Running</Badge>;
  return <Badge tone="warn">Never run</Badge>;
}

export default async function SourcesPage() {
  const [sources, coverage] = await Promise.all([sourceHealth(), coverageStats()]);
  const stats = coverage.rows[0] ?? null;

  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow">Sources</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Where everything here comes from
        </h1>
        <p className="muted mt-2 max-w-prose">
          This site does no interpretation. It fetches published records, parses them into
          structured data, and links back to the original. This page lists every feed, how
          often it runs, whether it is currently working, and the terms review behind it.
        </p>
      </section>

      {stats ? (
        <section>
          <SectionHeading title="What we hold" />
          <dl className="card grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="eyebrow">Incidents</dt>
              <dd className="mono text-xl font-semibold">
                {Number(stats.incident_count).toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Daily logs</dt>
              <dd className="mono text-xl font-semibold">{stats.log_count}</dd>
            </div>
            <div>
              <dt className="eyebrow">Meetings</dt>
              <dd className="mono text-xl font-semibold">{stats.meeting_count}</dd>
            </div>
            <div>
              <dt className="eyebrow">Case gaps found</dt>
              <dd className="mono text-xl font-semibold">{stats.total_gaps}</dd>
            </div>
          </dl>
          {stats.earliest_log && stats.latest_log ? (
            <p className="faint mt-2 text-xs">
              Police logs held from {formatCalendarDate(stats.earliest_log)} to{" "}
              {formatCalendarDate(stats.latest_log)}.
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <SectionHeading
          title="Feeds"
          hint="A source is only enabled once someone has read the publisher's terms."
        />

        {sources.rows.length === 0 ? (
          <EmptyState
            error={sources.error}
            emptyMessage="The source registry is empty."
            hint="Run npm run db:migrate to create and populate it."
          />
        ) : (
          <ul className="space-y-3">
            {sources.rows.map((source) => (
              <li key={source.id} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <h3 className="font-medium">{source.name}</h3>
                    <p className="muted text-sm">{source.publisher}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{source.kind}</Badge>
                    <Badge>{source.cadence}</Badge>
                    {statusBadge(source.last_status, source.enabled)}
                  </div>
                </div>

                {source.terms_note ? (
                  <p className="muted mt-3 max-w-prose text-sm">{source.terms_note}</p>
                ) : (
                  <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>
                    No terms review recorded.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="faint link-underline break-all"
                  >
                    {source.url}
                  </a>
                  {source.last_finished_at ? (
                    <span className="faint">
                      Last run {new Date(source.last_finished_at).toLocaleString("en-US")}
                      {source.last_items_new !== null
                        ? " · " + source.last_items_new + " new"
                        : ""}
                    </span>
                  ) : null}
                </div>

                {source.last_error ? (
                  <p
                    className="mono mt-2 rounded p-2 text-xs break-words"
                    style={{ background: "var(--warn-soft)", color: "var(--alert)" }}
                  >
                    {source.last_error}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 text-sm" style={{ background: "var(--opinion)" }}>
        <h2 className="font-semibold">How we fetch</h2>
        <ul className="muted mt-2 max-w-prose list-disc space-y-1 pl-5">
          <li>robots.txt is fetched per host and honoured, including Crawl-delay.</li>
          <li>
            Requests carry a User-Agent naming this project and a contact address, so any
            operator can reach us rather than silently blocking us.
          </li>
          <li>Requests to one host are spaced out; 429 and 5xx responses back off.</li>
          <li>
            Unchanged pages are detected by content hash and are not reprocessed.
          </li>
        </ul>
        <p className="muted mt-3 max-w-prose">
          If you publish one of these sources and want us to change how we fetch it — or
          stop — get in touch and we will.
        </p>
      </section>
    </div>
  );
}
