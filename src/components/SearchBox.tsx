import Link from "next/link";
import type { Route } from "next";

/**
 * Keyword search for a section of the site.
 *
 * A plain GET form, so it works with JavaScript disabled and the result is a
 * real URL you can bookmark or send to someone -- which matters for civic
 * records, where "here is the thing I mean" is half the point.
 *
 * Any other active filters are carried through as hidden fields, so searching
 * does not silently discard the view the reader had set up.
 */
export function SearchBox({
  action,
  placeholder,
  value,
  hidden,
  resultCount,
  label,
}: {
  action: Route;
  placeholder: string;
  value?: string;
  /** Other query params to preserve, e.g. an active outcome filter. */
  hidden?: Record<string, string | undefined>;
  /** Total matches, shown alongside a clear-search link. */
  resultCount?: number;
  label: string;
}) {
  const preserved = Object.entries(hidden ?? {}).filter(
    ([, v]) => v !== undefined && v !== "",
  );

  return (
    <div>
      <form action={action} method="get" role="search" className="flex flex-wrap gap-2">
        {preserved.map(([key, v]) => (
          <input key={key} type="hidden" name={key} value={v} />
        ))}
        <label htmlFor={"q-" + action} className="sr-only">
          {label}
        </label>
        <input
          id={"q-" + action}
          type="search"
          name="q"
          defaultValue={value ?? ""}
          placeholder={placeholder}
          className="card min-w-0 flex-1 px-3 py-2 text-sm"
          style={{ background: "var(--surface)", color: "var(--ink)" }}
        />
        <button
          type="submit"
          className="card px-3 py-2 text-sm font-medium transition-colors hover:border-[var(--accent)]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          Search
        </button>
      </form>

      {value ? (
        <p className="muted mt-2 text-sm">
          {resultCount !== undefined ? (
            <>
              <strong>{resultCount.toLocaleString("en-US")}</strong>{" "}
              {resultCount === 1 ? "match" : "matches"} for{" "}
            </>
          ) : (
            "Showing matches for "
          )}
          <span className="mono">&ldquo;{value}&rdquo;</span>
          <span className="faint mx-2">·</span>
          <Link href={action} className="link-underline">
            Clear search
          </Link>
        </p>
      ) : null}
    </div>
  );
}
