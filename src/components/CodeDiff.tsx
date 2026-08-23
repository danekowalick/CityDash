import type { ChapterDiff, SectionChange } from "@/lib/diff";
import { Badge } from "./ui";

/**
 * Renders a computed code diff.
 *
 * Added and removed language is shown literally, marked with both colour and
 * a typographic cue (underline / strike-through) so the diff is still
 * readable without colour vision.
 */

function ChangeCounts({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="mono shrink-0 text-xs">
      {added > 0 ? (
        <span style={{ color: "var(--added-ink)" }}>+{added}</span>
      ) : null}
      {added > 0 && removed > 0 ? <span className="faint"> / </span> : null}
      {removed > 0 ? (
        <span style={{ color: "var(--removed-ink)" }}>&minus;{removed}</span>
      ) : null}
    </span>
  );
}

function WordDiff({ change }: { change: SectionChange }) {
  return (
    <p className="mt-2 text-sm leading-relaxed">
      {change.words.map((part, i) => {
        if (part.added) {
          return (
            <ins
              key={i}
              className="rounded-sm px-0.5 no-underline"
              style={{ background: "var(--added-bg)", color: "var(--added-ink)" }}
            >
              <span className="underline decoration-2 underline-offset-2">{part.value}</span>
            </ins>
          );
        }
        if (part.removed) {
          return (
            <del
              key={i}
              className="rounded-sm px-0.5"
              style={{ background: "var(--removed-bg)", color: "var(--removed-ink)" }}
            >
              {part.value}
            </del>
          );
        }
        return (
          <span key={i} className="muted">
            {part.value}
          </span>
        );
      })}
    </p>
  );
}

function SectionBlock({ change }: { change: SectionChange }) {
  const tone = change.kind === "added" ? "accent" : change.kind === "removed" ? "alert" : "warn";

  return (
    <li className="border-b py-4 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-medium">
          <span className="mono">§ {change.number}</span>
          {change.heading ? <span className="muted ml-2 font-normal">{change.heading}</span> : null}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={tone}>{change.kind}</Badge>
          <ChangeCounts added={change.wordsAdded} removed={change.wordsRemoved} />
        </div>
      </div>

      {change.kind === "changed" ? (
        <WordDiff change={change} />
      ) : (
        <p
          className="mt-2 rounded p-2 text-sm leading-relaxed"
          style={{
            background: change.kind === "added" ? "var(--added-bg)" : "var(--removed-bg)",
            color: change.kind === "added" ? "var(--added-ink)" : "var(--removed-ink)",
          }}
        >
          {change.text.length > 1200 ? change.text.slice(0, 1200) + " …" : change.text}
        </p>
      )}
    </li>
  );
}

export function CodeDiffView({ diff }: { diff: ChapterDiff }) {
  if (diff.changes.length === 0) {
    return (
      <div className="card p-6 text-sm">
        <p className="muted">
          No difference between these two captures. The chapter was re-published without a
          change to its text.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
        <span>
          <span className="mono font-semibold">{diff.sectionsChanged}</span>{" "}
          <span className="muted">sections amended</span>
        </span>
        {diff.sectionsAdded > 0 ? (
          <span>
            <span className="mono font-semibold">{diff.sectionsAdded}</span>{" "}
            <span className="muted">added</span>
          </span>
        ) : null}
        {diff.sectionsRemoved > 0 ? (
          <span>
            <span className="mono font-semibold">{diff.sectionsRemoved}</span>{" "}
            <span className="muted">removed</span>
          </span>
        ) : null}
        <span className="mono">
          <span style={{ color: "var(--added-ink)" }}>+{diff.wordsAdded}</span>
          <span className="faint"> / </span>
          <span style={{ color: "var(--removed-ink)" }}>&minus;{diff.wordsRemoved}</span>
          <span className="muted"> words</span>
        </span>
      </div>

      {diff.unstructuredChange ? (
        <p
          className="card mb-4 p-3 text-sm"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          The text changed but no section boundary accounts for it — most likely the city
          re-issued this chapter in a different layout. The whole-chapter diff is shown
          instead of a per-section one.
        </p>
      ) : null}

      <ul className="card px-4">
        {diff.changes.map((change) => (
          <SectionBlock key={change.kind + change.number} change={change} />
        ))}
      </ul>

      <p className="faint mt-3 text-xs">
        Computed by diffing the text of two captures of the city&rsquo;s own PDF. Long
        unchanged passages are elided with an ellipsis. Always check the linked PDF before
        relying on this.
      </p>
    </div>
  );
}
