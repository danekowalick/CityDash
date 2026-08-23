import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About & corrections",
  description:
    "What City Dash is, the rules it follows about police data, and how to ask for a correction.",
};

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow">About</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          What this is, and what it is not
        </h1>
        <p className="muted mt-2 max-w-prose">
          City Dash collects public records about Moscow, Idaho and puts them in one
          place. It reports what happened — meetings held, calls logged, ordinances
          adopted. It does not editorialise, and the factual sections carry no opinion.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">No AI in the pipeline</h2>
        <p className="muted max-w-prose">
          Nothing on this site is written, summarised, or interpreted by a language model.
          Every record is parsed deterministically from a published document, every count
          is counted, and every code change is produced by a text diff. When a parser
          cannot read something, the site says so rather than guessing. See{" "}
          <Link href="/sources" className="link-underline">
            sources and data health
          </Link>{" "}
          for the current state of every feed.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">
          How we handle police data
        </h2>
        <div className="card space-y-3 p-5 text-sm">
          <p className="muted max-w-prose">
            The daily press log is a record of <strong>calls for service</strong>. Someone
            called; an officer responded. That is all an entry means. It is not a charge,
            not an arrest, and not a finding of guilt. A great many entries resolve to
            nothing whatsoever.
          </p>
          <p className="muted max-w-prose">
            The rules this site follows, decided before any of it was built:
          </p>
          <ul className="muted list-disc space-y-1 pl-5">
            <li>
              <strong>No names.</strong> MPD does not publish them in the log, and we would
              not republish them if it did.
            </li>
            <li>
              <strong>Block-level addresses only</strong>, shown exactly as published. We
              do not resolve them to a household.
            </li>
            <li>
              <strong>Individual incident pages will carry noindex</strong> when they exist,
              so this does not become a permanent search-engine record of someone&rsquo;s
              worst night. Today incidents appear only in aggregate listings.
            </li>
            <li>
              <strong>Gaps are disclosed.</strong> Case numbers run sequentially; when a
              published log skips one, we show that rather than presenting a partial day
              as complete.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">
          What this site can and cannot show
        </h2>
        <p className="muted max-w-prose">
          Some things a resident would reasonably want are not obtainable, and saying so
          is part of reporting honestly:
        </p>
        <ul className="muted mt-2 max-w-prose list-disc space-y-1.5 pl-5 text-sm">
          <li>
            <strong>Home sale prices.</strong> Idaho is a non-disclosure state — sellers
            are not required to report what a property sold for, so the figure is not in
            any public record.
          </li>
          <li>
            <strong>School performance data.</strong> The Idaho Report Card is a Blazor
            Server application that renders over a WebSocket and publishes no data files,
            so there is no endpoint to read. The Schools section links out instead.
          </li>
          <li>
            <strong>Some minutes.</strong> A number are published as scanned images with
            no text layer. Those meetings are marked unreadable rather than shown as
            having decided nothing.
          </li>
          <li>
            <strong>Ordinance PDFs.</strong> The city&rsquo;s Document Center renders its
            ordinance folders through a JavaScript grid we have not found a reliable way
            to read. Ordinance history is reconstructed from the code text instead.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Corrections & takedowns</h2>
        <p className="muted max-w-prose">
          If something here is wrong, we want to fix it. Because every record links to its
          source document, most errors are one of two kinds: the source itself is wrong —
          in which case the city or county has to correct it, and we will pick up the
          correction — or our parser misread it, which is ours to fix and worth telling us
          about.
        </p>
        <p className="muted mt-2 max-w-prose">
          Requests to remove a specific record are considered on their merits. Tell us the
          case number or record link and why.
        </p>
        <p className="faint mt-2 max-w-prose text-sm">
          Set a real contact address here before this site goes public — it is also the
          address carried in the crawler&rsquo;s User-Agent.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Not affiliated with the city</h2>
        <p className="muted max-w-prose">
          City Dash is an independent project. It is not operated by, endorsed by, or
          affiliated with the City of Moscow, Latah County, the Moscow Police Department,
          or the University of Idaho. For official information, go to the source links on
          every record.
        </p>
      </section>
    </div>
  );
}
