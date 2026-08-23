import { Badge } from "./ui";
import type { MotionRow } from "@/lib/queries";

/**
 * One recorded decision.
 *
 * The vote is shown exactly as the minutes printed it, alongside the parsed
 * counts. Where the minutes state no outcome, the card says so rather than
 * inferring one from the tally -- a unanimous aye vote almost certainly means
 * the motion carried, but "almost certainly" is not a public record.
 */

const OUTCOME_TONE = {
  carried: "accent",
  failed: "alert",
  tabled: "warn",
  withdrawn: "warn",
  unknown: "neutral",
} as const;

const OUTCOME_LABEL: Record<MotionRow["outcome"], string> = {
  carried: "Carried",
  failed: "Failed",
  tabled: "Tabled",
  withdrawn: "Withdrawn",
  unknown: "Outcome not stated",
};

function VoteLine({ motion }: { motion: MotionRow }) {
  if (!motion.ayes_raw && !motion.nays_raw) {
    return <p className="faint mt-1 text-xs">No vote tally recorded in the minutes.</p>;
  }

  return (
    <p className="faint mt-1 text-xs">
      {motion.ayes_raw ? (
        <>
          <span className="font-medium">Ayes:</span> {motion.ayes_raw}
        </>
      ) : null}
      {motion.nays_raw ? (
        <>
          <span className="mx-1.5">·</span>
          <span className="font-medium">Nays:</span> {motion.nays_raw}
        </>
      ) : null}
      {motion.abstentions_raw && motion.abstentions_raw.toLowerCase() !== "none" ? (
        <>
          <span className="mx-1.5">·</span>
          <span className="font-medium">Abstained:</span> {motion.abstentions_raw}
        </>
      ) : null}
    </p>
  );
}

export function MotionCard({
  motion,
  context,
}: {
  motion: MotionRow;
  context?: React.ReactNode;
}) {
  const movedBy = motion.mover
    ? motion.mover + (motion.seconder ? ", seconded by " + motion.seconder : "")
    : motion.seconder
      ? "Moved (name not recorded), seconded by " + motion.seconder
      : "Mover not recorded";

  return (
    <li className="border-b py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 text-sm">{motion.action}</p>
        <Badge tone={OUTCOME_TONE[motion.outcome]}>{OUTCOME_LABEL[motion.outcome]}</Badge>
      </div>

      {context ? <p className="muted mt-0.5 text-sm">{context}</p> : null}
      <p className="muted mt-0.5 text-xs">{movedBy}</p>
      <VoteLine motion={motion} />
    </li>
  );
}
