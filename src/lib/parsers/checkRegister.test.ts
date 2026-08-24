import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  KNOWN_FUNDS,
  isRegisterHeaderPage,
  isRegisterPage,
  normaliseVendorKey,
  parseCheckRegister,
  parseMoneyCents,
  readDeclaredTotalCents,
  readRegisterHeader,
  repairClippedAmounts,
  type DraftPaymentRow,
} from "./checkRegister";

/**
 * The fixture is the extracted page text of a real packet, not the packet
 * itself: the 17 August 2026 Council packet is 21MB of PDF, which has no place
 * in a repository. pdf.ts is what turns bytes into text and is exercised by the
 * minutes tests; these parsers are only ever handed text.
 */
function loadPages(name: string): string[] {
  const file = join(__dirname, "..", "fixtures", "packets", name + ".pages.json");
  return JSON.parse(readFileSync(file, "utf8")).pages as string[];
}

const council = loadPages("council-2026-08-17");

function registerPages(from: number, to: number): Array<{ page: number; text: string }> {
  const out: Array<{ page: number; text: string }> = [];
  for (let page = from; page <= to; page++) out.push({ page, text: council[page - 1] });
  return out;
}

describe("parseMoneyCents", () => {
  it("reads the ordinary form", () => {
    expect(parseMoneyCents("$1,234.56")).toEqual({ cents: 123456, clipped: false });
    expect(parseMoneyCents("$603.40")).toEqual({ cents: 60340, clipped: false });
  });

  it("reads a refund, which the register prints in parentheses", () => {
    expect(parseMoneyCents("$(11.20)")).toEqual({ cents: -1120, clipped: false });
  });

  it("reads the trailing-sign form used on the major expenditures page", () => {
    expect(parseMoneyCents("3,480.26$")).toEqual({ cents: 348026, clipped: false });
  });

  it("flags an amount whose cents the column width cut off", () => {
    expect(parseMoneyCents("$1,193,437.")).toEqual({ cents: 119343700, clipped: true });
  });

  it("does not call a whole-dollar figure clipped", () => {
    // Prose fields like FISCAL IMPACT write round numbers without cents.
    expect(parseMoneyCents("$45,000")).toEqual({ cents: 4500000, clipped: false });
  });

  it("returns null for text carrying no number", () => {
    expect(parseMoneyCents("$")).toBeNull();
    expect(parseMoneyCents("")).toBeNull();
  });
});

describe("normaliseVendorKey", () => {
  it("collapses the casing and punctuation that differ between packets", () => {
    expect(normaliseVendorKey("WHITCOM 911")).toBe(normaliseVendorKey("Whitcom 911"));
    expect(normaliseVendorKey("PRESNELL GAGE PLLC")).toBe(normaliseVendorKey("Presnell Gage, PLLC"));
    expect(normaliseVendorKey("ALSCO, INC.")).toBe(normaliseVendorKey("Alsco Inc"));
  });

  it("keeps the corporate suffix", () => {
    // Dropping "PLLC" would merge a law firm with an unrelated partnership.
    expect(normaliseVendorKey("Presnell Gage, PLLC")).toContain("PLLC");
    expect(normaliseVendorKey("Moore Elia Kraft & Stacey, LLP")).toBe("MOORE ELIA KRAFT STACEY LLP");
  });
});

describe("register page recognition", () => {
  it("finds the banner on the first page of a register", () => {
    expect(isRegisterHeaderPage(council[7])).toBe(true);
    expect(isRegisterHeaderPage(council[8])).toBe(false);
  });

  it("recognises a continuation page by its column header", () => {
    expect(isRegisterPage(council[8])).toBe(true);
    expect(isRegisterPage(council[0])).toBe(false);
  });

  it("reads the banner", () => {
    const header = readRegisterHeader(council[7]);
    expect(header).not.toBeNull();
    expect(header?.pageIndex).toBe(1);
    expect(header?.pageTotal).toBe(20);
    expect(header?.preparedBy).toBe("jlopez");
    expect(header?.reportDate?.toISOString().slice(0, 10)).toBe("2026-08-12");
  });

  it("reads the declared total, whose amount precedes its label", () => {
    expect(readDeclaredTotalCents(council[26])).toBe(242979542);
  });
});

