-- Agenda packets: the money that never becomes an agenda topic.
--
-- Every regular meeting carries a packet PDF -- for Council, 300 pages and
-- 20MB of it. Inside are the accounts-payable check register (every cheque
-- the city is about to sign), the monthly disbursement report, and a staff
-- report per item carrying a FISCAL IMPACT line. None of that appears in the
-- agenda or the minutes, so a payment to a defence law firm or the purchase
-- of a vehicle passes unremarked.
--
-- Everything here is parsed deterministically: fixed labels, a closed set of
-- fund names, and a printed total that acts as a checksum. Where the source
-- PDF clips a number we record that it was clipped rather than round it.

-- One packet per meeting. Modelled on meeting_minutes (006).
CREATE TABLE IF NOT EXISTS meeting_packets (
  meeting_id          INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  packet_url          TEXT NOT NULL,
  -- Which meeting_documents row this reading came from. CivicClerk mints a
  -- new fileId when it republishes an amended packet, so a change of document
  -- is a change of URL -- which is what triggers a re-read, without having to
  -- download 20MB to compare a hash.
  document_id         BIGINT REFERENCES meeting_documents(id) ON DELETE SET NULL,
  content_hash        TEXT NOT NULL,
  page_count          INTEGER NOT NULL DEFAULT 0,
  byte_size           BIGINT,
  -- A packet is not scanned or not-scanned: the staff reports carry a text
  -- layer while the signed contracts bound in behind them are photographs.
  -- Counting both is more honest than one boolean, and lets the page say
  -- "41 of these 301 pages are images we cannot read".
  text_page_count     INTEGER NOT NULL DEFAULT 0,
  image_page_count    INTEGER NOT NULL DEFAULT 0,
  is_scanned          BOOLEAN NOT NULL DEFAULT FALSE,
  segment_count       INTEGER NOT NULL DEFAULT 0,
  register_count      INTEGER NOT NULL DEFAULT 0,
  payment_count       INTEGER NOT NULL DEFAULT 0,
  payment_total_cents BIGINT  NOT NULL DEFAULT 0,
  staff_report_count  INTEGER NOT NULL DEFAULT 0,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_document_id     BIGINT REFERENCES raw_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS meeting_packets_captured_idx ON meeting_packets (captured_at DESC);

-- The outline. A packet is a stack of unrelated documents photocopied
-- together; without this a reader has no way to reach "the staff report for
-- item 4" inside 300 pages.
CREATE TABLE IF NOT EXISTS packet_segments (
  id          BIGSERIAL PRIMARY KEY,
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sequence    INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN (
                'agenda', 'minutes', 'check_register', 'disbursement_report',
                'major_expenditures', 'staff_report', 'attachment', 'unclassified')),
  title       TEXT,
  start_page  INTEGER NOT NULL,
  end_page    INTEGER NOT NULL,
  -- Text is stored for everything we can read and reason about, and NOT for
  -- two kinds:
  --   'minutes'     -- the draft minutes of the previous meeting, already
  --                    ingested by the meeting-minutes job. A second copy
  --                    would double-count them everywhere.
  --   'attachment'  -- contracts, plats and engineering specs, which are
  --                    150+ of the 300 pages, are mostly boilerplate, and
  --                    swamp any search that includes them. The page range
  --                    is kept so the reader is sent to the published PDF.
  -- The full text of every packet remains in raw_documents.body regardless,
  -- so a better parser can be run over history without re-crawling.
  text        TEXT,
  UNIQUE (meeting_id, sequence)
);

CREATE INDEX IF NOT EXISTS packet_segments_meeting_idx ON packet_segments (meeting_id, sequence);
CREATE INDEX IF NOT EXISTS packet_segments_kind_idx    ON packet_segments (kind);

-- One row per check register found. A single packet really does contain more
-- than one: the 17 Aug 2026 Council packet had registers on pages 8-27 and
-- 28-29, each with its own declared total.
CREATE TABLE IF NOT EXISTS check_register_batches (
  id                   BIGSERIAL PRIMARY KEY,
  meeting_id           INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sequence             INTEGER NOT NULL,
  segment_id           BIGINT REFERENCES packet_segments(id) ON DELETE SET NULL,
  -- From the register banner:
  -- "1/20 August 12, 2026 03:43 PM Accounts PayableChecks for Approval jlopez"
  report_date          DATE,
  prepared_by          TEXT,
  start_page           INTEGER NOT NULL,
  end_page             INTEGER NOT NULL,
  page_count           INTEGER NOT NULL DEFAULT 0,
  -- The "M" in that banner's "N/M". A second checksum, and a cheap one: if we
  -- read 18 pages of a register that says it is 20 long, we lost two pages and
  -- every total below is wrong.
  declared_page_count  INTEGER,
  -- "$2,429,795.42 Total Amount Being Paid:" -- note the amount precedes the
  -- label. This is the arithmetic the city printed, and it is the point of the
  -- whole table: we store what we summed AND what they printed, and never
  -- adjust one to match the other.
  declared_total_cents BIGINT,
  parsed_total_cents   BIGINT NOT NULL DEFAULT 0,
  row_count            INTEGER NOT NULL DEFAULT 0,
  -- Rows whose cents were clipped by the source PDF column width and were
  -- recovered by arithmetic from the "Check Total:" of their own check.
  repaired_count       INTEGER NOT NULL DEFAULT 0,
  -- Rows clipped and NOT recoverable. Their amount is understated and the
  -- page says so.
  uncertain_count      INTEGER NOT NULL DEFAULT 0,
  -- Whether this reading may be added up and published as fact: our sum equals
  -- the printed total, and we read as many pages as the register says it has.
  -- A register that fails either check is still recorded -- the page says we
  -- could not read it and sends the reader to the PDF -- but it is excluded
  -- from every total on the site. Publishing 17 lines of a 400-line register
  -- would understate the city's spending far more damagingly than admitting we
  -- could not read it.
  trusted              BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (meeting_id, sequence)
);

