import Link from "next/link";

import { Badge, Row, RowList } from "@/components/ui";
import { formatCalendarDate, formatMoneyCents } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import type { PaymentRowRecord, RegisterBatchRow } from "@/lib/queries";

/**
 * A link into the packet at the page the figure is printed on.
 *
 * The packet is not proxied through this site the way the minutes are. A
 * Council packet is 20MB against 600KB for a set of minutes, which is well past
 * what a serverless response can carry, so the reader goes to the portal for
 * the original -- with the page number, so they land on the right one.
 */
export function PacketPageLink({
  packetUrl,
  page,
  children,
}: {
  packetUrl: string | null;
  page: number | null;
  children: React.ReactNode;
}) {
  if (!packetUrl) return <>{children}</>;
  const href = page ? packetUrl + "#page=" + page : packetUrl;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-underline">
      {children}
    </a>
  );
}

export function PaymentList({
  payments,
  showMeeting = true,
}: {
  payments: PaymentRowRecord[];
  showMeeting?: boolean;
}) {
  return (
    <RowList>
      {payments.map((payment) => (
        <Row key={payment.id}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <Link
                href={dynamicHref("/spending/vendor/" + encodeURIComponent(payment.vendor_key))}
                className="link-underline"
              >
                {payment.vendor_name}
              </Link>
            </p>
            <p className="muted mt-0.5 text-xs">
              {payment.account ?? "Account not stated"}
              {payment.fund ? " · " + payment.fund : ""}
              {payment.check_date ? " · " + formatCalendarDate(payment.check_date) : ""}
              {payment.check_number ? " · cheque " + payment.check_number : ""}
            </p>
            {showMeeting ? (
              <p className="faint mt-0.5 text-xs">
                Approved at{" "}
                <Link href={dynamicHref("/meetings/" + payment.meeting_id)} className="link-underline">
                  {payment.body} {formatCalendarDate(payment.starts_at)}
                </Link>
                {payment.page ? (
                  <>
                    {" · "}
                    <PacketPageLink packetUrl={payment.packet_url} page={payment.page}>
                      packet p{payment.page}
                    </PacketPageLink>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <span className="mono text-sm font-semibold">
              {formatMoneyCents(payment.amount_cents)}
            </span>
            {payment.amount_repaired ? (
              <span className="mt-1 block">
                <Badge tone="neutral">cents recovered</Badge>
              </span>
            ) : null}
            {payment.amount_uncertain ? (
              <span className="mt-1 block">
                <Badge tone="warn">understated</Badge>
              </span>
            ) : null}
          </div>
        </Row>
      ))}
    </RowList>
  );
}

/**
 * The checksum, stated plainly.
 *
 * The register prints its own "Total Amount Being Paid", so our reading of it
 * can be checked against the document. Both numbers are shown whether or not
 * they agree, and ours is never adjusted to match.
 */
export function RegisterChecksumNote({
  batch,
  packetUrl,
}: {
  batch: RegisterBatchRow;
  packetUrl: string | null;
}) {
  const pagesShort =
    batch.declared_page_count !== null && batch.page_count !== batch.declared_page_count;

  if (batch.trusted) {
    return (
      <p className="faint text-xs">
        {batch.row_count} lines totalling{" "}
        <span className="mono">{formatMoneyCents(batch.parsed_total_cents)}</span>, against the{" "}
        <span className="mono">{formatMoneyCents(batch.declared_total_cents)}</span> printed on{" "}
        <PacketPageLink packetUrl={packetUrl} page={batch.start_page}>
          page {batch.start_page}
        </PacketPageLink>
        . They agree
        {batch.repaired_count > 0
          ? ", after recovering " +
            batch.repaired_count +
            (batch.repaired_count === 1 ? " amount" : " amounts") +
            " whose cents the source clipped at the column edge"
          : ""}
        .
      </p>
    );
  }

  return (
    <div
      className="card p-3 text-xs"
      style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
    >
      <p className="font-medium">We could not read this register reliably.</p>
      <p className="mt-1">
        {pagesShort
          ? "It says it is " +
            batch.declared_page_count +
            " pages and we read " +
            batch.page_count +
            ". "
          : ""}
        {batch.declared_total_cents === null
          ? "It printed no total for us to check against. "
          : "We read " +
            formatMoneyCents(batch.parsed_total_cents) +
            " against a printed " +
            formatMoneyCents(batch.declared_total_cents) +
            ". "}
        {batch.uncertain_count > 0
          ? batch.uncertain_count +
            " amounts were clipped in the source beyond recovery. "
          : ""}
        Nothing from it is counted in any total on this site.{" "}
        <PacketPageLink packetUrl={packetUrl} page={batch.start_page}>
          Read it in the packet
        </PacketPageLink>
        .
      </p>
    </div>
  );
}
