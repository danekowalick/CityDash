/**
 * Reading an agenda packet.
 *
 * A packet is not a document, it is a stack of unrelated documents photocopied
 * together: the agenda, the previous meeting's draft minutes, the accounts
 * payable register, the monthly disbursement report, then a staff report per
 * item each trailed by its attachments -- contracts, plats, engineering
 * specifications. Three hundred pages is normal for Council.
 *
 * So the first job is an outline: decide what each page belongs to. Everything
 * else follows from that, including keeping search off the 150-odd pages of
 * contract and specification boilerplate that would otherwise bury every real
 * result.
 *
 * As everywhere else in this codebase, pages arrive from extractPdfText as one
 * flattened line each -- there are no newlines to split on.
 */

import {
  isRegisterHeaderPage,
  parseCalendarDate,
  isRegisterPage,
  parseCheckRegister,
  parseMoneyCents,
  type ParsedRegister,
} from "./checkRegister";
import { looksScanned } from "./minutes";

export type SegmentKind =
  | "agenda"
  | "minutes"
  | "check_register"
  | "disbursement_report"
  | "major_expenditures"
  | "staff_report"
  | "attachment"
  | "unclassified";

export interface PacketSegment {
  sequence: number;
  kind: SegmentKind;
  title: string | null;
  startPage: number;
  endPage: number;
  text: string | null;
}

const AGENDA_MARKER = /~\s*Agenda\s*~|Agenda\s+[A-Z][a-z]+ \d{1,2}, \d{4}\s+Page \d+ of \d+/;
const MINUTES_MARKER = /~\s*Minutes\s*~|Minutes\s+[A-Z][a-z]+ \d{1,2}, \d{4}\s+Page \d+ of \d+/;
const MAJOR_EXPENDITURES_MARKER = /Major Expenditures for ([A-Z][a-z]+) (\d{4})/;
const DISBURSEMENT_MARKER =
  /Cash and Investments Balances as of|RECEIPTS REPORT FOR|DISBURSEMENTS REPORT FOR/;

/**
 * The Council/committee staff report, which carries the eleven labelled fields
 * this feature exists to read -- FISCAL IMPACT above all.
 */
const COUNCIL_REPORT_BANNER = /COMMITTEE \/ CITY COUNCIL STAFF REPORT/;

/**
 * Planning & Zoning and the Board of Adjustment publish a different animal: a
 * prose report headed "Hearing Date:" with no labelled fields and no fiscal
 * impact line at all. It is still a staff report and still belongs in the
 * outline; there is simply nothing structured in it to extract.
 */
const DEPARTMENT_REPORT_BANNER = /CITY OF MOSCOW [A-Z][A-Z ]+ DEPARTMENT STAFF REPORT/;

/** A continuation page of a staff report: no banner, just "Page 2 of 2". */
const CONTINUATION_MARKER = /^Page \d+ of \d+\b/;
const TRAILING_LABELS =
  /PROPOSED ACTIONS|STAFF RECOMMENDATION|OTHER RESOURCES|FISCAL IMPACT|PERSONNEL IMPACT|ATTACHMENTS/;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Strip the page number CivicClerk stamps on every page it binds in. */
function stripFooter(text: string): string {
  return collapse(text).replace(/\s*Page \d+\s*$/, "");
}

/**
 * What one page belongs to, judged on its own. Null means "no opinion" and
 * lets segmentPages carry the previous page forward.
 */
export function classifyPage(page: string): SegmentKind | null {
  const flat = collapse(page);
  if (isRegisterPage(flat)) return "check_register";
  if (MAJOR_EXPENDITURES_MARKER.test(flat)) return "major_expenditures";
  if (DISBURSEMENT_MARKER.test(flat)) return "disbursement_report";
  if (COUNCIL_REPORT_BANNER.test(flat) || DEPARTMENT_REPORT_BANNER.test(flat)) return "staff_report";
  if (MINUTES_MARKER.test(flat)) return "minutes";
  if (AGENDA_MARKER.test(flat)) return "agenda";
  return null;
}

