/**
 * Normaliser for the CivicClerk public meetings API.
 *
 *   https://moscowid.api.civicclerk.com/v1/Events
 *
 * It is an OData endpoint backing the public portal, so it supports
 * $filter / $orderby / $top. The raw records carry ~100 fields of streaming
 * and captioning plumbing; we keep the dozen that describe a public meeting.
 *
 * TIMEZONE HAZARD: `startDateTime` is serialised with a trailing "Z" but is
 * actually Moscow local wall-clock time, not UTC. The Sustainable
 * Environment Commission record reads "2026-08-18T18:00:00Z" while its own
 * description says "Third Tuesday of the month at 6:00PM". Reading these as
 * UTC puts every meeting on the site seven hours off. We reinterpret the
 * naive timestamp in America/Los_Angeles instead.
 */

export const MEETING_TIME_ZONE = "America/Los_Angeles";

const API_BASE = "https://moscowid.api.civicclerk.com";
const PORTAL_BASE = "https://moscowid.portal.civicclerk.com";

export interface CivicClerkPublishedFile {
  fileId?: number | null;
  type?: string | null;
  name?: string | null;
  url?: string | null;
  sort?: number | null;
}

export interface CivicClerkEvent {
  id: number;
  eventName?: string | null;
  eventDescription?: string | null;
  startDateTime?: string | null;
  eventDate?: string | null;
  categoryName?: string | null;
  isPublished?: string | null;
  youtubeVideoId?: string | null;
  eventLocation?: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  } | null;
  publishedFiles?: CivicClerkPublishedFile[] | null;
}

export interface MeetingDocument {
  label: string;
  url: string;
  kind: string | null;
}

export interface NormalisedMeeting {
  id: number;
  name: string;
  body: string;
  description: string | null;
  startsAt: Date;
  location: string | null;
  agendaUrl: string | null;
  minutesUrl: string | null;
  youtubeId: string | null;
  isPublished: boolean;
  sourceUrl: string;
  documents: MeetingDocument[];
}

/** How far `instant` is offset from UTC in `timeZone`, in milliseconds. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * Interpret a naive "YYYY-MM-DDTHH:mm:ss" wall-clock reading as a real
 * instant in `timeZone`. Two passes so a meeting scheduled near a DST
 * boundary resolves with the offset actually in force at that moment.
 */
export function zonedWallTimeToUtc(naive: string, timeZone: string): Date {
  const stripped = naive.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, "");
  const guess = new Date(stripped + "Z");
  if (Number.isNaN(guess.getTime())) return guess;

  const firstOffset = timeZoneOffsetMs(guess, timeZone);
  let resolved = new Date(guess.getTime() - firstOffset);

  const secondOffset = timeZoneOffsetMs(resolved, timeZone);
  if (secondOffset !== firstOffset) {
    resolved = new Date(guess.getTime() - secondOffset);
  }
  return resolved;
}

/** Absolute URL for a document stored in CivicClerk's file store. */
export function meetingFileUrl(fileId: number): string {
  return (
    API_BASE +
    "/v1/Meetings/GetMeetingFileStream(fileId=" +
    String(fileId) +
    ",plainText=false)"
  );
}

/** The human-facing portal page for a meeting. */
export function meetingPortalUrl(eventId: number): string {
  return PORTAL_BASE + "/event/" + String(eventId) + "/overview";
}

function assembleLocation(location: CivicClerkEvent["eventLocation"]): string | null {
  if (!location) return null;
  const line = [location.address1, location.address2, location.city, location.state]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");
  const zip = (location.zipCode ?? "").trim();
  const full = zip ? (line ? line + " " + zip : zip) : line;
  return full.length > 0 ? full : null;
}

/** Find the first published file whose type matches, case-insensitively. */
function findFileUrl(files: CivicClerkPublishedFile[], type: string): string | null {
  const hit = files.find(
    (f) => (f.type ?? "").trim().toLowerCase() === type.toLowerCase() && f.fileId,
  );
  return hit && hit.fileId ? meetingFileUrl(hit.fileId) : null;
}

export function normaliseEvent(raw: CivicClerkEvent): NormalisedMeeting | null {
  if (typeof raw.id !== "number") return null;

  const naive = raw.startDateTime ?? raw.eventDate;
  if (!naive) return null;
  const startsAt = zonedWallTimeToUtc(naive, MEETING_TIME_ZONE);
  if (Number.isNaN(startsAt.getTime())) return null;

  const files = (raw.publishedFiles ?? []).filter((f) => f && f.fileId);
  const body = (raw.categoryName ?? "").trim();
  const name = (raw.eventName ?? "").trim();
  const youtubeId = (raw.youtubeVideoId ?? "").trim();

  const documents: MeetingDocument[] = files
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((f) => ({
      label: (f.name ?? f.type ?? "Document").trim(),
      url: meetingFileUrl(f.fileId as number),
      kind: (f.type ?? "").trim() || null,
    }));

  return {
    id: raw.id,
    name: name || body || "Untitled meeting",
    body: body || name || "Unknown body",
    description: (raw.eventDescription ?? "").trim() || null,
    startsAt,
    location: assembleLocation(raw.eventLocation),
    agendaUrl: findFileUrl(files, "Agenda") ?? findFileUrl(files, "Agenda Packet"),
    minutesUrl: findFileUrl(files, "Minutes"),
    youtubeId: youtubeId || null,
    isPublished: (raw.isPublished ?? "").trim().toLowerCase() === "published",
    sourceUrl: meetingPortalUrl(raw.id),
    documents,
  };
}


/**
 * The API hard-caps a page at 15 records regardless of the $top requested,
 * and hands back an OData continuation link. Callers must follow it or they
 * will silently see only the first page.
 */
export function nextLink(payload: unknown): string | null {
  const link = (payload as Record<string, unknown> | null)?.["@odata.nextLink"];
  return typeof link === "string" && link.length > 0 ? link : null;
}

/** Normalise a full OData response body, dropping records we cannot use. */
export function normaliseEventsResponse(payload: unknown): NormalisedMeeting[] {
  const value = (payload as { value?: unknown })?.value;
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => normaliseEvent(raw as CivicClerkEvent))
    .filter((m): m is NormalisedMeeting => m !== null);
}
