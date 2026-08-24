import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifyPage,
  parsePacket,
  parseStaffReport,
  readLabelledFields,
  readMajorExpenditurePeriod,
  segmentPages,
} from "./packet";

function loadPages(name: string): string[] {
  const file = join(__dirname, "..", "fixtures", "packets", name + ".pages.json");
  return JSON.parse(readFileSync(file, "utf8")).pages as string[];
}

const council = loadPages("council-2026-08-17");
const pz = loadPages("pz-2026-08-12");
const older = loadPages("council-2026-06-01");

describe("classifyPage", () => {
  it("recognises each kind of page it has an opinion about", () => {
    expect(classifyPage(council[0])).toBe("agenda");
    expect(classifyPage(council[3])).toBe("minutes");
    expect(classifyPage(council[7])).toBe("check_register");
    expect(classifyPage(council[29])).toBe("staff_report");
    expect(classifyPage(council[31])).toBe("disbursement_report");
    expect(classifyPage(council[34])).toBe("major_expenditures");
  });

  it("holds no opinion on an attachment, so the segmenter can carry the previous page forward", () => {
    expect(classifyPage(council[60])).toBeNull();
  });

  it("recognises the different staff report the commissions publish", () => {
    // P&Z and the Board of Adjustment use a prose Community Development form
    // rather than the labelled Council one.
    expect(classifyPage(pz[5])).toBe("staff_report");
  });
});

describe("segmentPages", () => {
  const segments = segmentPages(council);
  const kindsAt = (page: number) => segments.find((s) => page >= s.startPage && page <= s.endPage);

  it("opens with the agenda and the previous meeting's draft minutes", () => {
    expect(segments[0]).toMatchObject({ kind: "agenda", startPage: 1, endPage: 3 });
    expect(segments[1]).toMatchObject({ kind: "minutes", startPage: 4, endPage: 7 });
  });

  it("splits two registers bound back to back", () => {
    // Merging them would compare our sum of both against the printed total of
    // only the first.
    const registers = segments.filter((s) => s.kind === "check_register");
    expect(registers).toHaveLength(2);
    expect(registers[0]).toMatchObject({ startPage: 8, endPage: 27 });
    expect(registers[1]).toMatchObject({ startPage: 28, endPage: 29 });
  });

  it("gives each agenda item its own staff report segment, titled", () => {
    const reports = segments.filter((s) => s.kind === "staff_report");
    expect(reports.length).toBeGreaterThanOrEqual(5);
    expect(reports.map((r) => r.title)).toContain(
      "South HWY 95 Pathway Extension - Bid Results & Contract Award - Luke Hajda",
    );
  });

  it("keeps a two-page staff report together", () => {
    // Its second page has no banner, only a bare "Page 2 of 2".
    expect(kindsAt(204)).toMatchObject({ kind: "staff_report", startPage: 203, endPage: 204 });
  });

  it("treats what is bound in behind a staff report as its attachments", () => {
    expect(kindsAt(100)?.kind).toBe("attachment");
  });

  it("stores no text for attachments or for the duplicated minutes", () => {
    // 150+ pages of contract and specification boilerplate would bury every
    // real search result, and the minutes are already ingested from their own
    // PDF.
    for (const segment of segments) {
      if (segment.kind === "attachment" || segment.kind === "minutes") {
        expect(segment.text).toBeNull();
      } else {
        expect(segment.text).not.toBeNull();
      }
    }
  });
});

describe("readLabelledFields", () => {
  const report = council[57] + " " + council[58];

  it("reads the labelled fields of a Council staff report", () => {
    const fields = readLabelledFields(report);
    expect(fields["AGENDA ITEM TITLE"]).toBe(
      "South HWY 95 Pathway Extension - Bid Results & Contract Award - Luke Hajda",
    );
    expect(fields["RESPONSIBLE STAFF"]).toBe("Luke Hajda, Civil Engineer");
    expect(fields["FISCAL IMPACT"]).toContain("Roadway Improvement Program");
    expect(fields["ATTACHMENTS"]).toContain("Bid Tabulation");
  });

  it("distinguishes a label left blank from a label the form does not have", () => {
    const fields = readLabelledFields(council[202] + " " + council[203]);
    // The FY2027 appropriation ordinance is a $149,942,154 budget and still
    // leaves FISCAL IMPACT empty. Empty is a fact; absent is a different one.
    expect(fields["FISCAL IMPACT"]).toBe("");
    expect(fields["DESCRIPTION"]).toContain("149,942,154");
  });

  it("does not let a missing label swallow the rest of the report", () => {
    const fields = readLabelledFields(report);
    expect(fields["DESCRIPTION"]).not.toContain("PROPOSED ACTIONS");
    expect(fields["RESPONSIBLE STAFF"]?.length).toBeLessThan(80);
  });
});

