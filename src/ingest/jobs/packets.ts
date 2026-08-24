/**
 * Ingests agenda packets -- the several-hundred-page PDF bound behind each
 * meeting agenda.
 *
 * The packet is where the money is. It carries the accounts payable register
 * listing every cheque the Council is being asked to approve, the monthly
 * disbursement report, and a staff report per item with its own fiscal impact
 * line. None of that reaches the agenda or the minutes.
 *
 * Two things make this job different from the minutes job it is otherwise
 * modelled on.
 *
 * A packet is ~20MB, against ~600KB for a set of minutes. So the decision
 * about whether to read one is made in SQL, from the published URL, and a
 * packet already read is never fetched at all. CivicClerk mints a new fileId
 * when it republishes an amended packet, so a changed packet is a changed URL.
 * Re-downloading every packet nightly just to compare a hash would move a
 * gigabyte a week to learn nothing.
 *
 * And the register prints its own "Total Amount Being Paid", so this job can
 * check its own arithmetic. It stores both numbers and warns when they differ.
 * It never adjusts ours to match theirs.
 */

import { politeFetchBytes } from "../../lib/fetcher";
import { query, transaction } from "../../lib/db";
import { extractPdfText, looksLikePdf } from "../../lib/pdf";
import { normaliseVendorKey, type RegisterChecksum } from "../../lib/parsers/checkRegister";
import { parsePacket, type ParsedPacket } from "../../lib/parsers/packet";
import { finishRun, startRun, storeRawDocument } from "../store";

const SOURCE_ID = "agenda-packets";

export interface PacketJobOptions {
  limit?: number;
  force?: boolean;
  days?: number;
}

interface PendingPacket {
  id: number;
  body: string;
  starts_at: Date;
  packet_url: string;
  document_id: number;
  stored_hash: string | null;
}

/**
 * Meetings whose packet we have not read yet, most valuable first.
 *
 * The limit caps *candidates considered*, exactly as it does in the minutes
 * job. The difference is that here the already-read packets are excluded in
 * SQL rather than by fetching and comparing a hash, so a capped run always
 * advances by up to `limit` genuinely new packets instead of spending its whole
 * budget re-downloading 20MB files it already has.
 *
 * City Council sorts first because the check register only ever appears in a
 * Council packet -- the commissions publish staff reports and attachments
 * only -- so the most valuable reading lands in the first passes of a backfill.
 */
async function pendingPackets(limit: number, days: number, force: boolean): Promise<PendingPacket[]> {
  const freshnessClause = force
    ? ""
    : "AND (mp.meeting_id IS NULL OR mp.packet_url IS DISTINCT FROM pd.url)";

  return query<PendingPacket>(
    `WITH packet_doc AS (
       SELECT DISTINCT ON (d.meeting_id)
              d.meeting_id, d.id AS document_id, d.url
         FROM meeting_documents d
        WHERE d.kind = 'Agenda Packet'
        -- An amended packet supersedes the one before it.
        ORDER BY d.meeting_id, d.id DESC
     )
     SELECT m.id, m.body, m.starts_at, pd.url AS packet_url, pd.document_id,
            mp.content_hash AS stored_hash
       FROM meetings m
       JOIN packet_doc pd ON pd.meeting_id = m.id
       LEFT JOIN meeting_packets mp ON mp.meeting_id = m.id
      WHERE m.starts_at < now()
        AND m.starts_at >= now() - ($2::int * INTERVAL '1 day')
        ${freshnessClause}
      ORDER BY
        CASE WHEN mp.meeting_id IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m.body = 'City Council' THEN 0 ELSE 1 END,
        m.starts_at DESC
      LIMIT $1`,
    [limit, days],
  );
}

/**
 * Whether a register may be added up and published.
 *
 * Both checks are the register's own arithmetic turned back on it: the total it
 * prints, and the page count in its banner. Failing either means we did not
 * read the whole thing, and a partial register understates spending far more
 * damagingly than an admitted gap.
 */
function isTrustworthy(sum: RegisterChecksum): boolean {
  if (!sum.balanced) return false;
  if (sum.declaredPageCount !== null && sum.pageCount !== sum.declaredPageCount) return false;
  return sum.uncertainCount === 0;
}

