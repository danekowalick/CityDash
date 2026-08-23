import type { ReactNode } from "react";

/**
 * A decision followed through its stages.
 *
 * Each step exists only because a document says so -- a minutes PDF recorded
 * the vote, a code chapter cites the ordinance. Steps we cannot evidence are
 * shown as gaps with an explanation rather than omitted, so the reader can
 * tell the difference between "this did not happen" and "we could not read
 * the record of it".
 */

export interface TimelineStep {
  label: string;
  when?: string;
  /** Null body renders as a gap: the step is unevidenced, not absent. */
  body: ReactNode | null;
  /** Shown in place of the body when it is null. */
  missingNote?: string;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const evidenced = step.body !== null;

        return (
          <li key={step.label} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Rail */}
            <div className="flex flex-col items-center" aria-hidden="true">
              <span
                className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: evidenced ? "var(--accent)" : "var(--border-strong)",
                }}
              />
              {!isLast ? (
                <span
                  className="mt-1 w-px grow"
                  style={{ background: "var(--border)" }}
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-semibold">{step.label}</h3>
                {step.when ? <span className="faint mono text-xs">{step.when}</span> : null}
              </div>

              {evidenced ? (
                <div className="mt-1.5">{step.body}</div>
              ) : (
                <p className="faint mt-1 text-sm">
                  {step.missingNote ?? "No record of this step in what we hold."}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