/**
 * Whether an unmarked page continues the staff report before it, rather than
 * being the first of its attachments. A continuation opens with a bare
 * "Page N of M" and goes straight back into the label sequence.
 */
function continuesStaffReport(page: string): boolean {
  const flat = stripFooter(page);
  return CONTINUATION_MARKER.test(flat) && TRAILING_LABELS.test(flat);
}

/**
 * Text is kept for the segments worth reading and dropped for two kinds.
 *
 * 'minutes' -- the previous meeting's draft minutes, which the meeting-minutes
 * job already ingests from their own PDF; a second copy would double-count.
 *
 * 'attachment' -- contracts, plats and engineering specifications. These are
 * more than half the packet, are almost entirely boilerplate, and searching
 * them returns twenty hits of "ARTICLE 13. LEGAL FEES" for every real one. The
 * page range is kept so a reader is sent to the right page of the city's PDF.
 */
function keepsText(kind: SegmentKind): boolean {
  return kind !== "minutes" && kind !== "attachment";
}

const KIND_LABELS: Record<SegmentKind, string> = {
  agenda: "Agenda",
  minutes: "Draft minutes of the previous meeting",
  check_register: "Check register",
  disbursement_report: "Disbursement report",
  major_expenditures: "Major expenditures",
  staff_report: "Staff report",
  attachment: "Attachments",
  unclassified: "Front matter",
};

export function segmentPages(pages: string[]): PacketSegment[] {
  const kinds: SegmentKind[] = [];

  for (let i = 0; i < pages.length; i++) {
    const own = classifyPage(pages[i]);
    if (own !== null) {
      kinds.push(own);
      continue;
    }

    const previous = i > 0 ? kinds[i - 1] : null;
    if (previous === null) {
      kinds.push("unclassified");
    } else if (previous === "staff_report") {
      kinds.push(continuesStaffReport(pages[i]) ? "staff_report" : "attachment");
    } else if (previous === "agenda" || previous === "minutes" || previous === "attachment") {
      kinds.push(previous);
    } else {
      // After a register or a financial report, an unmarked page is whatever
      // was bound in behind it.
      kinds.push("attachment");
    }
  }

  const segments: PacketSegment[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const previous = segments[segments.length - 1];
    // A new staff report always opens a new segment even when the one before
    // it was also a staff report -- each is a different agenda item. Likewise
    // a register banner: a packet can carry two registers back to back, each
    // with its own declared total, and merging them would compare our sum of
    // both against the printed total of only the first.
    const opensNew =
      previous === undefined ||
      previous.kind !== kind ||
      (kind === "staff_report" && classifyPage(pages[i]) === "staff_report") ||
      (kind === "check_register" && isRegisterHeaderPage(pages[i]));

    if (opensNew) {
      segments.push({
        sequence: segments.length + 1,
        kind,
        title: null,
        startPage: i + 1,
        endPage: i + 1,
        text: null,
      });
    } else {
      previous.endPage = i + 1;
    }
  }

  for (const segment of segments) {
    const body = pages
      .slice(segment.startPage - 1, segment.endPage)
      .map((page) => stripFooter(page))
      .join("\n");
    segment.text = keepsText(segment.kind) ? body : null;
    segment.title =
      segment.kind === "staff_report"
        ? (readLabelledField(body, "AGENDA ITEM TITLE") ?? KIND_LABELS[segment.kind])
        : KIND_LABELS[segment.kind];
  }

  return segments;
}

/* -------------------------------------------------------------------------- */
/* Staff reports                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The eleven labels, in the order the form prints them. Order matters: each
 * field runs from the end of its own label to the start of the next label that
 * is actually present, so a missing label cannot let one field swallow the
 * rest of the report.
 */
const STAFF_REPORT_LABELS = [
  "AGENDA ITEM TITLE",
  "RESPONSIBLE STAFF",
  "ADDITIONAL PRESENTER(S)",
  "DESCRIPTION",
  "REVIEWED BY",
  "PROPOSED ACTIONS",
  "STAFF RECOMMENDATION",
  "OTHER RESOURCES",
  "FISCAL IMPACT",
  "PERSONNEL IMPACT",
  "ATTACHMENTS",
] as const;

