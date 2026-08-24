import { meetingById } from "@/lib/queries";
import { buildCalendar, icsTimestamp, meetingEventLines } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * One meeting as a calendar file, for "add to calendar".
 *
 * The subscribable feed at /calendar.ics is for someone who wants everything
 * ongoing. This is for someone who cares about one meeting -- a hearing on
 * their street -- and wants it in their calendar without subscribing to every
 * commission in the city.
 *
 * Content-Disposition is `attachment` here, deliberately and unlike the
 * minutes viewer: a download is what makes a phone or desktop hand the file
 * to the calendar app. Rendering it inline would show the reader raw
 * iCalendar text.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meetingId = Number(id);
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const { rows, error } = await meetingById(meetingId);
  if (error) return new Response("Meeting lookup failed", { status: 503 });

  const meeting = rows[0];
  if (!meeting) return new Response("No such meeting", { status: 404 });

  const stamp = icsTimestamp(new Date());
  const events = meetingEventLines(
    {
      id: meeting.id,
      body: meeting.body,
      startsAt: meeting.starts_at,
      location: meeting.location,
      agendaUrl: meeting.agenda_url,
      sourceUrl: meeting.source_url,
    },
    stamp,
  );

  const body = buildCalendar(events, {
    name: meeting.body,
    description: "A public meeting in Moscow, Idaho.",
  });

  const slug = meeting.body.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + (slug || "meeting") + "-" + meetingId + '.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
