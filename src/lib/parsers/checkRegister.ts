/**
 * The accounts-payable check register bound into every Council agenda packet.
 *
 * This is the single richest financial record the city publishes: every line
 * of every cheque the Council is being asked to approve, with the account, the
 * fund, the payee and the amount. It is never summarised in the agenda and
 * never mentioned in the minutes.
 *
 * Two things make it awkward to read.
 *
 * First, extractPdfText returns each page as ONE LONG LINE -- joinTextItems
 * inserts a space for a line break and never a newline -- so there are no rows
 * to split on. Instead each row is found by its tail, the only unambiguous
 * shape on the page: a date followed by a dollar amount. The text between one
 * tail and the next is that row's account, fund, cheque number and payee.
 *
 * Second, the register is a fixed-width report, and it CLIPS an amount that
 * overflows its column: a line reads "$1,193,437." while the "Check Total:"
 * for the same cheque reads "$1,193,437.50". Those are recovered by
 * arithmetic where the cheque's own total makes it unambiguous, and flagged
 * where it does not. Nothing is ever rounded or guessed.
 *
 * The register prints its own "Total Amount Being Paid", so the parse can be
 * checked against the document. We store both numbers and never adjust ours
 * to match.
 */

/** A dollar figure as the packet prints it, in cents. */
export interface Money {
  cents: number;
  /** The source clipped the cents off at the column edge. Understated. */
  clipped: boolean;
}

/**
 * "$1,234.56" | "$(11.20)" (negative) | "3,480.26$" (trailing sign, used on
 * the Major Expenditures page) | "$1,193,437." (clipped) | "$45,000".
 */
export function parseMoneyCents(raw: string): Money | null {
  const trimmed = raw.trim();
  if (!/[\d]/.test(trimmed)) return null;

  const negative = /^\$?\(/.test(trimmed) || /\)\$?$/.test(trimmed);
  const digits = trimmed.replace(/[^\d.]/g, "");
  if (digits === "" || digits === ".") return null;

  const [whole, fraction = ""] = digits.split(".");
  // A decimal point with fewer than two digits behind it is the column edge
  // cutting the cents off. No decimal point at all is a whole-dollar figure,
  // which is normal in prose fields like FISCAL IMPACT.
  const clipped = digits.includes(".") && fraction.length < 2;
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0").slice(0, 2) || "0");
  if (!Number.isFinite(cents)) return null;

  return { cents: negative ? -cents : cents, clipped };
}

/**
 * The funds the city posts against, as the register spells them.
 *
 * A closed set on purpose. The row has no delimiter between the account name
 * and the fund name, so the fund is the only thing that can tell them apart --
 * splitting on it is what makes "Heat, Lights & Utilities" and "Recreation &
 * Culture" separable at all. A fund we do not know is reported by the job
 * rather than guessed at, so this list is widened deliberately.
 *
 * Whitespace inside a name is not a worry: parseCheckRegister collapses runs
 * of spaces before matching, which is what makes the register's oddly
 * double-spaced "Sewer   Fund" match plain "Sewer Fund".
 */
export const KNOWN_FUNDS: readonly string[] = [
  "General Fund",
  "Streets Fund",
  "Water Capital Fund",
  "Sewer Capital Fund",
  "Stormwater Capital Fund",
  "Sanitation Capital Fund",
  "Water Fund",
  "Sewer Fund",
  "Stormwater Fund",
  "Sanitation Fund",
  "Fleet Management Fund",
  "Capital Projects Fund",
  "Hamilton Trust Fund",
  "Bond & Interest Fund",
  "LID Construction Fund",
  "Payroll Service Fund",
  "Recreation & Culture",
  "MSD Community Playfields",
  "MSD Community Play Fields",
  "Community Play Fields",
  "Information Systems Fund",
  "Information Systems",
  "Transit Center",
  "1912 Center Fund",
  "1912 Center",
];