export type StaffReportField = (typeof STAFF_REPORT_LABELS)[number];

function readLabelledField(text: string, label: StaffReportField): string | null {
  const fields = readLabelledFields(text);
  return fields[label] ?? null;
}

/**
 * Slice a labelled staff report into its fields.
 *
 * A label that does not appear yields undefined -- distinct from a label that
 * appears with nothing after it, which yields "". "The field was left blank"
 * and "this form has no such field" are different facts, and FISCAL IMPACT is
 * blank often enough that the difference matters.
 */
export function readLabelledFields(text: string): Partial<Record<StaffReportField, string>> {
  const flat = collapse(text.replace(/\n/g, " "));
  const found: Array<{ label: StaffReportField; start: number; end: number }> = [];

  for (const label of STAFF_REPORT_LABELS) {
    const index = flat.indexOf(label);
    if (index !== -1) found.push({ label, start: index, end: index + label.length });
  }
  found.sort((a, b) => a.start - b.start);

  const out: Partial<Record<StaffReportField, string>> = {};
  for (let i = 0; i < found.length; i++) {
    const next = found[i + 1];
    const value = flat.slice(found[i].end, next ? next.start : flat.length);
    out[found[i].label] = collapse(value.replace(/\bPage \d+ of \d+\b/g, ""));
  }
  return out;
}

export interface ParsedStaffReport {
  sequence: number;
  startPage: number;
  endPage: number;
  reportDate: Date | null;
  agendaItemTitle: string | null;
  responsibleStaff: string | null;
  additionalPresenters: string | null;
  description: string | null;
  reviewedBy: string | null;
  proposedActions: string | null;
  staffRecommendation: string | null;
  otherResources: string | null;
  fiscalImpact: string | null;
  personnelImpact: string | null;
  attachments: string | null;
  /** Every figure printed in FISCAL IMPACT, in cents, in the order printed. */
  fiscalAmountsCents: number[];
  fiscalMaxCents: number | null;
}

const REPORT_DATE = /DATE:\s*(?:[A-Z][a-z]+day,?\s*)?([A-Z][a-z]+ \d{1,2}, \d{4})/;

