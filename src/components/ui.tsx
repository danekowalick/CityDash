import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="muted mt-0.5 text-sm">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Shown when a query returns nothing. Distinguishes "ingestion has not run"
 * from "the database is not reachable" -- they need different fixes, and
 * blurring them wastes the reader's time.
 */
export function EmptyState({
  error,
  emptyMessage,
  hint,
}: {
  error: string | null;
  emptyMessage: string;
  hint?: string;
}) {
  if (error) {
    return (
      <div
        className="card p-4 text-sm"
        style={{ background: "var(--warn-soft)", borderColor: "var(--border-strong)" }}
      >
        <p className="font-medium" style={{ color: "var(--warn)" }}>
          The database could not be read.
        </p>
        <p className="muted mt-1">
          Run <code className="mono">npm run db:migrate</code> and{" "}
          <code className="mono">npm run ingest</code>, then reload. Details on{" "}
          <Link href="/sources" className="link-underline">
            the sources page
          </Link>
          .
        </p>
        <p className="faint mono mt-2 text-xs break-words">{error}</p>
      </div>
    );
  }

  return (
    <div className="card p-6 text-sm">
      <p className="muted">{emptyMessage}</p>
      {hint ? <p className="faint mt-1">{hint}</p> : null}
    </div>
  );
}

/** A headline number with its label and a link to what produced it. */
export function Stat({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: Route;
}) {
  const inner = (
    <>
      <span className="eyebrow block">{label}</span>
      <span className="mono mt-1 block text-3xl font-semibold leading-none">{value}</span>
      {detail ? <span className="muted mt-1.5 block text-sm">{detail}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card block p-4 transition-colors hover:border-[var(--accent)]">
        {inner}
      </Link>
    );
  }
  return <div className="card p-4">{inner}</div>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "alert";
}) {
  const palette = {
    neutral: { background: "var(--ground)", color: "var(--ink-muted)", borderColor: "var(--border)" },
    accent: { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" },
    warn: { background: "var(--warn-soft)", color: "var(--warn)", borderColor: "transparent" },
    alert: { background: "var(--warn-soft)", color: "var(--alert)", borderColor: "transparent" },
  }[tone];

  return (
    <span
      className="inline-block rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={palette}
    >
      {children}
    </span>
  );
}

/**
 * Provenance line. With no AI anywhere in the pipeline, showing exactly where
 * a figure came from is the whole credibility argument -- so it is a visible
 * component, not a footnote.
 */
export function SourceNote({
  publisher,
  href,
  checkedAt,
}: {
  publisher: string;
  href: string;
  checkedAt?: Date | string | null;
}) {
  return (
    <p className="faint mt-3 text-xs">
      Source:{" "}
      <a href={href} target="_blank" rel="noopener noreferrer" className="link-underline">
        {publisher}
      </a>
      {checkedAt ? <> · checked {new Date(checkedAt).toLocaleString("en-US")}</> : null}
    </p>
  );
}

/** A plain, scannable row. Every row is a complete unit of information. */
export function Row({ children }: { children: ReactNode }) {
  return (
    <li className="border-b py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      {children}
    </li>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <ul className="card px-4">{children}</ul>;
}