/**
 * A grouping key for a payee.
 *
 * The register is not consistent about case or punctuation between packets --
 * the same payee is "WHITCOM 911" one fortnight and "Whitcom 911" the next,
 * "PRESNELL GAGE PLLC" and then "Presnell Gage, PLLC". Upper-casing and
 * flattening punctuation collapses those.
 *
 * Corporate suffixes are deliberately NOT stripped. Dropping "PLLC" would
 * merge a law firm with an unrelated partnership of the same name, and this
 * site does not merge two parties on a guess.
 */
export function normaliseVendorKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** The banner the register prints at the top of its first page. */
const REGISTER_BANNER =
  /(\d+)\/(\d+)\s+([A-Z][a-z]+ \d{1,2}, \d{4})\s+\d{1,2}:\d{2}\s*[AP]M\s+Accounts Payable\s*Checks for Approval\s+(\S+)/;

/**
 * The column header, repeated on every page of the register.
 *
 * Packets before about July 2026 render this report with the columns abutting,
 * so the header arrives as "AccountCheck # Vendor NameCheck Date AmountFund"
 * and the rows run their fields together the same way. Every separator here is
 * therefore optional, not required.
 */
const COLUMN_HEADER = /Account\s*Check #\s*Vendor Name\s*Check Date\s*Amount\s*Fund/g;

/** The amount precedes the label on this line, which is easy to get backwards. */
const DECLARED_TOTAL = /\$?([\d,]+\.\d{2})\s*Total Amount Being Paid:/;

/** The tail of a row, and the only unambiguous shape on the page. */
const ROW_TAIL = /(\d{2})\/(\d{2})\/(\d{4})\s*\$(\(?[\d,]+(?:\.\d{0,2})?\)?)/g;

const CHECK_TOTAL = /Check Total:\s*\$(\(?[\d,]+(?:\.\d{0,2})?\)?)/g;

/** CivicClerk stamps a page number onto every page it binds into the packet. */
const PACKET_FOOTER = /\s*Page \d+\s*$/;