export function parseStaffReport(
  text: string,
  sequence: number,
  startPage: number,
  endPage: number,
): ParsedStaffReport {
  const fields = readLabelledFields(text);
  // A label that was printed but left empty is not the same fact as a label
  // the form does not have. FISCAL IMPACT is blank often enough -- the
  // $149,942,154 FY2027 budget leaves it blank -- that the page must be able
  // to say "stated as blank" rather than imply the item was free.
  const blank = (value: string | undefined): string | null => value ?? null;

  const fiscalImpact = blank(fields["FISCAL IMPACT"]);
  const amounts: number[] = [];
  if (fiscalImpact) {
    for (const m of fiscalImpact.matchAll(/\$\s?\(?[\d,]+(?:\.\d{2})?\)?/g)) {
      const money = parseMoneyCents(m[0]);
      if (money) amounts.push(money.cents);
    }
  }

  const dateMatch = REPORT_DATE.exec(collapse(text.replace(/\n/g, " ")));
  const reportDate = dateMatch ? new Date(dateMatch[1] + " 00:00:00Z") : null;

  return {
    sequence,
    startPage,
    endPage,
    reportDate,
    agendaItemTitle: blank(fields["AGENDA ITEM TITLE"]),
    responsibleStaff: blank(fields["RESPONSIBLE STAFF"]),
    additionalPresenters: blank(fields["ADDITIONAL PRESENTER(S)"]),
    description: blank(fields["DESCRIPTION"]),
    reviewedBy: blank(fields["REVIEWED BY"]),
    proposedActions: blank(fields["PROPOSED ACTIONS"]),
    staffRecommendation: blank(fields["STAFF RECOMMENDATION"]),
    otherResources: blank(fields["OTHER RESOURCES"]),
    fiscalImpact,
    personnelImpact: blank(fields["PERSONNEL IMPACT"]),
    attachments: blank(fields["ATTACHMENTS"]),
    fiscalAmountsCents: amounts,
    fiscalMaxCents: amounts.length > 0 ? Math.max(...amounts) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Major expenditures                                                         */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function readMajorExpenditurePeriod(text: string): Date | null {
  const m = MAJOR_EXPENDITURES_MARKER.exec(collapse(text));
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month === -1) return null;
  return new Date(Date.UTC(Number(m[2]), month, 1));
}

/*
 * The Major Expenditures page is deliberately NOT parsed into rows.
 *
 * It is laid out in three columns and extraction flattens them by
 * interleaving, so neither the payee nor the description can be attributed to
 * an amount with any confidence. The raw text reads:
 *
 *   "HDR Engineering, Inc. 3,480.26$ Finley Buttes Landfill $ 158,950.80
 *    Avista Utilities 97,543.54$ Water project Garbarge for June 2026 ..."
 *
 * -- column headings inline, descriptions belonging to entries three columns
 * away, one amount with a leading dollar sign where every other has a trailing
 * one, and running totals mixed in among the payees. Every attribution rule
 * tried against it produced confident wrong answers: "Presnell Gage, PLLC
 * 33,800.00$" is followed by "Crafco road saver for crack fill", which is a
 * different payee's purchase entirely.
 *
 * The page is still valuable and is still kept: it is stored as segment text
 * and is searchable, so a reader looking for the outside law firm finds
 * "Moore Elia Kraft & Stacey, LLP 5,061.00$" and is sent to the page it is
 * printed on. What is not done is turning it into rows the site would then
 * total up and present as fact.
 *
 * The check register, which carries its own printed total and therefore checks
 * out, is the structured source. This page is a pointer.
 */

/* -------------------------------------------------------------------------- */
/* The whole packet                                                           */
/* -------------------------------------------------------------------------- */

export interface ParsedPacket {
  pageCount: number;
  textPageCount: number;
  imagePageCount: number;
  isScanned: boolean;
  /** Normalised text of the readable segments, for raw_documents.body. */
  text: string;
  segments: PacketSegment[];
  registers: ParsedRegister[];
  staffReports: ParsedStaffReport[];
  majorExpenditurePeriod: Date | null;
  unknownFunds: string[];
}

/** Below this a page carries no usable text layer -- it is a photograph. */
const MIN_TEXT_CHARS = 50;

export function parsePacket(pages: string[]): ParsedPacket {
  const segments = segmentPages(pages);

  const registers: ParsedRegister[] = [];
  const unknownFunds = new Set<string>();
  for (const segment of segments) {
    if (segment.kind !== "check_register") continue;
    const slice = [];
    for (let page = segment.startPage; page <= segment.endPage; page++) {
      slice.push({ page, text: pages[page - 1] });
    }
    const register = parseCheckRegister(slice);
    register.unknownFunds.forEach((fund) => unknownFunds.add(fund));
    registers.push(register);
  }

  const staffReports: ParsedStaffReport[] = [];
  for (const segment of segments) {
    if (segment.kind !== "staff_report" || segment.text === null) continue;
    // Only the Council/committee form carries labelled fields. The Community
    // Development form is prose; it is kept in the outline and left unparsed
    // rather than have its text forced into fields it does not have.
    if (!COUNCIL_REPORT_BANNER.test(segment.text)) continue;
    staffReports.push(
      parseStaffReport(segment.text, staffReports.length + 1, segment.startPage, segment.endPage),
    );
  }

  let majorExpenditurePeriod: Date | null = null;
  for (const segment of segments) {
    if (segment.kind !== "major_expenditures" || segment.text === null) continue;
    majorExpenditurePeriod ??= readMajorExpenditurePeriod(segment.text);
  }

  const textPageCount = pages.filter((page) => collapse(page).length >= MIN_TEXT_CHARS).length;

  return {
    pageCount: pages.length,
    textPageCount,
    imagePageCount: pages.length - textPageCount,
    isScanned: looksScanned(pages),
    text: segments
      .filter((segment) => segment.text !== null)
      .map((segment) => segment.text)
      .join("\n\n"),
    segments,
    registers,
    staffReports,
    majorExpenditurePeriod,
    unknownFunds: [...unknownFunds],
  };
}