ALTER TABLE check_register_batches ADD COLUMN IF NOT EXISTS trusted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS check_register_batches_meeting_idx
  ON check_register_batches (meeting_id, sequence);

-- Every line of every check the council was asked to approve.
CREATE TABLE IF NOT EXISTS check_payments (
  id               BIGSERIAL PRIMARY KEY,
  batch_id         BIGINT NOT NULL REFERENCES check_register_batches(id) ON DELETE CASCADE,
  -- Denormalised from the batch so the spending queries -- which are all
  -- "group every payment in the city by vendor" -- never need a three-table
  -- join to reach a date or a body.
  meeting_id       INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sequence         INTEGER NOT NULL,
  check_number     TEXT,
  check_date       DATE,
  -- As printed. Casing is not stable between packets -- the same payee is
  -- "WHITCOM 911" one fortnight and "Whitcom 911" the next -- so the printed
  -- form is kept for display and a normalised key is kept for grouping.
  vendor_name      TEXT NOT NULL,
  vendor_key       TEXT NOT NULL,
  -- ~58 distinct account names per packet, and the vocabulary varies between
  -- packets. Read from the document; never validated against a fixed list.
  account          TEXT,
  fund             TEXT,
  -- Negative is real: the register prints refunds and voids as "$(11.20)".
  amount_cents     BIGINT NOT NULL,
  amount_repaired  BOOLEAN NOT NULL DEFAULT FALSE,
  amount_uncertain BOOLEAN NOT NULL DEFAULT FALSE,
  page             INTEGER
);

CREATE INDEX IF NOT EXISTS check_payments_vendor_idx  ON check_payments (vendor_key);
CREATE INDEX IF NOT EXISTS check_payments_meeting_idx ON check_payments (meeting_id, sequence);
CREATE INDEX IF NOT EXISTS check_payments_date_idx    ON check_payments (check_date DESC);
CREATE INDEX IF NOT EXISTS check_payments_fund_idx    ON check_payments (fund);
CREATE INDEX IF NOT EXISTS check_payments_account_idx ON check_payments (account);
CREATE INDEX IF NOT EXISTS check_payments_batch_idx   ON check_payments (batch_id);

-- The staff report behind each agenda item. Eleven labels in a fixed order,
-- any of which may be empty. FISCAL IMPACT is the reason this table exists --
-- though it is often blank even on the largest items (the FY2027 budget, at
-- $149,942,154, leaves it empty), so description and proposed actions are
-- kept and searched too.
CREATE TABLE IF NOT EXISTS packet_staff_reports (
  id                    BIGSERIAL PRIMARY KEY,
  meeting_id            INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sequence              INTEGER NOT NULL,
  segment_id            BIGINT REFERENCES packet_segments(id) ON DELETE SET NULL,
  report_date           DATE,
  agenda_item_title     TEXT,
  responsible_staff     TEXT,
  additional_presenters TEXT,
  description           TEXT,
  reviewed_by           TEXT,
  proposed_actions      TEXT,
  staff_recommendation  TEXT,
  other_resources       TEXT,
  fiscal_impact         TEXT,
  personnel_impact      TEXT,
  attachments           TEXT,
  -- Every dollar figure printed in FISCAL IMPACT, in the order printed, in
  -- cents. A list rather than a total: the field says things like "$45,000
  -- from the Streets Fund, offset by a $12,000 grant", and adding those two
  -- together would be an interpretation, which is exactly what this site does
  -- not do.
  fiscal_amounts_cents  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The largest of those figures, so the list can be sorted and filtered
  -- without unpacking JSON. Null when the field names no money at all.
  fiscal_max_cents      BIGINT,
  start_page            INTEGER,
  end_page              INTEGER,
  UNIQUE (meeting_id, sequence)
);

CREATE INDEX IF NOT EXISTS packet_staff_reports_meeting_idx
  ON packet_staff_reports (meeting_id, sequence);
CREATE INDEX IF NOT EXISTS packet_staff_reports_fiscal_idx
  ON packet_staff_reports (fiscal_max_cents DESC NULLS LAST);

-- There is deliberately NO major_expenditures table.
--
-- The "Major Expenditures for <month>" page lists the largest payments of the
-- previous month with a note on what each bought, and it is genuinely useful --
-- the outside law firm in the August 2026 packet appears there and nowhere in
-- that packet's register. But the page is laid out in three columns and text
-- extraction flattens them by interleaving, so no payee, amount and note can be
-- put back together reliably: the text after "Presnell Gage, PLLC 33,800.00$"
-- is "Crafco road saver for crack fill", which belongs to a different payee.
--
-- So the page is stored as segment text and is searchable, and the reader is
-- sent to the page it is printed on -- rather than turned into rows this site
-- would then add up and present as fact. The check register, which prints its
-- own total and therefore checks out, is the structured source.

-- The candidate query of the ingest job filters meeting_documents by kind.
CREATE INDEX IF NOT EXISTS meeting_documents_kind_idx ON meeting_documents (kind);
