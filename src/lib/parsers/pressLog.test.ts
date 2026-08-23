import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  findMissingCaseNumbers,
  logDateFromTitle,
  parsePressLogList,
  parsePressLogPage,
  parsePressLogText,
} from "./pressLog";

const FIXTURES = join(__dirname, "..", "fixtures");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const BASE = "https://www.ci.moscow.id.us";

describe("parsePressLogText", () => {
  it("extracts every field of a well-formed incident block", () => {
    const incidents = parsePressLogText(
      [
        "26-M06700     Disorderly Conduct",
        "Incident Address: 700 BLK BRENT DR",
        "MOSCOW ID 83843",
        "Disposition: CLO",
        "Time Reported: 05:26",
        "Cad Comments: Group of people in white diesel pickup screaming and yelling.",
        "Taking off now. LSH towards hwy 95.",
      ].join("\n"),
    );

    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toEqual({
      caseNumber: "26-M06700",
      incidentType: "Disorderly Conduct",
      blockAddress: "700 BLK BRENT DR",
      cityLine: "MOSCOW ID 83843",
      disposition: "CLO",
      timeReported: "05:26",
      cadComments:
        "Group of people in white diesel pickup screaming and yelling. Taking off now. LSH towards hwy 95.",
    });
  });

  it("keeps a landmark suffix attached to the address", () => {
    const [incident] = parsePressLogText(
      [
        "26-M06701     Welfare Check",
        "Incident Address: 300 BLK S MAIN ST; by the fountain; FRIENDSHIP SQUARE",
        "MOSCOW ID 83843",
        "Disposition: CLO",
        "Time Reported: 05:38",
        "Cad Comments: Law and EMS responded. No transport.",
      ].join("\n"),
    );

    expect(incident.blockAddress).toBe(
      "300 BLK S MAIN ST; by the fountain; FRIENDSHIP SQUARE",
    );
  });

  it("handles an intersection address with no city line", () => {
    const [incident] = parsePressLogText(
      [
        "26-M06703     Parking Problem",
        "Incident Address: E 1ST ST & N MAIN ST",
        "Disposition: ACT",
        "Time Reported: 06:21",
        "Cad Comments: Officer responded, RT.",
      ].join("\n"),
    );

    expect(incident.blockAddress).toBe("E 1ST ST & N MAIN ST");
    expect(incident.cityLine).toBeNull();
    expect(incident.disposition).toBe("ACT");
  });

  it("tolerates an incident missing optional fields entirely", () => {
    const [incident] = parsePressLogText(
      ["26-M06999     Agency Assistance", "Time Reported: 08:42"].join("\n"),
    );

    expect(incident.caseNumber).toBe("26-M06999");
    expect(incident.incidentType).toBe("Agency Assistance");
    expect(incident.blockAddress).toBeNull();
    expect(incident.disposition).toBeNull();
    expect(incident.cadComments).toBeNull();
    expect(incident.timeReported).toBe("08:42");
  });

  it("does not let one incident's comments bleed into the next", () => {
    const incidents = parsePressLogText(
      [
        "26-M06705     Agency Assistance",
        "Cad Comments: Officer requested case. No report.",
        "",
        "26-M06706     Civil Calls",
        "Incident Address: 1000 BLK PARADISE CREEK ST; THEOPHILUS TOWER",
        "Cad Comments: Officer advised, NR.",
      ].join("\n"),
    );

    expect(incidents).toHaveLength(2);
    expect(incidents[0].cadComments).toBe("Officer requested case. No report.");
    expect(incidents[1].cadComments).toBe("Officer advised, NR.");
    expect(incidents[1].blockAddress).toBe(
      "1000 BLK PARADISE CREEK ST; THEOPHILUS TOWER",
    );
  });

  it("ignores prose that is not an incident block", () => {
    expect(parsePressLogText("No calls for service were logged.")).toEqual([]);
  });
});

describe("findMissingCaseNumbers", () => {
  it("reports gaps in a sequential run", () => {
    expect(
      findMissingCaseNumbers(["26-M06699", "26-M06700", "26-M06703"]),
    ).toEqual(["26-M06701", "26-M06702"]);
  });

  it("reports nothing for a contiguous run", () => {
    expect(
      findMissingCaseNumbers(["26-M06699", "26-M06700", "26-M06701"]),
    ).toEqual([]);
  });

  it("refuses to guess when the span is implausibly wide", () => {
    expect(findMissingCaseNumbers(["26-M00001", "26-M09999"])).toEqual([]);
  });

  it("compares only within a shared prefix", () => {
    expect(findMissingCaseNumbers(["26-M0010", "26-C0010"])).toEqual([]);
  });
});

describe("logDateFromTitle", () => {
  it("reads the date out of a press log title", () => {
    expect(logDateFromTitle("MPD Press Log 08/20/2026")).toBe("2026-08-20");
    expect(logDateFromTitle("MPD Press Log 7/4/2026")).toBe("2026-07-04");
  });

  it("returns null when there is no date", () => {
    expect(logDateFromTitle("MPD Press Log")).toBeNull();
  });
});

describe("parsePressLogPage against the real 08/20/2026 log", () => {
  const parsed = parsePressLogPage(readFixture("press-log-2026-08-20.html"));

  it("reads the title and date", () => {
    expect(parsed.title).toBe("MPD Press Log 08/20/2026");
    expect(parsed.logDate).toBe("2026-08-20");
  });

  it("parses a substantial number of incidents", () => {
    expect(parsed.incidents.length).toBeGreaterThanOrEqual(25);
  });

  it("parses the first incident exactly", () => {
    expect(parsed.incidents[0]).toMatchObject({
      caseNumber: "26-M06699",
      incidentType: "Fraud",
      blockAddress: "1100 BLK E 3RD ST",
      cityLine: "MOSCOW ID 83843",
      disposition: "ACT",
      timeReported: "01:45",
    });
    expect(parsed.incidents[0].cadComments).toContain("Phone scam tonight");
  });

  it("gives every incident a case number and a type", () => {
    for (const incident of parsed.incidents) {
      expect(incident.caseNumber).toMatch(/^\d{2}-[A-Z]{1,3}\d{3,7}$/);
      expect(incident.incidentType.length).toBeGreaterThan(0);
    }
  });

  it("produces unique case numbers", () => {
    const numbers = parsed.incidents.map((i) => i.caseNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("never leaks a field label into a parsed value", () => {
    for (const incident of parsed.incidents) {
      expect(incident.incidentType).not.toMatch(/Incident Address|Disposition/);
      expect(incident.blockAddress ?? "").not.toMatch(/Cad Comments/);
    }
  });

  it("uses only recognised disposition codes", () => {
    for (const incident of parsed.incidents) {
      if (incident.disposition) {
        expect(incident.disposition).toMatch(/^[A-Z]{2,4}$/);
      }
    }
  });
});

describe("parsePressLogList against the real category listing", () => {
  const entries = parsePressLogList(readFixture("newsflash-list-cat23.html"), BASE);

  it("finds many daily logs", () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it("builds absolute URLs and reads each date", () => {
    for (const entry of entries) {
      expect(entry.url).toMatch(
        /^https:\/\/www\.ci\.moscow\.id\.us\/m\/newsflash\/Home\/Detail\/\d+$/,
      );
      expect(entry.title).toContain("Press Log");
      expect(entry.logDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("de-duplicates repeated links to the same article", () => {
    const ids = entries.map((e) => e.detailId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
