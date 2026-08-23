import { upcomingCalendar } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * The civic calendar as a subscribable feed.
 *
 * A resident who wants to know when their commission meets should not have to
 * remember to check a website. Subscribing puts it in the calendar they
 * already use.
 */

/** RFC 5545 escaping: backslash, semicolon, comma, and newline. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Lines must be folded at 75 octets, continued with a leading space.
 * Calendar clients reject longer lines outright.
 */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest.length > 0) parts.push(" " + rest);
  return parts.join("\r\n");
}

export async function GET() {
  const { rows } = await upcomingCalendar(180, 400);
  const now = icsTimestamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//City Dash//Moscow Idaho civic calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Moscow, Idaho — public meetings",
    "X-WR-CALDESC:Published meetings of the City Council and city commissions.",
    "X-WR-TIMEZONE:America/Los_Angeles",
  ];

  for (const entry of rows) {
    const start = new Date(entry.starts_at);
    // The city does not publish end times; two hours is the usual length and
    // keeps the entry from rendering as an all-day block.
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

    const description = [
      entry.agenda_url ? "Agenda: " + entry.agenda_url : "Agenda not yet posted.",
      "Details: " + entry.source_url,
    ].join("\n");

    lines.push(
      "BEGIN:VEVENT",
      fold("UID:meeting-" + entry.id + "@citydash"),
      "DTSTAMP:" + now,
      "DTSTART:" + icsTimestamp(start),
      "DTEND:" + icsTimestamp(end),
      fold("SUMMARY:" + escapeText(entry.body)),
      fold("DESCRIPTION:" + escapeText(description)),
      fold("URL:" + entry.source_url),
    );
    if (entry.location) lines.push(fold("LOCATION:" + escapeText(entry.location)));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="moscow-civic-calendar.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
}