describe("parseStaffReport", () => {
  it("reads the dollar figures printed in the fiscal impact", () => {
    const parsed = parseStaffReport("FISCAL IMPACT $45,000 from Streets, offset by a $12,000 grant", 1, 1, 1);
    // A list, not a total: adding these together would be an interpretation.
    expect(parsed.fiscalAmountsCents).toEqual([4500000, 1200000]);
    expect(parsed.fiscalMaxCents).toBe(4500000);
  });

  it("records no amount when the field names no money", () => {
    const parsed = parseStaffReport(council[57] + " " + council[58], 1, 58, 59);
    expect(parsed.fiscalAmountsCents).toEqual([]);
    expect(parsed.fiscalMaxCents).toBeNull();
    expect(parsed.reportDate?.toISOString().slice(0, 10)).toBe("2026-08-17");
  });
});

describe("readMajorExpenditurePeriod", () => {
  it("reads the month the report covers", () => {
    // The register covers the fortnight being approved now; this page covers
    // the previous month. Neither subsumes the other.
    expect(readMajorExpenditurePeriod(council[34])?.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
});

describe("parsePacket", () => {
  const parsed = parsePacket(council);

  it("balances every register against the totals the city printed", () => {
    expect(parsed.registers).toHaveLength(2);
    for (const register of parsed.registers) {
      expect(register.checksum.balanced).toBe(true);
      expect(register.checksum.discrepancyCents).toBe(0);
    }
    const rows = parsed.registers.reduce((n, r) => n + r.checksum.rowCount, 0);
    expect(rows).toBe(473);
  });

  it("counts the pages that are photographs separately from the readable ones", () => {
    expect(parsed.pageCount).toBe(301);
    expect(parsed.textPageCount + parsed.imagePageCount).toBe(301);
    expect(parsed.imagePageCount).toBeGreaterThan(0);
    expect(parsed.isScanned).toBe(false);
  });

  it("stores a fraction of the packet, having dropped the boilerplate", () => {
    const raw = council.join(" ").length;
    expect(parsed.text.length).toBeLessThan(raw / 4);
  });

  it("keeps the major expenditures page searchable even though it is not parsed into rows", () => {
    // The outside law firm is on this page and nowhere in this packet's
    // register, so dropping the page entirely would lose it.
    expect(parsed.text).toContain("Moore Elia Kraft & Stacey, LLP");
  });

  it("leaves no fund unrecognised", () => {
    expect(parsed.unknownFunds).toEqual([]);
  });

  it("reads a commission packet that has no register at all", () => {
    // P&Z publishes staff reports and attachments only. No register is how the
    // city publishes it, not a failure.
    const commission = parsePacket(pz);
    expect(commission.registers).toEqual([]);
    expect(commission.segments.length).toBeGreaterThan(0);
    expect(commission.staffReports).toEqual([]);
  });
});

/**
 * Packets before about July 2026 render the register with its columns abutting:
 * "Professional ServicesGeneral Fund116615 Alex Jones06/17/2026 $540.00", with
 * no space between account and fund, fund and cheque number, or payee and date.
 * Two years of history is in that format, so it is not an edge case.
 */
describe("the older register layout, which has no spaces between columns", () => {
  const parsed = parsePacket(older);

  it("still balances against the printed totals", () => {
    expect(parsed.registers).toHaveLength(2);
    for (const register of parsed.registers) {
      expect(register.checksum.balanced).toBe(true);
      expect(register.checksum.pageCount).toBe(register.checksum.declaredPageCount);
    }
  });

  it("separates an account from a fund that is glued to it", () => {
    const row = parsed.registers[0].rows[0];
    expect(row.account).toBe("Department Supplies");
    expect(row.fund).toBe("Recreation & Culture");
    expect(row.checkNumber).toBe("116335");
    expect(row.vendorName).toBe("ALSCO, INC.");
  });

  it("leaves no fund unrecognised", () => {
    expect(parsed.unknownFunds).toEqual([]);
  });
});
