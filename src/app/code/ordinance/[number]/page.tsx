import Link from "next/link";
import type { Metadata } from "next";

import { MotionCard } from "@/components/Motion";
import { Timeline, type TimelineStep } from "@/components/Timeline";
import { Badge, SectionHeading } from "@/components/ui";
import { formatDate, formatDateTime, pluralise } from "@/lib/format";
import { chapterHref, dynamicHref } from "@/lib/routes";
import {
  adoptingMeeting,
  chaptersAmendedBy,
  sectionsAmendedBy,
  codeReferencesForMeeting,
  motionsForMeeting,
  ordinances,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ number: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { number } = await params;
  return {
    title: "Ordinance " + number,
    description:
      "Ordinance " + number + " followed from the council vote to the city code it changed.",
  };
}

/**
 * Narrow a meeting's motions to the ones plausibly about an ordinance.
 *
 * The minutes never name the ordinance number in the motion -- the number is
 * assigned on adoption, after the text is written -- so a motion cannot be
 * tied to a specific ordinance with certainty. What we can do is prefer
 * motions that say "ordinance" at all, and tell the reader plainly that the
 * meeting covered other business too.
 */
function ordinanceMotions<T extends { action: string }>(
  motions: T[],
): { shown: T[]; narrowed: boolean; otherCount: number } {
  const mentionsOrdinance = motions.filter((m) => /\bordinance\b/i.test(m.action));
  if (mentionsOrdinance.length > 0) {
    return {
      shown: mentionsOrdinance,
      narrowed: true,
      otherCount: motions.length - mentionsOrdinance.length,
    };
  }

  const routine = /approval of the minutes|approve the minutes|adjourn|consent agenda/i;
  const substantive = motions.filter((m) => !routine.test(m.action));
  return { shown: substantive, narrowed: false, otherCount: 0 };
}