export interface RegisterHeader {
  pageIndex: number;
  pageTotal: number;
  reportDate: Date | null;
  preparedBy: string | null;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * "August 12, 2026" as local midnight.
 *
 * Deliberately not `new Date(text)`, which reads a bare date as UTC. These
 * land in DATE columns, and a UTC midnight written from a US timezone stores
 * as the day before -- a register printed on the 12th would be filed as the
 * 11th.
 */
export function parseCalendarDate(text: string): Date | null {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTH_NAMES.indexOf(m[1].toLowerCase());
  if (month === -1) return null;
  const date = new Date(Number(m[3]), month, Number(m[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function readRegisterHeader(page: string): RegisterHeader | null {
  const m = REGISTER_BANNER.exec(collapse(page));
  if (!m) return null;
  return {
    pageIndex: Number(m[1]),
    pageTotal: Number(m[2]),
    reportDate: parseCalendarDate(m[3]),
    preparedBy: m[4] || null,
  };
}

export function isRegisterHeaderPage(page: string): boolean {
  return readRegisterHeader(page) !== null;
}

export function isRegisterPage(page: string): boolean {
  const flat = collapse(page);
  return isRegisterHeaderPage(page) || /Account\s*Check #\s*Vendor Name/.test(flat);
}

export function readDeclaredTotalCents(page: string): number | null {
  const m = DECLARED_TOTAL.exec(collapse(page));
  if (!m) return null;
  return parseMoneyCents(m[1])?.cents ?? null;
}

/** Collapse every run of whitespace to a single space. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Remove the furniture that repeats on every page, so it cannot leak into a row. */
function stripFurniture(page: string): string {
  let flat = collapse(page).replace(PACKET_FOOTER, "");
  flat = flat.replace(REGISTER_BANNER, " ");
  COLUMN_HEADER.lastIndex = 0;
  flat = flat.replace(COLUMN_HEADER, " ");
  return collapse(flat);
}

export interface DraftPaymentRow {
  page: number;
  checkNumber: string | null;
  vendorName: string;
  account: string | null;
  fund: string | null;
  checkDate: Date | null;
  amountCents: number;
  clipped: boolean;
}

export interface PaymentRow extends DraftPaymentRow {
  repaired: boolean;
  uncertain: boolean;
}

export interface RegisterChecksum {
  declaredTotalCents: number | null;
  parsedTotalCents: number;
  /** parsed minus declared. Null when the register printed no total. */
  discrepancyCents: number | null;
  balanced: boolean;
  declaredPageCount: number | null;
  pageCount: number;
  rowCount: number;
  repairedCount: number;
  uncertainCount: number;
}

export interface ParsedRegister {
  startPage: number;
  endPage: number;
  reportDate: Date | null;
  preparedBy: string | null;
  rows: PaymentRow[];
  checksum: RegisterChecksum;
  /** Text seen where a fund was expected but none matched KNOWN_FUNDS. */
  unknownFunds: string[];
}

/**
 * Split "<Account> <Fund> <Check#> <Vendor Name>".
 *
 * The cheque number may be as short as one digit: a voided cheque and its
 * reissue are printed as a pair of equal and opposite lines numbered from a
 * separate short sequence. They net to zero, so a register still balances if
 * they are misread -- which is exactly why the fund pivot has to catch them
 * rather than let them run into the payee name.
 *
 * The pivot is the fund, chosen as the match that ends latest and is followed
 * by something shaped like a cheque number and a payee. Scanning for the
 * cheque number first does not work: payees are full of digits ("3M COMPANY",
 * "WHITCOM 911").
 */
function splitRowPrefix(slice: string): {
  account: string | null;
  fund: string | null;
  checkNumber: string | null;
  vendorName: string;
  unknownFund: string | null;
} {
  let best: { end: number; fund: string; account: string; checkNumber: string; vendor: string } | null =
    null;

  for (const fund of KNOWN_FUNDS) {
    let from = slice.length;
    for (;;) {
      const idx = slice.lastIndexOf(fund, from);
      if (idx === -1) break;
      const after = slice.slice(idx + fund.length);
      const m = /^\s*(\d{1,8})\s*(\S.*)$/.exec(after);
      const end = idx + fund.length;
      if (m && (best === null || end > best.end)) {
        best = {
          end,
          fund,
          account: slice.slice(0, idx).trim(),
          checkNumber: m[1],
          vendor: m[2].trim(),
        };
      }
      from = idx - 1;
      if (from < 0) break;
    }
  }

  if (best) {
    return {
      account: best.account || null,
      fund: best.fund,
      checkNumber: best.checkNumber,
      vendorName: best.vendor,
      unknownFund: null,
    };
  }

  // No known fund. Still emit the row -- the amount is the part that matters --
  // but report what sat where the fund should have been, so the list can be
  // widened on purpose rather than the money silently vanishing.
  const fallback = /^(.*?)\s*(\d{3,8})\s*(\S.*)$/.exec(slice);
  if (!fallback) {
    return { account: null, fund: null, checkNumber: null, vendorName: slice.trim(), unknownFund: null };
  }
  const prefix = fallback[1].trim();
  return {
    account: prefix || null,
    fund: null,
    checkNumber: fallback[2],
    vendorName: fallback[3].trim(),
    unknownFund: prefix ? prefix.split(/\s+/).slice(-3).join(" ") : null,
  };
}

/**
 * Recover amounts the source clipped at the column edge.
 *
 * For a cheque whose "Check Total:" is known and which has exactly one clipped
 * line, that line must be the total minus the lines that are intact. That is
 * arithmetic, not inference, so the row is corrected and flagged as repaired.
 * Two clipped lines on one cheque, or no printed total, leaves the understated
 * figure in place and flags it as uncertain.
 */
export function repairClippedAmounts(
  rows: DraftPaymentRow[],
  checkTotals: Map<string, number>,
): { rows: PaymentRow[]; repaired: number; uncertain: number } {
  const byCheck = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = row.checkNumber ?? "";
    const list = byCheck.get(key);
    if (list) list.push(index);
    else byCheck.set(key, [index]);
  });

  const out: PaymentRow[] = rows.map((row) => ({ ...row, repaired: false, uncertain: false }));
  let repaired = 0;
  let uncertain = 0;

  for (const [checkNumber, indexes] of byCheck) {
    const clipped = indexes.filter((i) => rows[i].clipped);
    if (clipped.length === 0) continue;

    const total = checkTotals.get(checkNumber);
    if (total === undefined || clipped.length > 1) {
      for (const i of clipped) {
        out[i].uncertain = true;
        uncertain++;
      }
      continue;
    }

    const intact = indexes.filter((i) => !rows[i].clipped).reduce((sum, i) => sum + rows[i].amountCents, 0);
    out[clipped[0]].amountCents = total - intact;
    out[clipped[0]].repaired = true;
    repaired++;
  }

  return { rows: out, repaired, uncertain };
}

/**
 * Attach any "Check Total:" figures in `slice` to the cheque of the row that
 * precedes them. Mutates `totals`.
 */
function claimCheckTotals(
  slice: string,
  drafts: DraftPaymentRow[],
  totals: Map<string, number>,
): void {
  const owner = drafts[drafts.length - 1];
  if (!owner?.checkNumber) return;

  CHECK_TOTAL.lastIndex = 0;
  for (let m = CHECK_TOTAL.exec(slice); m !== null; m = CHECK_TOTAL.exec(slice)) {
    const money = parseMoneyCents(m[1]);
    if (money) totals.set(owner.checkNumber, money.cents);
  }
}

/**
 * Parse one register.
 *
 * `pages` are the register's pages only, carrying their 1-based page number
 * within the packet, as sliced out by the segmenter.
 */
export function parseCheckRegister(pages: Array<{ page: number; text: string }>): ParsedRegister {
  const drafts: DraftPaymentRow[] = [];
  const checkTotals = new Map<string, number>();
  const unknownFunds = new Set<string>();

  let header: RegisterHeader | null = null;
  let declaredTotalCents: number | null = null;

  for (const { page, text } of pages) {
    if (!header) header = readRegisterHeader(text);
    if (declaredTotalCents === null) declaredTotalCents = readDeclaredTotalCents(text);

    const flat = stripFurniture(text);

    ROW_TAIL.lastIndex = 0;
    let cursor = 0;
    for (let m = ROW_TAIL.exec(flat); m !== null; m = ROW_TAIL.exec(flat)) {
      const slice = flat.slice(cursor, m.index);
      const money = parseMoneyCents(m[4]);
      cursor = m.index + m[0].length;

      // "Check Total:" closes the cheque named by the row before it, and sits
      // in the gap between that row and the next. A cheque can run across a
      // page break -- Avista's nine funds do -- so the owner is whatever row
      // came last, even if that was on the previous page.
      claimCheckTotals(slice, drafts, checkTotals);

      if (!money) continue;

      const parts = splitRowPrefix(collapse(slice.replace(CHECK_TOTAL, " ")));
      if (parts.unknownFund) unknownFunds.add(parts.unknownFund);

      const date = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
      drafts.push({
        page,
        checkNumber: parts.checkNumber,
        vendorName: parts.vendorName,
        account: parts.account,
        fund: parts.fund,
        checkDate: Number.isNaN(date.getTime()) ? null : date,
        amountCents: money.cents,
        clipped: money.clipped,
      });
    }

    // The total closing the last cheque on the page trails the final row.
    claimCheckTotals(flat.slice(cursor), drafts, checkTotals);
  }

  const repairedResult = repairClippedAmounts(drafts, checkTotals);
  const parsedTotalCents = repairedResult.rows.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    startPage: pages.length > 0 ? pages[0].page : 0,
    endPage: pages.length > 0 ? pages[pages.length - 1].page : 0,
    reportDate: header?.reportDate ?? null,
    preparedBy: header?.preparedBy ?? null,
    rows: repairedResult.rows,
    unknownFunds: [...unknownFunds],
    checksum: {
      declaredTotalCents,
      parsedTotalCents,
      discrepancyCents: declaredTotalCents === null ? null : parsedTotalCents - declaredTotalCents,
      balanced: declaredTotalCents !== null && parsedTotalCents === declaredTotalCents,
      declaredPageCount: header?.pageTotal ?? null,
      pageCount: pages.length,
      rowCount: repairedResult.rows.length,
      repairedCount: repairedResult.repaired,
      uncertainCount: repairedResult.uncertain,
    },
  };
}
