import Link from "next/link";
import type { Metadata } from "next";

import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, EmptyState, Row, RowList, SectionHeading, Stat } from "@/components/ui";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { chapterHref, ordinanceHref } from "@/lib/routes";
import {
  trackedDecisions,
  trackerStats,
  codeChapters,
  codeCurrency,
  ordinances,
  recentCodeChanges,
  type CodeChapterRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "City code & ordinances",
  description:
    "Every chapter of the Moscow city code, tracked for changes, with the ordinances that amended it.",
};

function groupByTitle(chapters: CodeChapterRow[]) {
  const groups = new Map<string, { name: string; chapters: CodeChapterRow[] }>();
  for (const chapter of chapters) {
    const existing = groups.get(chapter.title_label);
    if (existing) existing.chapters.push(chapter);
    else groups.set(chapter.title_label, { name: chapter.title_name, chapters: [chapter] });
  }
  return [...groups.entries()];
}

export default async function CodePage() {
  const [chapters, changes, currency, ords, tracked, tstats] = await Promise.all([
    codeChapters(),
    recentCodeChanges(15),
    codeCurrency(),
    ordinances(24),
    trackedDecisions(20),
    trackerStats(),
  ]);

  const stamp = currency.rows[0]?.stamp ?? null;
  const captured = chapters.rows.filter((c) => c.captured_at !== null);
  const totalSections = captured.reduce((sum, c) => sum + (c.section_count ?? 0), 0);
  const grouped = groupByTitle(chapters.rows);

  const sections: NavSection[] = [
    { id: "tracked", label: "Followed end to end", count: tracked.rows.length },
    { id: "changes", label: "Recent changes", count: changes.rows.length },
    { id: "ordinances", label: "Ordinances", count: ords.rows.length },
    { id: "chapters", label: "The whole code", count: chapters.rows.length },
    { id: "how", label: "How detection works" },
  ];

  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow">Code &amp; Ordinances</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          What the rules are, and when they change
        </h1>
        <p className="muted mt-2 max-w-prose">
          Every chapter of the Moscow city code is captured on a schedule and hashed. When
          the city publishes a new version, we diff it against the previous one and show
          the language that actually changed — computed by a text diff, not summarised.
        </p>
        {stamp ? (
          <p className="muted mt-2 text-sm">
            The city states its code is current through <strong>{stamp}</strong>.
          </p>
        ) : null}
      </section>

      {chapters.rows.length === 0 ? (
        <EmptyState
          error={chapters.error}
          emptyMessage="The city code has not been ingested yet."
          hint="Run npm run ingest:code to capture all 128 chapters."
        />
      ) : (
        <WithSectionNav sections={sections}>
        <div className="space-y-10">
          <section>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Chapters tracked" value={chapters.rows.length} detail={grouped.length + " titles"} />
              <Stat label="Captured" value={captured.length} detail="with text on file" />
              <Stat label="Sections parsed" value={totalSections.toLocaleString("en-US")} />
              <Stat
                label="Ordinances cited"
                value={ords.rows.length >= 24 ? "24+" : ords.rows.length}
                detail="read from the code itself"
              />
            </div>
          </section>

          {/* Decision Tracker ---------------------------------------------- */}
          <section id="tracked">
            <SectionHeading
              title="Followed end to end"
              hint="Ordinances traced from the council vote that passed them to the code they changed."
            />
            {tracked.rows.length === 0 ? (
              <div className="card p-6 text-sm">
                <p className="muted">
                  No ordinance yet links to a meeting we hold minutes for.
                </p>
              </div>
            ) : (
              <RowList>
                {tracked.rows.map((row) => (
                  <Row key={row.number}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <Link
                          href={ordinanceHref(row.number)}
                          className="mono font-medium hover:text-[var(--accent)]"
                        >
                          Ordinance {row.number}
                        </Link>
                        <p className="muted text-sm">
                          Adopted {formatDate(row.adopted_on)} · {row.body}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        <Badge tone="accent">
                          {row.chapter_count} chapter{Number(row.chapter_count) === 1 ? "" : "s"}
                        </Badge>
                        {Number(row.motion_count) > 0 ? (
                          <span className="faint mono">
                            {row.motion_count} motion{Number(row.motion_count) === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Row>
                ))}
              </RowList>
            )}
            {tstats.rows[0] ? (
              <p className="faint mt-2 text-xs">
                {tstats.rows[0].linked} of {tstats.rows[0].total_ordinances} ordinances can
                be followed to their adopting meeting. The rest were adopted before our
                meeting records begin, or on a date we hold no Council meeting for.
              </p>
            ) : null}
          </section>

          {/* Recent changes ------------------------------------------------ */}
          <section id="changes">
            <SectionHeading
              title="Recent changes"
              hint="Detected by comparing captures of the city's own PDFs."
            />
            {changes.rows.length === 0 ? (
              <div className="card p-6 text-sm">
                <p className="muted">
                  No changes detected yet. Change detection needs at least two captures of
                  a chapter — the first run establishes the baseline, and anything the city
                  amends after that shows up here.
                </p>
              </div>
            ) : (
              <RowList>
                {changes.rows.map((change) => (
                  <Row key={change.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <Link
                          href={{
                            pathname: chapterHref(change.chapter_slug),
                            query: { from: change.from_version_id, to: change.to_version_id },
                          }}
                          className="font-medium hover:text-[var(--accent)]"
                        >
                          {change.chapter_label} — {change.chapter_name}
                        </Link>
                        <p className="muted text-sm">{change.title_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-sm">
                        <span className="mono text-xs">
                          <span style={{ color: "var(--added-ink)" }}>+{change.words_added}</span>
                          <span className="faint"> / </span>
                          <span style={{ color: "var(--removed-ink)" }}>
                            &minus;{change.words_removed}
                          </span>
                        </span>
                        <span className="faint text-xs">{relativeTime(change.detected_at)}</span>
                      </div>
                    </div>
                  </Row>
                ))}
              </RowList>
            )}
          </section>

          {/* Ordinances ----------------------------------------------------- */}
          <section id="ordinances">
            <SectionHeading
              title="Ordinances"
              hint="Read out of the chapters they amended, so each links to the code it changed."
            />
            {ords.rows.length === 0 ? (
              <div className="card p-6 text-sm">
                <p className="muted">No ordinance citations found yet.</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ords.rows.map((ordinance) => (
                  <Link
                    key={ordinance.number}
                    href={ordinanceHref(ordinance.number)}
                    className="card px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--accent)]"
                  >
                    <span className="mono font-medium">{ordinance.number}</span>
                    {ordinance.adopted_on ? (
                      <span className="faint ml-2 text-xs">{formatDate(ordinance.adopted_on)}</span>
                    ) : null}
                    <span className="muted ml-2 text-xs">
                      {ordinance.chapter_count} ch.
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Full code ------------------------------------------------------ */}
          <section id="chapters">
            <SectionHeading title="The whole code" hint="Eleven titles, 128 chapters." />
            <div className="space-y-6">
              {grouped.map(([label, group]) => (
                <div key={label}>
                  <h3 className="eyebrow mb-2">{group.name}</h3>
                  <ul className="card px-4">
                    {group.chapters.map((chapter) => (
                      <li
                        key={chapter.slug}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2 last:border-b-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Link
                          href={chapterHref(chapter.slug)}
                          className="text-sm hover:text-[var(--accent)]"
                        >
                          <span className="mono faint mr-2 text-xs">
                            {chapter.chapter_label.replace("Chapter ", "")}
                          </span>
                          {chapter.chapter_name}
                        </Link>
                        <span className="flex shrink-0 items-center gap-2">
                          {Number(chapter.change_count) > 0 ? (
                            <Badge tone="warn">
                              {chapter.change_count} change
                              {Number(chapter.change_count) === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                          <span className="faint mono text-xs">
                            {chapter.section_count !== null
                              ? chapter.section_count + " §"
                              : "not captured"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
        </WithSectionNav>
      )}

      <section id="how" className="card p-5 text-sm" style={{ background: "var(--opinion)" }}>
        <h2 className="font-semibold">How change detection works</h2>
        <p className="muted mt-2 max-w-prose">
          Each chapter PDF is fetched and hashed. The hash is over the bytes the city
          published, not over our extracted text, so a change in our own extraction can
          never look like the city amending the code. When a hash moves, we extract the
          text, split it into numbered sections, and diff section by section — which is why
          the result says &ldquo;Section 4-3 changed&rdquo; rather than &ldquo;page 7
          changed&rdquo;, and why content shifting across a page break does not register as
          an amendment.
        </p>
        <p className="muted mt-2 max-w-prose">
          The city&rsquo;s PDF is always the authoritative version. Every chapter here
          links to it.
        </p>
        {currency.rows[0]?.updated_at ? (
          <p className="faint mt-2 text-xs">
            Code index last checked {formatDateTime(currency.rows[0].updated_at)}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
