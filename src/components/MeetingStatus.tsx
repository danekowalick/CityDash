import { Badge } from "./ui";
import { pluralise } from "@/lib/format";
import type { MeetingOutcomeSummary } from "@/lib/queries";

/**
 * What a reader can expect to find on a meeting, stated on the card itself.
 *
 * Before this, every past meeting looked identical, so opening one was a
 * coin-flip between recorded decisions and "minutes not published yet". The
 * five states below are genuinely different and each needs a different
 * expectation set:
 *
 *   decisions  -- minutes read, motions recorded. Worth opening.
 *   no-motions -- minutes read, but the body took no formal votes
 *                 (working groups and study sessions often do not).
 *   scanned    -- minutes published as an image; we cannot read them, but
 *                 the reader still can.
 *   pending    -- the meeting happened and minutes are not out yet.
 *   upcoming   -- it has not happened.
 */
export type MeetingState = "decisions" | "no-motions" | "scanned" | "pending" | "upcoming";

export function meetingState(
  summary: MeetingOutcomeSummary | undefined,
  startsAt: Date | string,
): MeetingState {
  const isPast = new Date(startsAt).getTime() < Date.now();
  if (!isPast) return "upcoming";
  if (!summary) return "pending";
  if (summary.is_scanned) return "scanned";
  return summary.motion_count > 0 ? "decisions" : "no-motions";
}

export function MeetingStatusBadge({
  state,
  motionCount,
}: {
  state: MeetingState;
  motionCount?: number;
}) {
  switch (state) {
    case "decisions":
      return <Badge tone="accent">{pluralise(motionCount ?? 0, "decision")}</Badge>;
    case "no-motions":
      return <Badge>No formal votes</Badge>;
    case "scanned":
      return <Badge tone="warn">Minutes not readable</Badge>;
    case "pending":
      return <Badge>Minutes pending</Badge>;
    case "upcoming":
      return null;
  }
}

/** One line of plain explanation, for the meeting page. */
export const MEETING_STATE_NOTE: Record<MeetingState, string | null> = {
  decisions: null,
  "no-motions":
    "No formal motions appear in these minutes. Working groups and study sessions often discuss without voting.",
  scanned:
    "These minutes are published as a scanned image with no text layer, so their decisions cannot be read automatically. That is not the same as the meeting deciding nothing.",
  pending:
    "Minutes have not been published yet. They usually appear after the body approves them at its following meeting.",
  upcoming: "This meeting has not happened yet.",
};
