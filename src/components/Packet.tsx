import { PacketPageLink, PaymentList, RegisterChecksumNote } from "@/components/Spending";
import { Badge, Row, RowList, SectionHeading } from "@/components/ui";
import { formatCalendarDate, formatMoneyCents, pluralise } from "@/lib/format";
import type {
  PacketRow,
  PacketSegmentRow,
  PaymentRowRecord,
  RegisterBatchRow,
  StaffReportRow,
} from "@/lib/queries";

/** How many register lines to show before folding the rest away. */
const INLINE_PAYMENTS = 20;

const SEGMENT_LABELS: Record<string, string> = {
  agenda: "Agenda",
  minutes: "Draft minutes of the previous meeting",
  check_register: "Check register",
  disbursement_report: "Disbursement report",
  major_expenditures: "Major expenditures",
  staff_report: "Staff report",
  attachment: "Attachments",
  unclassified: "Front matter",
};

export function PacketSection({
  packet,
  segments,
  batches,
  payments,
  reports,
}: {
  packet: PacketRow;
  segments: PacketSegmentRow[];
  batches: RegisterBatchRow[];
  payments: PaymentRowRecord[];
  reports: StaffReportRow[];
}) {
  const url = packet.packet_url;
  const counted = batches.filter((batch) => batch.trusted);

  return (
    <div className="space-y-8">
      {/* What the packet asks the council to pay ------------------------- */}
      {batches.length > 0 ? (
        <section id="packet-money">
          <SectionHeading
            title="Money in this packet"
            hint={
              counted.length > 0
                ? pluralise(packet.payment_count, "payment") +
                  " totalling " +
                  formatMoneyCents(packet.payment_total_cents) +
                  ", submitted for approval."
                : "The register in this packet could not be read reliably."
            }
          />

          <div className="space-y-4">
            {batches.map((batch) => (
              <div key={batch.id} className="space-y-2">
                <p className="eyebrow">
                  Register {batch.sequence}
                  {batch.report_date ? " · printed " + formatCalendarDate(batch.report_date) : ""}
                  {" · packet pages " + batch.start_page + "–" + batch.end_page}
                </p>
                <RegisterChecksumNote batch={batch} packetUrl={url} />
              </div>
            ))}
          </div>

          {payments.length > 0 ? (
            <div className="mt-4">
              <PaymentList payments={payments.slice(0, INLINE_PAYMENTS)} showMeeting={false} />
              {payments.length > INLINE_PAYMENTS ? (
                <details className="card mt-2 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Show the other {payments.length - INLINE_PAYMENTS} lines
                  </summary>
                  <div className="mt-3">
                    <PaymentList payments={payments.slice(INLINE_PAYMENTS)} showMeeting={false} />
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          <p className="faint mt-3 text-xs">
            These are payments put to the Council for approval at this meeting, which is not the
            same as money paid out.
          </p>
        </section>
      ) : null}

      {/* Fiscal impact per item ------------------------------------------ */}
      {reports.length > 0 ? (
        <section id="packet-reports">
          <SectionHeading
            title="Staff reports"
            hint="What staff told the council each item would cost."
          />
          <RowList>
            {reports.map((report) => (
              <Row key={report.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {report.agenda_item_title ?? "Untitled item"}
                  </p>
                  {report.responsible_staff ? (
                    <p className="muted mt-0.5 text-xs">{report.responsible_staff}</p>
                  ) : null}

                  <p className="mt-1 text-xs">
                    <span className="eyebrow">Fiscal impact </span>
                    {report.fiscal_impact ? (
                      <span style={{ color: "var(--ink-muted)" }}>{report.fiscal_impact}</span>
                    ) : (
                      // Blank is a fact about the form, not a statement that
                      // the item is free -- the FY2027 budget leaves it blank.
                      <span className="faint">
                        left blank on the form. That is not a statement that the item costs nothing.
                      </span>
                    )}
                  </p>

                  {report.description ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer" style={{ color: "var(--ink-muted)" }}>
                        Staff description
                      </summary>
                      <p className="muted mt-1 whitespace-pre-wrap">{report.description}</p>
                    </details>
                  ) : null}

                  {report.start_page ? (
                    <p className="faint mt-1 text-xs">
                      <PacketPageLink packetUrl={url} page={report.start_page}>
                        Packet page {report.start_page}
                      </PacketPageLink>
                    </p>
                  ) : null}
                </div>
              </Row>
            ))}
          </RowList>
        </section>
      ) : null}

      {/* The outline ------------------------------------------------------ */}
      <section id="packet-outline">
        <SectionHeading
          title="What is in the packet"
          hint={
            packet.page_count +
            " pages" +
            (packet.image_page_count > 0
              ? ", of which " + packet.image_page_count + " are scanned images we cannot read"
              : "")
          }
        />
        <RowList>
          {segments.map((segment) => (
            <Row key={segment.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <PacketPageLink packetUrl={url} page={segment.start_page}>
                    {segment.title ?? SEGMENT_LABELS[segment.kind] ?? segment.kind}
                  </PacketPageLink>
                </p>
                <p className="faint mt-0.5 text-xs">
                  {segment.start_page === segment.end_page
                    ? "Page " + segment.start_page
                    : "Pages " + segment.start_page + "–" + segment.end_page}
                  {" · " + (SEGMENT_LABELS[segment.kind] ?? segment.kind)}
                </p>
              </div>
              {segment.kind === "attachment" ? (
                <Badge>not indexed</Badge>
              ) : segment.kind === "minutes" ? (
                <Badge>read separately</Badge>
              ) : null}
            </Row>
          ))}
        </RowList>
        <p className="faint mt-3 text-xs">
          Attachments — contracts, plats and engineering specifications — are more than half the
          packet and are almost entirely boilerplate, so their text is not indexed. Their page
          ranges are kept, and every line above links to the page it sits on in the{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="link-underline">
            packet the city published
          </a>
          , which is the authoritative version.
        </p>
      </section>
    </div>
  );
}
