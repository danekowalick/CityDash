import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { MinutesViewer } from "@/components/MinutesViewer";
import { assetHref } from "@/lib/routes";
import { PacketSection } from "@/components/Packet";
import { MotionCard } from "@/components/Motion";
import { MEETING_STATE_NOTE, MeetingStatusBadge, meetingState } from "@/components/MeetingStatus";
import { Badge, SectionHeading } from "@/components/ui";
import { formatDateTime, pluralise } from "@/lib/format";
import {
  agendaItemsForMeeting,
  meetingById,
  minutesForMeeting,
  motionsForMeeting,
  packetForMeeting,
  packetSegmentsForMeeting,
  paymentsForMeeting,
  registerBatchesForMeeting,
  staffReportsForMeeting,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const found = await meetingById(Number(id));
  const meeting = found.rows[0];
  if (!meeting) return { title: "Meeting not found" };
  return {
    title: meeting.body + " — " + formatDateTime(meeting.starts_at),
    description: "What the " + meeting.body + " decided.",
  };
}

export default async function MeetingPage({ params }: PageProps) {
  const { id } = await params;
  const meetingId = Number(id);
  if (!Number.isFinite(meetingId)) notFound();

  const [found, motions, agenda, minutes, packet, segments, batches, payments, reports] =
    await Promise.all([
      meetingById(meetingId),
      motionsForMeeting(meetingId),
      agendaItemsForMeeting(meetingId),
      minutesForMeeting(meetingId),
      packetForMeeting(meetingId),
      packetSegmentsForMeeting(meetingId),
      registerBatchesForMeeting(meetingId),
      paymentsForMeeting(meetingId),
      staffReportsForMeeting(meetingId),
    ]);

  const meeting = found.rows[0];
  if (!meeting && found.error === null) notFound();
  if (!meeting) {
    return (
      <div className="card p-6 text-sm">
        <p className="muted">This meeting could not be loaded.</p>
        <p className="faint mono mt-2 text-xs">{found.error}</p>
      </div>
    );
  }

  const record = minutes.rows[0] ?? null;
  const carried = motions.rows.filter((m) => m.outcome === "carried").length;

  // The same state machine the meeting cards use, so the wording a reader
  // sees on the list and on the page can never drift apart.
  const state = meetingState(
    record
      ? {
          meeting_id: meeting.id,
          motion_count: record.motion_count,
          carried: String(carried),
          is_scanned: record.is_scanned,
        }
      : undefined,
    meeting.starts_at,
  );

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">
          <Link href="/meetings" className="link-underline">
            Meetings
          </Link>
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{meeting.body}</h1>
        <div className="mt-2">
          <MeetingStatusBadge state={state} motionCount={record?.motion_count} />
        </div>
        <p className="muted mt-2">
          {formatDateTime(meeting.starts_at)}
          {meeting.location ? " · " + meeting.location : ""}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {meeting.agenda_url ? (
            <a href={meeting.agenda_url} target="_blank" rel="noopener noreferrer" className="link-underline">
              Agenda
            </a>
          ) : null}
          {meeting.minutes_url ? (
            <a href={meeting.minutes_url} target="_blank" rel="noopener noreferrer" className="link-underline">
              Minutes
            </a>
          ) : null}
          {meeting.youtube_id ? (
            <a
              href={"https://www.youtube.com/watch?v=" + meeting.youtube_id}
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline"
            >
              Video
            </a>
          ) : null}
          <a href={meeting.source_url} target="_blank" rel="noopener noreferrer" className="faint link-underline text-xs">
            City portal
          </a>
        </div>
      </section>

      {/* Outcomes --------------------------------------------------------- */}
      <section>
        <SectionHeading
          title="What was decided"
          hint={
            motions.rows.length > 0
              ? pluralise(motions.rows.length, "recorded motion") + ", " + carried + " carried."
              : undefined
          }
        />

        {state === "decisions" ? (
          <ul className="card px-4">
            {motions.rows.map((motion) => (
              <MotionCard key={motion.id} motion={motion} />
            ))}
          </ul>
        ) : state === "scanned" ? (
          <div
            className="card p-4 text-sm"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            <p className="font-medium">These minutes are a scanned image.</p>
            <p className="mt-1">
              {MEETING_STATE_NOTE.scanned}{" "}
              {record ? (
                <a
                  href={record.minutes_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline"
                >
                  Read the minutes directly
                </a>
              ) : null}
            </p>
          </div>
        ) : (
          <div className="card p-6 text-sm">
            <p className="muted">{MEETING_STATE_NOTE[state]}</p>
          </div>
        )}
      </section>

      {/* Agenda ----------------------------------------------------------- */}
      {agenda.rows.length > 0 ? (
        <section>
          <SectionHeading title="Agenda items" hint="As numbered in the minutes." />
          <ul className="card px-4">
            {agenda.rows.map((item) => (
              <li
                key={item.number}
                className="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2 last:border-b-0"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-sm">
                  <span className="mono faint mr-2 text-xs">{item.number}</span>
                  {item.title}
                </span>
                {item.kind ? <Badge>{item.kind}</Badge> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The packet -------------------------------------------------------
          The agenda names an item; the packet is where its cost is. */}
      {packet.rows[0] ? (
        <PacketSection
          packet={packet.rows[0]}
          segments={segments.rows}
          batches={batches.rows}
          payments={payments.rows}
          reports={reports.rows}
        />
      ) : null}

      {record ? (
        <section>
          <SectionHeading
            title="The minutes"
            hint="Read them here rather than downloading the file."
          />
          <MinutesViewer
            meetingId={meeting.id}
            sourceUrl={record.minutes_url}
            pageCount={record.page_count}
            isScanned={record.is_scanned}
            text={record.text}
          />
        </section>
      ) : null}

      {record && !record.is_scanned ? (
        <p className="faint text-xs">
          Parsed from the published minutes ({pluralise(record.page_count, "page")}), read{" "}
          {formatDateTime(record.captured_at)}. The minutes PDF is authoritative.
        </p>
      ) : null}
    </div>
  );
}
