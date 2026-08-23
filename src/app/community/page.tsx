import Link from "next/link";
import type { Metadata } from "next";

import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, EmptyState, Row, RowList, SectionHeading, Stat } from "@/components/ui";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import { cityNews, meetingBodies, upcomingCalendar } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community & calendar",
  description:
    "The civic calendar for Moscow, Idaho, city announcements, and where to follow local news and public discussion.",
};

/** Group calendar entries by calendar day. */
function byDay(entries: Array<{ starts_at: Date }>) {
  const days = new Map<string, Array<{ starts_at: Date }>>();
  for (const entry of entries) {
    const key = formatDate(entry.starts_at);
    const bucket = days.get(key);
    if (bucket) bucket.push(entry);
    else days.set(key, [entry]);
  }
  return [...days.entries()];
}

const NEWS_SOURCES = [
  {
    name: "Moscow-Pullman Daily News",
    url: "https://www.dnews.com/",
    note: "The paper of record for Moscow and the Palouse. Paywalled — we link, we do not reproduce.",
  },
  {
    name: "Idaho Capital Sun",
    url: "https://idahocapitalsun.com/",
    note: "Statewide non-profit newsroom; covers legislation affecting cities.",
  },
  {
    name: "University of Idaho Argonaut",
    url: "https://www.uiargonaut.com/",
    note: "Student newspaper, and often the only outlet at campus-adjacent stories.",
  },
  {
    name: "Moscow Chamber of Commerce events",
    url: "https://moscowchamber.com/community/events-calendar/",
    note: "The broadest listing of community events.",
  },
  {
    name: "Moscow Farmers Market",
    url: "https://www.ci.moscow.id.us/197/Community-Events-Moscow-Farmers-Market",
    note: "Saturdays, May through October, on Main Street.",
  },
];

const DISCUSSION = [
  { name: "r/Moscow", url: "https://www.reddit.com/r/Moscow/" },
  { name: "r/UIdaho", url: "https://www.reddit.com/r/UIdaho/" },
  { name: "r/Palouse", url: "https://www.reddit.com/r/Palouse/" },
];

export default async function CommunityPage() {
  const [calendar, news, bodies] = await Promise.all([
    upcomingCalendar(45, 120),
    cityNews(24, "alerts"),
    meetingBodies(),
  ]);

  const days = byDay(calendar.rows);
  const thisWeek = calendar.rows.filter(
    (e) => new Date(e.starts_at).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000,
  );

  const sections: NavSection[] = [
    { id: "calendar", label: "Civic calendar", count: calendar.rows.length },
    { id: "announcements", label: "City announcements", count: news.rows.length },
    { id: "news", label: "Local news", count: NEWS_SOURCES.length },
    { id: "opinion", label: "Opinion & chatter" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">Community</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          What is on, and what the city is saying
        </h1>
        <p className="muted mt-2 max-w-prose">
          One calendar for every public meeting in Moscow, the city&rsquo;s own
          announcements, and — kept firmly separate — where to find local news and public
          discussion.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="This week" value={thisWeek.length} detail="public meetings" />
        <Stat label="Next 45 days" value={calendar.rows.length} detail="scheduled" />
        <Stat label="Bodies meeting" value={bodies.rows.length} detail="councils & commissions" />
        <Stat
          label="Subscribe"
          value={<span className="text-base">.ics</span>}
          detail="add to your calendar"
          href={dynamicHref("/calendar.ics")}
        />
      </div>

      <WithSectionNav sections={sections}>
        <div className="space-y-10">
          <section id="calendar">
            <SectionHeading
              title="Civic calendar"
              hint="Every published meeting for the next 45 days."
              action={
                <a href="/calendar.ics" className="link-underline text-sm">
                  Subscribe (.ics)
                </a>
              }
            />
            {calendar.rows.length === 0 ? (
              <EmptyState
                error={calendar.error}
                emptyMessage="No meetings are scheduled in the next 45 days."
              />
            ) : (
              <div className="space-y-4">
                {days.map(([day, entries]) => (
                  <div key={day}>
                    <h3 className="eyebrow mb-1.5">{day}</h3>
                    <ul className="card px-4">
                      {(entries as typeof calendar.rows).map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2 last:border-b-0"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <span className="min-w-0 text-sm">
                            <Link
                              href={dynamicHref("/meetings/" + entry.id)}
                              className="font-medium hover:text-[var(--accent)]"
                            >
                              {entry.body}
                            </Link>
                            {entry.location ? (
                              <span className="muted"> · {entry.location}</span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {entry.has_agenda ? (
                              <a
                                href={entry.agenda_url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link-underline text-xs"
                              >
                                Agenda
                              </a>
                            ) : (
                              <span className="faint text-xs">No agenda yet</span>
                            )}
                            <span className="faint mono text-xs">
                              {new Date(entry.starts_at).toLocaleTimeString("en-US", {
                                timeZone: "America/Los_Angeles",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="announcements">
            <SectionHeading
              title="City announcements"
              hint="From the city's own alert feed."
            />
            {news.rows.length === 0 ? (
              <EmptyState
                error={news.error}
                emptyMessage="No announcements have been ingested yet."
                hint="Run npm run ingest:news to pull the city feeds."
              />
            ) : (
              <RowList>
                {news.rows.map((item) => (
                  <Row key={item.guid}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="min-w-0 font-medium">
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[var(--accent)]"
                          >
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                      </h3>
                      {item.published_at ? (
                        <span className="faint text-xs">{relativeTime(item.published_at)}</span>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="muted mt-0.5 max-w-prose text-sm">{item.description}</p>
                    ) : null}
                  </Row>
                ))}
              </RowList>
            )}
          </section>

          <section id="news">
            <SectionHeading
              title="Local news"
              hint="Where Moscow is actually covered. We link out; we do not republish."
            />
            <ul className="space-y-2">
              {NEWS_SOURCES.map((source) => (
                <li key={source.url} className="card p-3">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline font-medium"
                  >
                    {source.name}
                  </a>
                  <p className="muted mt-0.5 text-sm">{source.note}</p>
                </li>
              ))}
            </ul>
            <p className="faint mt-3 max-w-prose text-xs">
              Automated headline aggregation is not built. The Daily News is paywalled and
              publishes no open feed, so any listing here would be hand-maintained — which
              is worse than sending you straight to the source.
            </p>
          </section>

          <section
            id="opinion"
            className="card p-5"
            style={{ background: "var(--opinion)" }}
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold tracking-tight">Opinion &amp; chatter</h2>
              <Badge tone="warn">Not reporting</Badge>
            </div>
            <p className="muted mt-2 max-w-prose text-sm">
              Everything else on this site reports what happened. This is a different kind
              of thing — what people are saying about it — so it is kept in its own lane
              and never mixed into the factual sections.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {DISCUSSION.map((forum) => (
                <a
                  key={forum.url}
                  href={forum.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--accent)]"
                  style={{ background: "var(--surface)" }}
                >
                  {forum.name}
                </a>
              ))}
            </div>

            <p className="faint mt-4 max-w-prose text-xs">
              A practical limit worth stating plainly: Facebook groups and Nextdoor carry a
              great deal of Moscow conversation and have no usable public API, so no
              aggregation here could be representative. Rather than present a skewed
              sample as &ldquo;what people think&rdquo;, this section points you at the
              places and lets you read them yourself.
            </p>
          </section>
        </div>
      </WithSectionNav>
    </div>
  );
}
