import { upcomingCalendar } from "@/lib/queries";
import { buildCalendar, icsTimestamp, meetingEventLines } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * The civic calendar as a subscribable feed.
 *
 * A resident who wants to know when their commission meets should not have to
 * remember to check a website. Subscribing puts it in the calendar they
 * already use.
 */
export async function GET() {
  const { rows } = await upcomingCalendar(180, 400);
  const stamp = icsTimestamp(new Date());

  const events = rows.flatMap((entry) =>
    meetingEventLines(
      {
        id: entry.id,
        body: entry.body,
        startsAt: entry.starts_at,
        location: entry.location,
        agendaUrl: entry.agenda_url,
        sourceUrl: entry.source_url,
      },
      stamp,
    ),
  );

  const body = buildCalendar(events, {
    name: "Moscow, Idaho — public meetings",
    description: "Published meetings of the City Council and city commissions.",
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="moscow-civic-calendar.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
}
