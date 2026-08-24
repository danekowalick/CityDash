/**
 * Building iCalendar documents.
 *
 * Shared between the subscribable civic calendar and the single-event
 * "add to calendar" download, so both escape and fold identically. Calendar
 * clients are strict about both, and a feed that renders in one client and
 * silently fails in another is worse than none.
 */

/** RFC 5545 escaping: backslash, semicolon, comma, and newline. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC timestamp in the basic format iCalendar expects. */
export function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Lines must be folded at 75 octets, continued with a leading space.
 * Measured in octets rather than characters, because a name with an accent
 * in it is longer on the wire than it looks.
 */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 73) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 73;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = " " + char;
      currentBytes = 1 + size;
      limit = 74; // continuation lines carry a leading space
    } else {
      current += char;
      currentBytes += size;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts.join("\r\n");
}

export interface MeetingEvent {
  id: number;
  body: string;
  startsAt: Date | string;
  location: string | null;
  agendaUrl: string | null;
  sourceUrl: string;
}

/** The VEVENT block for one meeting. */
export function meetingEventLines(meeting: MeetingEvent, stamp: string): string[] {
  const start = new Date(meeting.startsAt);
  // The city does not publish end times; two hours is the usual length and
  // keeps the entry from rendering as an all-day block.
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const description = [
    meeting.agendaUrl ? "Agenda: " + meeting.agendaUrl : "Agenda not yet posted.",
    "Details: " + meeting.sourceUrl,
  ].join("\n");

  const lines = [
    "BEGIN:VEVENT",
    fold("UID:meeting-" + meeting.id + "@citydash"),
    "DTSTAMP:" + stamp,
    "DTSTART:" + icsTimestamp(start),
    "DTEND:" + icsTimestamp(end),
    fold("SUMMARY:" + escapeText(meeting.body)),
    fold("DESCRIPTION:" + escapeText(description)),
    fold("URL:" + meeting.sourceUrl),
  ];
  if (meeting.location) lines.push(fold("LOCATION:" + escapeText(meeting.location)));
  lines.push("END:VEVENT");
  return lines;
}

/** Wrap VEVENT blocks in a VCALENDAR, with CRLF endings and a trailing break. */
export function buildCalendar(
  eventLines: string[],
  options: { name: string; description: string },
): string {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//City Dash//Moscow Idaho civic calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      fold("X-WR-CALNAME:" + escapeText(options.name)),
      fold("X-WR-CALDESC:" + escapeText(options.description)),
      "X-WR-TIMEZONE:America/Los_Angeles",
      ...eventLines,
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n"
  );
}