describe("parseCheckRegister", () => {
  const first = parseCheckRegister(registerPages(8, 27));
  const second = parseCheckRegister(registerPages(28, 29));

  it("balances against the total the city printed", () => {
    // The point of the whole exercise: our arithmetic and theirs agree.
    expect(first.checksum.declaredTotalCents).toBe(242979542);
    expect(first.checksum.parsedTotalCents).toBe(242979542);
    expect(first.checksum.discrepancyCents).toBe(0);
    expect(first.checksum.balanced).toBe(true);

    expect(second.checksum.declaredTotalCents).toBe(39530561);
    expect(second.checksum.parsedTotalCents).toBe(39530561);
    expect(second.checksum.balanced).toBe(true);
  });

  it("reads as many pages as the register says it has", () => {
    expect(first.checksum.pageCount).toBe(first.checksum.declaredPageCount);
    expect(second.checksum.pageCount).toBe(second.checksum.declaredPageCount);
  });

  it("reads every line", () => {
    expect(first.checksum.rowCount).toBe(448);
    expect(second.checksum.rowCount).toBe(25);
  });

  it("splits account from fund without a delimiter between them", () => {
    const row = first.rows[0];
    expect(row.account).toBe("Traffic Control");
    expect(row.fund).toBe("Streets Fund");
    expect(row.checkNumber).toBe("117130");
    expect(row.vendorName).toBe("3M COMPANY");
    expect(row.amountCents).toBe(60340);
  });

  it("does not let the repeated page furniture leak into the first account name", () => {
    // The banner and column header sit immediately before the first row.
    for (const row of [...first.rows, ...second.rows]) {
      expect(row.account ?? "").not.toMatch(/Accounts Payable|Check Date|Amount Fund/);
    }
  });

  it("recognises every fund it meets", () => {
    expect(first.unknownFunds).toEqual([]);
    expect(second.unknownFunds).toEqual([]);
    for (const row of first.rows) expect(KNOWN_FUNDS).toContain(row.fund);
  });

  it("keeps refunds negative", () => {
    const refund = first.rows.find((row) => row.vendorName.startsWith("HAHN RENTAL"));
    expect(refund?.amountCents).toBe(-1120);
  });

  it("recovers cents the source clipped, using the total of that cheque", () => {
    const apollo = first.rows.find((row) => row.vendorName === "Apollo, Inc.");
    expect(apollo?.repaired).toBe(true);
    expect(apollo?.amountCents).toBe(119343750); // printed as "$1,193,437."
    expect(apollo?.uncertain).toBe(false);
  });

  it("carries a cheque that runs across a page break", () => {
    // Avista's electricity is split across nine funds, spanning pages 8 and 9,
    // and its "Check Total:" only appears on the second page.
    const avista = first.rows.filter((row) => row.vendorName === "Avista Utilities");
    expect(avista.length).toBeGreaterThan(10);
    expect(avista.some((row) => row.page === 8)).toBe(true);
    expect(avista.some((row) => row.page === 9)).toBe(true);
    expect(avista.reduce((sum, row) => sum + row.amountCents, 0)).toBe(10293865);
  });
});

describe("repairClippedAmounts", () => {
  const row = (over: Partial<DraftPaymentRow>): DraftPaymentRow => ({
    page: 1,
    checkNumber: "1001",
    vendorName: "Someone",
    account: "Supplies",
    fund: "General Fund",
    checkDate: null,
    amountCents: 0,
    clipped: false,
    ...over,
  });

  it("solves for the one clipped line of a cheque", () => {
    const result = repairClippedAmounts(
      [row({ amountCents: 10000 }), row({ amountCents: 500, clipped: true })],
      new Map([["1001", 15050]]),
    );
    expect(result.repaired).toBe(1);
    expect(result.rows[1].amountCents).toBe(5050);
    expect(result.rows[1].repaired).toBe(true);
  });

  it("refuses to guess when two lines of one cheque are clipped", () => {
    const result = repairClippedAmounts(
      [row({ amountCents: 500, clipped: true }), row({ amountCents: 700, clipped: true })],
      new Map([["1001", 15050]]),
    );
    expect(result.repaired).toBe(0);
    expect(result.uncertain).toBe(2);
    expect(result.rows.every((r) => r.uncertain)).toBe(true);
    // The understated figures are left exactly as printed, not adjusted.
    expect(result.rows.map((r) => r.amountCents)).toEqual([500, 700]);
  });

  it("refuses to guess when the cheque printed no total", () => {
    const result = repairClippedAmounts([row({ amountCents: 500, clipped: true })], new Map());
    expect(result.repaired).toBe(0);
    expect(result.uncertain).toBe(1);
  });
});

describe("voided cheques and their reissues", () => {
  it("reads a pair numbered from the short void sequence", () => {
    // These print as two equal and opposite lines, so they net to zero and a
    // register balances either way -- the failure mode is a payee name with
    // the account and fund still glued to the front of it.
    const page =
      "Account Check #   Vendor Name Check Date   Amount Fund " +
      "R & M - Buildings General Fund 12 Stoneway Electric Supply Co. 05/13/2026 $452.37 " +
      "R & M - Buildings General Fund 12 Stoneway Electric Supply Co. 05/13/2026 $(452.37) " +
      "Check Total:   $0.00 Page 4";

    const parsed = parseCheckRegister([{ page: 4, text: page }]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].account).toBe("R & M - Buildings");
    expect(parsed.rows[0].fund).toBe("General Fund");
    expect(parsed.rows[0].checkNumber).toBe("12");
    expect(parsed.rows[0].vendorName).toBe("Stoneway Electric Supply Co.");
    expect(parsed.rows[0].amountCents).toBe(45237);
    expect(parsed.rows[1].amountCents).toBe(-45237);
    expect(parsed.unknownFunds).toEqual([]);
  });
});
