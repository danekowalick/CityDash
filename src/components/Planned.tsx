import type { ReactNode } from "react";

export interface PlannedSource {
  name: string;
  url: string;
  status: "confirmed" | "needs-review" | "constrained";
  note: string;
}

const STATUS_LABEL: Record<PlannedSource["status"], string> = {
  confirmed: "Confirmed available",
  "needs-review": "Needs terms review",
  constrained: "Limited by law",
};

const STATUS_STYLE: Record<PlannedSource["status"], React.CSSProperties> = {
  confirmed: { background: "var(--accent-soft)", color: "var(--accent)" },
  "needs-review": { background: "var(--warn-soft)", color: "var(--warn)" },
  constrained: { background: "var(--warn-soft)", color: "var(--alert)" },
};

/**
 * A section that is planned but not yet built. Says plainly what it will
 * contain and which sources back it -- including the ones that turned out to
 * be legally or technically constrained. Promising a feature the data cannot
 * support would be worse than an empty page.
 */
export function Planned({
  eyebrow,
  title,
  intro,
  features,
  sources,
  caveat,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  features: string[];
  sources: PlannedSource[];
  caveat?: ReactNode;
}) {
  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="muted mt-2 max-w-prose">{intro}</p>
        <p
          className="mt-4 inline-block rounded border px-2 py-1 text-xs font-medium"
          style={{
            background: "var(--warn-soft)",
            color: "var(--warn)",
            borderColor: "transparent",
          }}
        >
          Not built yet
        </p>
      </section>

      {caveat ? (
        <section className="card p-5 text-sm" style={{ background: "var(--opinion)" }}>
          {caveat}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">What will be here</h2>
        <ul className="card muted list-disc space-y-1.5 py-4 pr-4 pl-9 text-sm">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Sources it will draw on</h2>
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.url} className="card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline font-medium"
                >
                  {source.name}
                </a>
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
                  style={STATUS_STYLE[source.status]}
                >
                  {STATUS_LABEL[source.status]}
                </span>
              </div>
              <p className="muted mt-1 text-sm">{source.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
