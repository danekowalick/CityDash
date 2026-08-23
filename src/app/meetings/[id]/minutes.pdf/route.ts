import { minutesForMeeting } from "@/lib/queries";
import { politeFetchBytes } from "@/lib/fetcher";
import { looksLikePdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

/**
 * Serves a meeting's minutes PDF inline, so it can be read in the page rather
 * than downloaded.
 *
 * CivicClerk sends `Content-Disposition: attachment`, which makes a browser
 * save the file even inside an embedded viewer. That header is theirs and
 * cannot be changed from here, so the document is proxied and the disposition
 * rewritten to `inline`. Nothing else about the response is altered -- the
 * bytes are the city's.
 *
 * The upstream URL is looked up from the database by meeting id and is never
 * taken from the request. A route that fetched a caller-supplied URL would be
 * an open proxy, letting anyone use this server to reach hosts it can see and
 * they cannot.
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

  const { rows, error } = await minutesForMeeting(meetingId);
  if (error) return new Response("Minutes are unavailable", { status: 503 });

  const record = rows[0];
  if (!record?.minutes_url) {
    return new Response("No minutes published for this meeting", { status: 404 });
  }

  let upstream;
  try {
    upstream = await politeFetchBytes(record.minutes_url);
  } catch {
    return new Response("Could not fetch the minutes from the city", { status: 502 });
  }

  if (!looksLikePdf(upstream.bytes)) {
    return new Response("The city returned something that is not a PDF", { status: 502 });
  }

  return new Response(upstream.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // The whole point: inline, not attachment.
      "Content-Disposition": 'inline; filename="minutes-' + meetingId + '.pdf"',
      "Content-Length": String(upstream.bytes.byteLength),
      // Published minutes do not change once approved, so this can cache hard.
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
