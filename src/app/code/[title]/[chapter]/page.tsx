import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CodeDiffView } from "@/components/CodeDiff";
import { Badge, SectionHeading } from "@/components/ui";
import { diffChapterText } from "@/lib/diff";
import type { CodeSection } from "@/lib/parsers/cityCode";
import { formatDate, formatDateTime, pluralise } from "@/lib/format";
import { chapterHref, ordinanceHref } from "@/lib/routes";
import {
  codeChapter,
  codeVersions,
  ordinancesForChapter,
  type CodeVersionRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ title: string; chapter: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { title, chapter } = await params;
  const found = await codeChapter(title + "/" + chapter);
  const row = found.rows[0];
  if (!row) return { title: "Chapter not found" };
  return {
    title: row.chapter_label + " — " + row.chapter_name,
    description: row.title_name + ", " + row.chapter_label + " of the Moscow city code.",
  };
}

function sectionsOf(version: CodeVersionRow): CodeSection[] {
  return Array.isArray(version.sections) ? (version.sections as CodeSection[]) : [];
}

const STATUS_NOTE: Record<string, string> = {
  repealed: "This chapter has been repealed. It no longer contains any law.",
  reserved: "This chapter number is reserved. It has never contained any law.",
  moved: "This chapter has been moved elsewhere in the code and its number reserved.",
};

export default async function ChapterPage({ params, searchParams }: PageProps) {
  const { title, chapter } = await params;
  const { from, to } = await searchParams;
  const slug = title + "/" + chapter;

  const [found, versions, ords] = await Promise.all([
    codeChapter(slug),
    codeVersions(slug),
    ordinancesForChapter(slug),
  ]);

  const meta = found.rows[0];
  if (!meta && found.error === null) notFound();
  if (!meta) {
    return (
      <div className="card p-6 text-sm">
        <p className="muted">This chapter could not be loaded.</p>
        <p className="faint mono mt-2 text-xs">{found.error}</p>
      </div>
    );
  }

  const latest = versions.rows[0] ?? null;
  const status = latest?.status ?? "active";
  const statusOrdinance = latest?.status_ordinance ?? null;

  // A diff is shown only when the reader asked for a specific pair.
  const fromVersion = from ? versions.rows.find((v) => v.id === from) : undefined;
  const toVersion = to ? versions.rows.find((v) => v.id === to) : undefined;
  const diff =
    fromVersion && toVersion
      ? diffChapterText(
          fromVersion.text,
          toVersion.text,
          sectionsOf(fromVersion),
          sectionsOf(toVersion),
        )
      : null;

  const sections = latest ? sectionsOf(latest) : [];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">
          <Link href="/code" className="link-underline">
            Code
          </Link>
          <span className="mx-2">/</span>
          {meta.title_name}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {meta.chapter_label} — {meta.chapter_name}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {status !== "active" ? <Badge tone="alert">{status}</Badge> : null}
          <a
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline"
          >
            Official PDF
          </a>
          {latest ? (
            <span className="faint text-xs">
              {pluralise(latest.page_count, "page")} ·{" "}
              {pluralise(latest.section_count, "section")} · captured{" "}
              {formatDateTime(latest.captured_at)}
            </span>
          ) : (
            <span className="faint text-xs">Not yet captured</span>
          )}
        </div>

        {status !== "active" ? (
          <p
            className="card mt-4 p-4 text-sm"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            {STATUS_NOTE[status] ?? "This chapter is not active."}
            {statusOrdinance ? (
              <>
                {" "}
                The change was made by{" "}
                <Link href={ordinanceHref(statusOrdinance)} className="link-underline">
                  Ordinance {statusOrdinance}
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/* Diff, when two versions were selected -------------------------- */}
      {diff ? (
        <section>
          <SectionHeading
            title="What changed"
            hint={
              fromVersion && toVersion
                ? "Between the captures of " +
                  formatDate(fromVersion.captured_at) +
                  " and " +
                  formatDate(toVersion.captured_at) +
                  "."
                : undefined
            }
            action={
              <Link href={chapterHref(slug)} className="link-underline text-sm">
                Clear
              </Link>
            }
          />
          <CodeDiffView diff={diff} />
        </section>
      ) : null}

      {/* Version history ------------------------------------------------- */}
      {versions.rows.length > 1 ? (
        <section>
          <SectionHeading
            title="Captures"
            hint="Each time the published PDF changed, we kept a copy. Compare any two."
          />
          <ul className="card px-4">
            {versions.rows.map((version, index) => {
              const previous = versions.rows[index + 1];
              return (
                <li
                  key={version.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2 last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="text-sm">
                    {formatDateTime(version.captured_at)}
                    <span className="faint mono ml-2 text-xs">
                      {version.content_hash.slice(0, 10)}
                    </span>
                  </span>
                  {previous ? (
                    <Link
                      href={{
                        pathname: chapterHref(slug),
                        query: { from: previous.id, to: version.id },
                      }}
                      className="link-underline text-sm"
                    >
                      Diff against previous
                    </Link>
                  ) : (
                    <span className="faint text-xs">First capture</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : versions.rows.length === 1 ? (
        <section>
          <div className="card p-4 text-sm">
            <p className="muted">
              One capture on file, from {formatDateTime(versions.rows[0].captured_at)}. A diff
              becomes possible the next time the city republishes this chapter.
            </p>
          </div>
        </section>
      ) : null}

      {/* Amendment history ------------------------------------------------ */}
      {ords.rows.length > 0 ? (
        <section>
          <SectionHeading
            title="Ordinances that amended this chapter"
            hint="Read from the citations printed in the chapter itself."
          />
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
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Current text ----------------------------------------------------- */}
      {sections.length > 0 ? (
        <section>
          <SectionHeading
            title="Current text"
            hint="Extracted from the city's PDF. The PDF remains authoritative."
          />
          <ul className="card px-4">
            {sections.map((section) => (
              <li
                key={section.number}
                className="border-b py-3 last:border-b-0"
                style={{ borderColor: "var(--border)" }}
              >
                <h3 className="text-sm font-medium">
                  <span className="mono">§ {section.number}</span>
                  {section.heading ? (
                    <span className="muted ml-2 font-normal">{section.heading}</span>
                  ) : null}
                </h3>
                <p className="muted mt-1 text-sm leading-relaxed">
                  {section.text.length > 900 ? section.text.slice(0, 900) + " …" : section.text}
                </p>
              </li>
            ))}
          </ul>
          <p className="faint mt-2 text-xs">
            Long sections are truncated here. Read the{" "}
            <a href={meta.url} target="_blank" rel="noopener noreferrer" className="link-underline">
              official PDF
            </a>{" "}
            for the complete text.
          </p>
        </section>
      ) : null}
    </div>
  );
}