async function persist(
  meeting: PendingPacket,
  parsed: ParsedPacket,
  contentHash: string,
  byteSize: number,
  rawDocumentId: number,
): Promise<void> {
  const trustworthy = parsed.registers.filter((r) => isTrustworthy(r.checksum));
  const paymentCount = trustworthy.reduce((n, r) => n + r.rows.length, 0);
  const paymentTotal = trustworthy.reduce((n, r) => n + r.checksum.parsedTotalCents, 0);

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO meeting_packets
         (meeting_id, packet_url, document_id, content_hash, page_count, byte_size,
          text_page_count, image_page_count, is_scanned, segment_count, register_count,
          payment_count, payment_total_cents, staff_report_count, raw_document_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (meeting_id) DO UPDATE SET
         packet_url = EXCLUDED.packet_url,
         document_id = EXCLUDED.document_id,
         content_hash = EXCLUDED.content_hash,
         page_count = EXCLUDED.page_count,
         byte_size = EXCLUDED.byte_size,
         text_page_count = EXCLUDED.text_page_count,
         image_page_count = EXCLUDED.image_page_count,
         is_scanned = EXCLUDED.is_scanned,
         segment_count = EXCLUDED.segment_count,
         register_count = EXCLUDED.register_count,
         payment_count = EXCLUDED.payment_count,
         payment_total_cents = EXCLUDED.payment_total_cents,
         staff_report_count = EXCLUDED.staff_report_count,
         raw_document_id = EXCLUDED.raw_document_id,
         captured_at = now()`,
      [
        meeting.id,
        meeting.packet_url,
        meeting.document_id,
        contentHash,
        parsed.pageCount,
        byteSize,
        parsed.textPageCount,
        parsed.imagePageCount,
        parsed.isScanned,
        parsed.segments.length,
        parsed.registers.length,
        paymentCount,
        paymentTotal,
        parsed.staffReports.length,
        rawDocumentId,
      ],
    );

    // Re-parsing replaces the previous reading of this document rather than
    // accumulating duplicates alongside it. check_payments goes with its batch.
    await client.query(`DELETE FROM check_register_batches WHERE meeting_id = $1`, [meeting.id]);
    await client.query(`DELETE FROM packet_staff_reports WHERE meeting_id = $1`, [meeting.id]);
    await client.query(`DELETE FROM packet_segments WHERE meeting_id = $1`, [meeting.id]);

    const segmentIds = new Map<number, number>();
    for (const segment of parsed.segments) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO packet_segments (meeting_id, sequence, kind, title, start_page, end_page, text)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          meeting.id,
          segment.sequence,
          segment.kind,
          segment.title,
          segment.startPage,
          segment.endPage,
          segment.text,
        ],
      );
      segmentIds.set(segment.startPage, inserted.rows[0].id);
    }

    for (const [index, register] of parsed.registers.entries()) {
      const sequence = index + 1;
      const batch = await client.query<{ id: number }>(
        `INSERT INTO check_register_batches
           (meeting_id, sequence, segment_id, report_date, prepared_by, start_page, end_page,
            page_count, declared_page_count, declared_total_cents, parsed_total_cents,
            row_count, repaired_count, uncertain_count, trusted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          meeting.id,
          sequence,
          segmentIds.get(register.startPage) ?? null,
          register.reportDate,
          register.preparedBy,
          register.startPage,
          register.endPage,
          register.checksum.pageCount,
          register.checksum.declaredPageCount,
          register.checksum.declaredTotalCents,
          register.checksum.parsedTotalCents,
          register.checksum.rowCount,
          register.checksum.repairedCount,
          register.checksum.uncertainCount,
          isTrustworthy(register.checksum),
        ],
      );

      if (register.rows.length === 0) continue;

      // One statement per register rather than one per line: a Council packet
      // carries ~470 lines and a two-year backfill is ~500 packets.
      const batchId = batch.rows[0].id;
      await client.query(
        `INSERT INTO check_payments
           (batch_id, meeting_id, sequence, check_number, check_date, vendor_name,
            vendor_key, account, fund, amount_cents, amount_repaired, amount_uncertain, page)
         SELECT $1, $2, s.seq, s.num, s.dt, s.vendor, s.key, s.account, s.fund,
                s.cents, s.repaired, s.uncertain, s.page
           FROM UNNEST($3::int[], $4::text[], $5::date[], $6::text[], $7::text[],
                       $8::text[], $9::text[], $10::bigint[], $11::bool[], $12::bool[], $13::int[])
                AS s(seq, num, dt, vendor, key, account, fund, cents, repaired, uncertain, page)`,
        [
          batchId,
          meeting.id,
          register.rows.map((_, i) => i + 1),
          register.rows.map((r) => r.checkNumber),
          register.rows.map((r) => r.checkDate),
          register.rows.map((r) => r.vendorName),
          register.rows.map((r) => normaliseVendorKey(r.vendorName)),
          register.rows.map((r) => r.account),
          register.rows.map((r) => r.fund),
          register.rows.map((r) => String(r.amountCents)),
          register.rows.map((r) => r.repaired),
          register.rows.map((r) => r.uncertain),
          register.rows.map((r) => r.page),
        ],
      );
    }

    for (const report of parsed.staffReports) {
      await client.query(
        `INSERT INTO packet_staff_reports
           (meeting_id, sequence, segment_id, report_date, agenda_item_title, responsible_staff,
            additional_presenters, description, reviewed_by, proposed_actions,
            staff_recommendation, other_resources, fiscal_impact, personnel_impact,
            attachments, fiscal_amounts_cents, fiscal_max_cents, start_page, end_page)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          meeting.id,
          report.sequence,
          segmentIds.get(report.startPage) ?? null,
          report.reportDate,
          report.agendaItemTitle,
          report.responsibleStaff,
          report.additionalPresenters,
          report.description,
          report.reviewedBy,
          report.proposedActions,
          report.staffRecommendation,
          report.otherResources,
          report.fiscalImpact,
          report.personnelImpact,
          report.attachments,
          JSON.stringify(report.fiscalAmountsCents),
          report.fiscalMaxCents,
          report.startPage,
          report.endPage,
        ],
      );
    }
  });
}

export async function ingestPackets(options: PacketJobOptions = {}): Promise<void> {
  // Deliberately small. Each candidate is a ~20MB download and 20-60s of PDF
  // text extraction, where a set of minutes is under a second.
  const limit = options.limit ?? 8;
  const days = options.days ?? 800;
  const runId = await startRun(SOURCE_ID);

  let itemsSeen = 0;
  let itemsNew = 0;
  let unbalanced = 0;
  let failed = 0;

  try {
    const meetings = await pendingPackets(limit, days, options.force ?? false);
    console.log("Considering " + meetings.length + " meetings with a published packet.");

    for (const meeting of meetings) {
      itemsSeen++;
      const label = meeting.body + " " + meeting.starts_at.toISOString().slice(0, 10);

      let pdf;
      try {
        pdf = await politeFetchBytes(meeting.packet_url);
      } catch (error) {
        console.warn("  fetch failed for meeting " + meeting.id + ": " + String(error).slice(0, 100));
        continue;
      }

      if (!looksLikePdf(pdf.bytes)) {
        console.warn("  not a PDF: meeting " + meeting.id);
        continue;
      }

      if (!options.force && meeting.stored_hash === pdf.contentHash) continue;

      // Read the size before extracting: pdfjs takes ownership of the buffer
      // and detaches it, after which bytes.length reads back as 0.
      const byteSize = pdf.bytes.length;

      let extracted;
      try {
        extracted = await extractPdfText(pdf.bytes);
      } catch (error) {
        console.warn("  extraction failed for meeting " + meeting.id + ": " + String(error).slice(0, 100));
        continue;
      }

      const parsed = parsePacket(extracted.pages);

      // A packet that will not store must not take the rest of the run down
      // with it. Because a failure here leaves the packet unrecorded, an
      // unguarded throw meant the next pass picked the same one up again and
      // the backfill stopped advancing entirely -- one unreadable packet cost
      // every packet behind it. Skipping keeps the run moving and the failure
      // stays visible in the log and in the fetch_runs error count.
      try {
        const rawDocumentId = await storeRawDocument(SOURCE_ID, {
          url: meeting.packet_url,
          status: pdf.status,
          body: parsed.text,
          contentType: pdf.contentType,
          contentHash: pdf.contentHash,
        });

        await persist(meeting, parsed, pdf.contentHash, byteSize, rawDocumentId);
      } catch (error) {
        failed++;
        console.warn(
          "  store failed for meeting " + meeting.id + " (" + label + "): " +
            String(error).slice(0, 160),
        );
        continue;
      }
      itemsNew++;

      if (parsed.isScanned) {
        console.log("  SCANNED (no text layer): " + label);
        continue;
      }

      const payments = parsed.registers.reduce((n, r) => n + r.rows.length, 0);
      console.log(
        "  " + label + ": " + parsed.pageCount + " pages, " + parsed.registers.length +
          " registers, " + payments + " payments, " + parsed.staffReports.length + " staff reports",
      );

      for (const register of parsed.registers) {
        const sum = register.checksum;
        if (!sum.balanced) {
          unbalanced++;
          console.warn(
            "    register p" + register.startPage + "-" + register.endPage +
              " does not balance: read " + sum.parsedTotalCents + " against a printed " +
              sum.declaredTotalCents + " (" + sum.uncertainCount + " amounts clipped beyond repair)",
          );
        }
        if (sum.declaredPageCount !== null && sum.pageCount !== sum.declaredPageCount) {
          console.warn(
            "    register says it is " + sum.declaredPageCount + " pages, read " + sum.pageCount,
          );
        }
      }

      if (parsed.registers.length === 0) {
        console.log("    no check register in this packet");
      }

      if (parsed.unknownFunds.length > 0) {
        // A fund we do not know is a schema fact the maintainer needs to hear
        // about: widen KNOWN_FUNDS deliberately rather than let money land
        // against a null fund.
        console.warn("    unrecognised funds: " + parsed.unknownFunds.join(" | "));
      }
    }

    console.log(
      "Done: " + itemsNew + " packets read" +
        (unbalanced > 0 ? ", " + unbalanced + " registers that do not balance" : ""),
    );
    await finishRun(runId, "ok", { itemsSeen, itemsNew });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", { itemsSeen, itemsNew, error: message });
    throw error;
  }
}
