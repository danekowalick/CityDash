import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MEETING_TIME_ZONE,
  meetingFileUrl,
  meetingPortalUrl,
  normaliseEvent,
  normaliseEventsResponse,
  zonedWallTimeToUtc,
} from "./civicclerk";

const FIXTURES = join(__dirname, "..", "fixtures");
const readJson = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as unknown;

/** Render an instant as wall-clock time in the meeting time zone. */
function wallClock(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MEETING_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

describe("zonedWallTimeToUtc", () => {
  it("reads a naive summer timestamp as Pacific daylight time", () => {
    // 18:00 PDT is 01:00 UTC the following day.
    expect(zonedWallTimeToUtc("2026-08-18T18:00:00", MEETING_TIME_ZONE).toISOString()).toBe(
      "2026-08-19T01:00:00.000Z",
    );
  });

  it("reads a naive winter timestamp as Pacific standard time", () => {
    // 19:00 PST is 03:00 UTC the following day.
    expect(zonedWallTimeToUtc("2026-01-20T19:00:00", MEETING_TIME_ZONE).toISOString()).toBe(
      "2026-01-21T03:00:00.000Z",
    );
  });

  it("ignores the spurious Z that CivicClerk appends", () => {
    expect(zonedWallTimeToUtc("2026-08-18T18:00:00Z", MEETING_TIME_ZONE).toISOString()).toBe(
      zonedWallTimeToUtc("2026-08-18T18:00:00", MEETING_TIME_ZONE).toISOString(),
    );
  });

  it("round-trips back to the wall-clock time it was given", () => {
    const naive = "2026-08-17T19:00:00Z";
    expect(wallClock(zonedWallTimeToUtc(naive, MEETING_TIME_ZONE))).toContain("19:00");
  });
});

describe("URL builders", () => {
  it("builds the OData file stream URL", () => {
    expect(meetingFileUrl(9898)).toBe(
      "https://moscowid.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=9898,plainText=false)",
    );
  });

  it("builds the public portal URL", () => {
    expect(meetingPortalUrl(3726)).toBe(
      "https://moscowid.portal.civicclerk.com/event/3726/overview",
    );
  });
});

describe("normaliseEvent", () => {
  it("normalises a meeting with published documents", () => {
    const meeting = normaliseEvent({
      id: 3726,
      eventName: "Sustainable Environment Commission",
      eventDescription: "Third Tuesday of the month at 6:00PM",
      startDateTime: "2026-08-18T18:00:00Z",
      categoryName: "Sustainable Environment Commission",
      isPublished: "Published",
      youtubeVideoId: "",
      publishedFiles: [
        { fileId: 9898, type: "Agenda", name: "SEC Agenda ", sort: 1 },
        { fileId: 9906, type: "Agenda Packet", name: "SEC Agenda Packet ", sort: 2 },
      ],
    });

    expect(meeting).not.toBeNull();
    expect(meeting!.body).toBe("Sustainable Environment Commission");
    expect(meeting!.isPublished).toBe(true);
    expect(meeting!.agendaUrl).toBe(meetingFileUrl(9898));
    expect(meeting!.minutesUrl).toBeNull();
    expect(meeting!.documents).toHaveLength(2);
    expect(meeting!.documents[0].kind).toBe("Agenda");
  });

  it("treats an empty youtube id as absent", () => {
    const meeting = normaliseEvent({
      id: 1,
      startDateTime: "2026-08-18T18:00:00Z",
      categoryName: "City Council",
      youtubeVideoId: "",
    });
    expect(meeting!.youtubeId).toBeNull();
  });

  it("falls back to the agenda packet when no plain agenda is published", () => {
    const meeting = normaliseEvent({
      id: 2,
      startDateTime: "2026-08-18T18:00:00Z",
      categoryName: "City Council",
      publishedFiles: [{ fileId: 42, type: "Agenda Packet", name: "Packet", sort: 1 }],
    });
    expect(meeting!.agendaUrl).toBe(meetingFileUrl(42));
  });

  it("returns null for a record with no usable timestamp", () => {
    expect(normaliseEvent({ id: 3, categoryName: "City Council" })).toBeNull();
  });

  it("collapses an all-null location to null rather than a pile of commas", () => {
    const meeting = normaliseEvent({
      id: 4,
      startDateTime: "2026-08-18T18:00:00Z",
      categoryName: "City Council",
      eventLocation: { address1: null, address2: null, city: null, state: null, zipCode: null },
    });
    expect(meeting!.location).toBeNull();
  });
});

describe("normaliseEventsResponse against the real API payload", () => {
  const meetings = normaliseEventsResponse(readJson("civicclerk-past-events.json"));

  it("normalises every record in the response", () => {
    expect(meetings.length).toBe(15);
  });

  it("recognises the real governing bodies", () => {
    const bodies = new Set(meetings.map((m) => m.body));
    expect(bodies).toContain("City Council");
    expect(bodies).toContain("Planning and Zoning Commission");
  });

  it("gives the 08/17/2026 council meeting a 7pm Pacific start", () => {
    const council = meetings.find((m) => m.id === 3769);
    expect(council).toBeDefined();
    expect(wallClock(council!.startsAt)).toContain("19:00");
  });

  it("links every document to a resolvable file stream URL", () => {
    for (const meeting of meetings) {
      for (const doc of meeting.documents) {
        expect(doc.url).toMatch(/GetMeetingFileStream\(fileId=\d+,plainText=false\)$/);
        expect(doc.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every meeting a portal source URL and a real date", () => {
    for (const meeting of meetings) {
      expect(meeting.sourceUrl).toMatch(/civicclerk\.com\/event\/\d+\/overview$/);
      expect(Number.isNaN(meeting.startsAt.getTime())).toBe(false);
    }
  });

  it("tolerates a malformed payload", () => {
    expect(normaliseEventsResponse(null)).toEqual([]);
    expect(normaliseEventsResponse({})).toEqual([]);
    expect(normaliseEventsResponse({ value: "nope" })).toEqual([]);
  });
});