export default async function OrdinancePage({ params }: PageProps) {
  const { number } = await params;

  const [chapters, all, adopting, amended] = await Promise.all([
    chaptersAmendedBy(number),
    ordinances(500),
    adoptingMeeting(number),
    sectionsAmendedBy(number),
  ]);

  // Group the amended sections under their chapter for display.
  const byChapter = new Map<
    string,
    { label: string; title: string; sections: typeof amended.rows }
  >();
  for (const row of amended.rows) {
    const key = row.chapter_slug;
    const existing = byChapter.get(key);
    if (existing) existing.sections.push(row);
    else
      byChapter.set(key, {
        label:
          row.chapter_label && row.chapter_name
            ? row.chapter_label + " — " + row.chapter_name
            : row.chapter_slug,
        title: row.title_name ?? "",
        sections: [row],
      });
  }
  const amendedGroups = [...byChapter.entries()];

  const ordinance = all.rows.find((o) => o.number === number) ?? null;
  const meeting = adopting.rows[0] ?? null;

  // The vote and the chapters named in that meeting's minutes.
  const [motions, references] = meeting
    ? await Promise.all([
        motionsForMeeting(meeting.meeting_id),
        codeReferencesForMeeting(meeting.meeting_id),
      ])
    : [null, null];

  const votes = motions
    ? ordinanceMotions(motions.rows)
    : { shown: [], narrowed: false, otherCount: 0 };

  const steps: TimelineStep[] = [
    {
      label: "Adopted by the City Council",
      when: ordinance?.adopted_on ? formatDate(ordinance.adopted_on) : undefined,
      body: meeting ? (
        <div className="text-sm">
          <Link
            href={dynamicHref("/meetings/" + meeting.meeting_id)}
            className="link-underline font-medium"
          >
            {meeting.body} · {formatDateTime(meeting.starts_at)}
          </Link>
          <p className="faint mt-1 text-xs">
            Matched to this ordinance by its adoption date, which the code prints alongside
            the citation.
          </p>
        </div>
      ) : null,
      missingNote: ordinance?.adopted_on
        ? "We do not hold a City Council meeting for " +
          formatDate(ordinance.adopted_on) +
          ". Meeting records currently reach back to August 2020."
        : "No adoption date is printed alongside this ordinance's citations, so it cannot be matched to a meeting.",
    },
    {
      label: votes.narrowed ? "The vote" : "Motions at that meeting",
      body:
        meeting && meeting.is_scanned ? null : votes.shown.length > 0 ? (
          <div>
            <ul className="card px-4">
              {votes.shown.slice(0, 6).map((motion) => (
                <MotionCard key={motion.id} motion={motion} />
              ))}
            </ul>
            <p className="faint mt-2 text-xs">
              {votes.narrowed
                ? "Minutes do not print an ordinance number in the motion — the number is assigned on adoption — so these are the motions at this meeting that mention an ordinance." +
                  (votes.otherCount > 0
                    ? " " + pluralise(votes.otherCount, "other motion") + " covered separate business."
                    : "")
                : "No motion at this meeting names an ordinance, so these are its substantive motions. One of them likely adopted this ordinance, but the minutes do not say which."}
            </p>
          </div>
        ) : null,
      missingNote: meeting?.is_scanned
        ? "The minutes for this meeting are a scanned image with no text layer, so the vote cannot be read automatically."
        : meeting
          ? "Minutes for this meeting have not been read yet."
          : "No meeting to read a vote from.",
    },
    {
      label: "What it changed",
      body:
        amendedGroups.length > 0 ? (
          <div>
            <p className="muted mb-3 text-sm">
              {pluralise(amended.rows.length, "section")} across{" "}
              {pluralise(amendedGroups.length, "chapter")} carry this
              ordinance in their amendment history. Open one to read the language it
              now stands as.
            </p>

            <div className="space-y-4">
              {amendedGroups.map(([slug, group]) => (
                <div key={slug}>
                  <h4 className="mb-1 text-sm font-medium">
                    <Link href={chapterHref(slug)} className="hover:text-[var(--accent)]">
                      {group.label}
                    </Link>
                    <span className="muted ml-2 font-normal">{group.title}</span>
                  </h4>
                  <ul className="card px-4">
                    {group.sections.map((section) => (
                      <li
                        key={section.section_number}
                        className="border-b py-2 last:border-b-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {section.section_text ? (
                          <details>
                            <summary className="cursor-pointer text-sm">
                              <span className="mono font-medium">
                                § {section.section_number}
                              </span>
                              {section.section_heading ? (
                                <span className="muted ml-2">{section.section_heading}</span>
                              ) : null}
                            </summary>
                            <p className="muted mt-2 max-w-prose text-sm leading-relaxed">
                              {section.section_text.length > 2000
                                ? section.section_text.slice(0, 2000) + " …"
                                : section.section_text}
                            </p>
                          </details>
                        ) : (
                          <span className="text-sm">
                            <span className="mono font-medium">
                              § {section.section_number}
                            </span>
                            {section.section_heading ? (
                              <span className="muted ml-2">{section.section_heading}</span>
                            ) : null}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/*
              The distinction that matters, and the reason this is not a diff:
              every chapter's first capture was August 2026, so for an older
              ordinance there is no earlier text to compare against.
            */}
            <p
              className="card mt-3 p-3 text-xs"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              <strong>This is the wording as it now stands, not a before-and-after.</strong>{" "}
              Showing what an ordinance struck out needs a copy of the chapter from
              before it passed, and the first capture of every chapter here was taken in
              August 2026. Amendments made from now on will be diffed properly — added
              and removed language side by side — on the chapter&rsquo;s own page.
            </p>
          </div>
        ) : chapters.rows.length > 0 ? (
          <div>
            <ul className="card px-4">
              {chapters.rows.map((row) => (
                <li
                  key={row.slug}
                  className="border-b py-2 last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Link
                    href={chapterHref(row.slug)}
                    className="text-sm font-medium hover:text-[var(--accent)]"
                  >
                    {row.chapter_label} — {row.chapter_name}
                  </Link>
                  <p className="muted text-xs">{row.title_name}</p>
                </li>
              ))}
            </ul>
            <p className="faint mt-2 text-xs">
              These chapters cite this ordinance, but no individual section does —
              usually because the citation sits in a chapter preamble rather than
              against a numbered section.
            </p>
          </div>
        ) : null,
      missingNote:
        "No captured chapter cites this ordinance. It may have amended a chapter that has since been repealed, or changed something outside the codified text.",
    },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">
          <Link href="/code" className="link-underline">
            Code
          </Link>
          <span className="mx-2">/</span>
          Ordinance
        </p>
        <h1 className="mono mt-1 text-3xl font-semibold tracking-tight">
          Ordinance {number}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ordinance?.adopted_on ? (
            <Badge tone="accent">Adopted {formatDate(ordinance.adopted_on)}</Badge>
          ) : (
            <Badge>Adoption date not printed</Badge>
          )}
          {chapters.rows.length > 0 ? (
            <Badge>{pluralise(chapters.rows.length, "chapter")} amended</Badge>
          ) : null}
        </div>
      </section>

      <section>
        <SectionHeading
          title="How this became law"
          hint="Each step is here because a document records it."
        />
        <div className="card p-5">
          <Timeline steps={steps} />
        </div>
      </section>

      {references && references.rows.length > 0 ? (
        <section>
          <SectionHeading
            title="Named in the minutes"
            hint="Chapters the minutes of that meeting explicitly said were being amended."
          />
          <div className="flex flex-wrap gap-2">
            {references.rows.map((row) => (
              <Link
                key={row.chapter_slug}
                href={chapterHref(row.chapter_slug)}
                className="card px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--accent)]"
              >
                {row.chapter_label && row.chapter_name
                  ? row.chapter_label + " — " + row.chapter_name
                  : row.chapter_slug}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card p-5 text-sm" style={{ background: "var(--opinion)" }}>
        <h2 className="font-semibold">How this chain is built</h2>
        <p className="muted mt-2 max-w-prose">
          Two links, both exact. Each chapter of the code prints the ordinances that
          amended it with their adoption dates —
          <span className="mono"> (Ord. 2026-04, 07/06/2026)</span> — which gives the
          ordinance a date. That date is matched against City Council meetings to find the
          session that adopted it, and the minutes of that session supply the motion and
          the vote.
        </p>
        <p className="muted mt-2 max-w-prose">
          Nothing here is inferred or summarised. Where a link cannot be evidenced, the
          timeline says so rather than closing the gap with a guess.
        </p>
        <p className="faint mt-2 max-w-prose">
          The full text of adopted ordinances lives in the city&rsquo;s Document Center.
          Linking each ordinance to its own PDF needs the ordinance folder listing, which
          the portal renders through a JavaScript grid we have not yet worked out how to
          read reliably.
        </p>
      </section>
    </div>
  );
}
