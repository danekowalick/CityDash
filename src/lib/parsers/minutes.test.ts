import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractPdfText } from "../pdf";
import {
  looksScanned,
  normaliseMinutesText,
  parseAgendaItems,
  parseCodeReferences,
  parseMinutes,
  parseMotions,
} from "./minutes";

const FIXTURES = join(__dirname, "..", "fixtures");
const readBytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

async function loadMinutes(name: string) {
  const { pages } = await extractPdfText(readBytes(name));
  return parseMinutes(pages);
}

describe("parseMotions -- the four house styles", () => {
  it("reads the Council form: 'X moved and Y seconded to ...'", () => {
    const [motion] = parseMotions(
      "Holmes moved and Blankenship seconded to approve the consent agenda as presented. " +
        "Roll Call Vote: Ayes: Unanimous. Nays: None. Abstentions: None. Motion carried.",
    );
    expect(motion.mover).toBe("Holmes");
    expect(motion.seconder).toBe("Blankenship");
    expect(motion.action).toBe("approve the consent agenda as presented");
    expect(motion.outcome).toBe("carried");
    expect(motion.vote?.unanimous).toBe(true);
    expect(motion.vote?.nayCount).toBe(0);
  });

  it("reads the Board of Adjustment form: '..., seconded by Y'", () => {
    const [motion] = parseMotions(
      "Bush moved for approval of the minutes as written, seconded by Dickinson. Motion carried.",
    );
    expect(motion.mover).toBe("Bush");
    expect(motion.seconder).toBe("Dickinson");
    expect(motion.action).toBe("approval of the minutes as written");
    expect(motion.outcome).toBe("carried");
    expect(motion.vote).toBeNull();
  });

  it("reads the Parks form: 'Y seconded the motion.'", () => {
    const [motion] = parseMotions(
      "Kisha moved to approve the minutes. Heinlein seconded the motion. Motion carried.",
    );
    expect(motion.mover).toBe("Kisha");
    expect(motion.seconder).toBe("Heinlein");
    expect(motion.action).toBe("approve the minutes");
  });

  it("reads the alternate form: 'The motion was seconded by Y.'", () => {
    const [motion] = parseMotions(
      "Comstock moved to approve the VAR at 102 N Lilly Street, with no conditions. " +
        "The motion was seconded by Weldon. Motion carried.",
    );
    expect(motion.mover).toBe("Comstock");
    expect(motion.seconder).toBe("Weldon");
    expect(motion.action).toContain("approve the VAR at 102 N Lilly Street");
  });
});

describe("parseMotions -- votes", () => {
  it("reads a named roll call with a count", () => {
    const [motion] = parseMotions(
      "Hamilton moved to recommend approval, seconded by Mills. " +
        "Vote: Ayes: Denison, Hamilton, McGahan, Mills, Tucker (5). Nays: None. Motion carried.",
    );
    expect(motion.vote?.ayeCount).toBe(5);
    expect(motion.vote?.ayesRaw).toContain("Denison");
    expect(motion.vote?.unanimous).toBe(false);
    expect(motion.vote?.nayCount).toBe(0);
  });

  it("does not invent a count for 'Unanimous'", () => {
    // "Unanimous" states no number and implies no particular attendance.
    const [motion] = parseMotions(
      "Holmes moved and Smith seconded to adjourn. Roll Call Vote: Ayes: Unanimous. Nays: None. Motion carried.",
    );
    expect(motion.vote?.unanimous).toBe(true);
    expect(motion.vote?.ayeCount).toBeNull();
  });

  it("records a failed motion", () => {
    const [motion] = parseMotions(
      "Scott moved to deny the application, seconded by Beebe. Ayes: Scott (1). Nays: Beebe, Seever (2). Motion failed.",
    );
    expect(motion.outcome).toBe("failed");
    expect(motion.vote?.ayeCount).toBe(1);
    expect(motion.vote?.nayCount).toBe(2);
  });

  it("leaves the vote null when the body records no tally", () => {
    const [motion] = parseMotions("Seever moved for approval, seconded by Beebe. Motion carried.");
    expect(motion.vote).toBeNull();
  });
});

describe("parseMotions -- false positives", () => {
  it("does not treat 'motion picture' prose as a motion outcome", () => {
    // Real text from the Planning & Zoning minutes.
    const text =
      "Establishments primarily engaged in operating motion picture theaters (except drive-ins) " +
      "and/or exhibiting motion pictures or videos at film festivals, and so forth.";
    expect(parseMotions(text)).toEqual([]);
  });

  it("ignores narration that merely uses the word 'moved'", () => {
    expect(parseMotions("Staff reported that the applicant moved.")).toEqual([]);
  });

  it("does not let one motion's outcome attach to the next", () => {
    const motions = parseMotions(
      "Bush moved to approve item one, seconded by Dickinson. Motion carried. " +
        "Later, Weldon moved to approve item two, seconded by Comstock. Motion failed.",
    );
    expect(motions).toHaveLength(2);
    expect(motions[0].outcome).toBe("carried");
    expect(motions[1].outcome).toBe("failed");
    expect(motions[1].mover).toBe("Weldon");
  });

  it("reports an unknown outcome rather than guessing", () => {
    const [motion] = parseMotions(
      "Bush moved to approve the request, seconded by Dickinson. The discussion continued.",
    );
    expect(motion.outcome).toBe("unknown");
  });
});

describe("parseAgendaItems", () => {
  it("reads numbered items and their kind", () => {
    const items = parseAgendaItems(
      "1. All Consent Items (ACTION ITEM) blah 2. Mayors Appointments (ACTION ITEM) blah " +
        "3. Public Comment (INFORMATION)",
    );
    expect(items.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(items[1].title).toBe("Mayors Appointments");
    expect(items[0].kind).toBe("ACTION ITEM");
  });

  it("de-duplicates an item repeated in the table of contents", () => {
    const items = parseAgendaItems("1. Approval of Minutes (ACTION ITEM) 1. Approval of Minutes (ACTION ITEM)");
    expect(items).toHaveLength(1);
  });
});

describe("looksScanned", () => {
  it("flags a PDF with no text layer", () => {
    expect(looksScanned(["", ""])).toBe(true);
  });

  it("does not flag a normal text PDF", () => {
    expect(looksScanned(["a".repeat(2000), "b".repeat(2000)])).toBe(false);
  });
});

describe("normaliseMinutesText", () => {
  it("strips a running head that landed mid-sentence", () => {
    const text = normaliseMinutesText([
      "Mills moved to table at the Farmers Market. Transportation Commission Minutes May 14, 2026 Page 1 of 2 Hamilton seconded.",
    ]);
    expect(text).not.toContain("Page 1 of 2");
    expect(text).toContain("Mills moved");
  });
});

describe("against real minutes PDFs", () => {
  it("parses City Council minutes with votes", async () => {
    const parsed = await loadMinutes("minutes-council-2026-07-20.pdf");
    expect(parsed.isScanned).toBe(false);
    expect(parsed.motions.length).toBeGreaterThanOrEqual(2);

    const withVotes = parsed.motions.filter((m) => m.vote !== null);
    expect(withVotes.length).toBeGreaterThanOrEqual(2);
    expect(parsed.agendaItems.length).toBeGreaterThanOrEqual(3);

    // Every motion is seconded and named, except the one the minutes
    // themselves introduce with "He moved to approve the expenditure...".
    // A null mover there is correct; inventing a member called "He" is not.
    const unnamed = parsed.motions.filter((m) => m.mover === null);
    expect(unnamed).toHaveLength(1);
    expect(unnamed[0].action).toContain("approve the expenditure");
    expect(parsed.motions.every((m) => m.seconder !== null)).toBe(true);
  });

  it("parses Board of Adjustment minutes, including a named acclamation vote", () => {
    // Held as extracted text rather than the PDF: the original is 14 MB of
    // embedded exhibit scans, and what this case actually exercises is the
    // "Vote by Acclamation" wording, which is text parsing. PDF extraction
    // itself is covered by the four PDFs in the tests around this one.
    const text = readFileSync(join(FIXTURES, "minutes", "boa.txt"), "utf8");
    const motions = parseMotions(text);

    expect(motions.length).toBeGreaterThanOrEqual(2);
    expect(motions.every((m) => m.seconder !== null)).toBe(true);
    expect(motions.some((m) => m.outcome === "carried")).toBe(true);

    // "Vote by Acclamation; Ayes: Bush, Dickinson, Schutz, Weldon (4)
    //  Nays: None. Abstentions: Comstock (1)."
    const acclamation = motions.find((m) => m.vote?.abstentionsRaw?.includes("Comstock"));
    expect(acclamation).toBeDefined();
    expect(acclamation!.vote?.ayeCount).toBe(4);
  });

  it("parses Planning & Zoning minutes without tripping on 'motion picture'", async () => {
    const parsed = await loadMinutes("minutes/pz.pdf");
    expect(parsed.motions.length).toBeGreaterThanOrEqual(1);
    for (const motion of parsed.motions) {
      expect(motion.action.toLowerCase()).not.toContain("motion picture");
      expect(motion.mover).toMatch(/^[A-Z]/);
    }
  });

  it("parses Transportation minutes including a named roll call", async () => {
    const parsed = await loadMinutes("minutes/trans.pdf");
    expect(parsed.motions.length).toBeGreaterThanOrEqual(2);
    const counted = parsed.motions.filter((m) => m.vote?.ayeCount !== null && m.vote !== null);
    expect(counted.length).toBeGreaterThanOrEqual(1);
  });

  it("parses Parks minutes using the 'seconded the motion' form", async () => {
    const parsed = await loadMinutes("minutes/parks.pdf");
    expect(parsed.motions.length).toBeGreaterThanOrEqual(2);
    expect(parsed.motions.some((m) => m.seconder !== null)).toBe(true);
  });

  it("reports scanned minutes as scanned instead of as an empty meeting", async () => {
    // The Human Rights Commission minutes are a scan with no text layer.
    // Claiming this meeting made no decisions would be false.
    const parsed = await loadMinutes("minutes/hrc.pdf");
    expect(parsed.isScanned).toBe(true);
    expect(parsed.motions).toEqual([]);
  });
});

describe("repairing words broken by PDF extraction", () => {
  it("reads a tally whose label was split mid-word", () => {
    // The real Council minutes render "Abstenti ons: None".
    const [motion] = parseMotions(
      normaliseMinutesText([
        "Davis moved to approve the contract. Holmes seconded. Roll Call Vote: Ayes: Unanimous. Nays: None. Abstenti ons: None. Motion carried.",
      ]),
    );
    expect(motion.vote?.abstentionsRaw).toBe("None");
    expect(motion.outcome).toBe("carried");
  });
});

describe("movers that are not names", () => {
  it("does not record a pronoun as a member's name", () => {
    // The Council minutes really do write "He moved to approve the
    // expenditure..." after naming someone in an earlier sentence.
    const [motion] = parseMotions(
      "He moved to approve the expenditure of $205,904.62. McCetich seconded. Motion carried.",
    );
    expect(motion.mover).toBeNull();
    expect(motion.seconder).toBe("McCetich");
    expect(motion.action).toContain("approve the expenditure");
  });

  it("keeps a real surname", () => {
    const [motion] = parseMotions("Blankenship moved to adjourn. Davis seconded. Motion carried.");
    expect(motion.mover).toBe("Blankenship");
  });

  it("takes the surname, not the title, when both appear", () => {
    const [motion] = parseMotions("Mayor Lewis moved to adjourn. Davis seconded. Motion carried.");
    expect(motion.mover).toBe("Lewis");
  });
});

describe("the bare seconder form", () => {
  it("reads 'McCetich seconded.' without the words 'the motion'", () => {
    const [motion] = parseMotions(
      "Blankenship moved to approve the resolution. Davis seconded. Motion carried.",
    );
    expect(motion.seconder).toBe("Davis");
    expect(motion.action).toBe("approve the resolution");
  });
});

describe("abstentions", () => {
  it("reads a named abstention with its count", () => {
    const [motion] = parseMotions(
      "Bush moved for approval of the minutes as written, seconded by Dickinson. " +
        "Vote by Acclamation; Ayes: Bush, Dickinson, Schutz, Weldon (4) Nays: None. Abstentions: Comstock (1). Motion carried.",
    );
    expect(motion.vote?.ayeCount).toBe(4);
    expect(motion.vote?.abstentionsRaw).toBe("Comstock (1)");
    expect(motion.action).toBe("approval of the minutes as written");
  });
});

describe("parseCodeReferences", () => {
  it("reads a multi-chapter amendment", () => {
    // Verbatim from the 2026-07-06 Council agenda.
    const refs = parseCodeReferences(
      "Ordinance Amending Moscow City Code Title 4, Chapters 1,3, 4, and 6 Regarding Single-Family Dwellings",
    );
    expect(refs.map((r) => r.slug)).toEqual([
      "title-04/chapter-01",
      "title-04/chapter-03",
      "title-04/chapter-04",
      "title-04/chapter-06",
    ]);
  });

  it("reads a single chapter", () => {
    expect(parseCodeReferences("amending Title 10, Chapter 1 of the City Code").map((r) => r.slug))
      .toEqual(["title-10/chapter-01"]);
  });

  it("reads a section citation", () => {
    expect(parseCodeReferences("per Moscow City Code 4-3-4").map((r) => r.slug))
      .toEqual(["title-04/chapter-03"]);
  });

  it("ignores Idaho Code, which is a different body of law", () => {
    // The minutes cite "Idaho Code Title 74 Chapter 1" for records retention.
    // Moscow's code has only eleven titles, so this must not become
    // "title-74/chapter-01".
    expect(parseCodeReferences("the City follows Idaho Code Title 74 Chapter 1 for retention")).toEqual([]);
  });

  it("de-duplicates repeated references", () => {
    const refs = parseCodeReferences("Title 4, Chapter 3 ... and again Title 4, Chapter 3");
    expect(refs).toHaveLength(1);
  });

  it("finds nothing in ordinary prose", () => {
    expect(parseCodeReferences("The Commission discussed the proposal at length.")).toEqual([]);
  });

  it("pads slugs so they match the chapter keys", () => {
    const [ref] = parseCodeReferences("Title 4, Chapter 8");
    expect(ref.slug).toBe("title-04/chapter-08");
    expect(ref.titleNumber).toBe(4);
    expect(ref.chapterNumber).toBe(8);
  });
});

describe("seconder clauses on either side of the action", () => {
  it("does not let a trailing seconder run into the motion text", () => {
    // Real Council wording, with no sentence break before the seconder.
    const [motion] = parseMotions(
      "Blankenship moved to approve the Ordinance under suspension of the rules and that " +
        "it be read by title and published by summary Davis seconded. Roll Call Vote: " +
        "Ayes: Unanimous. Nays: None. Motion carried.",
    );
    expect(motion.mover).toBe("Blankenship");
    expect(motion.seconder).toBe("Davis");
    expect(motion.action).toBe(
      "approve the Ordinance under suspension of the rules and that it be read by title and published by summary",
    );
    expect(motion.action).not.toContain("seconded");
  });

  it("still handles the leading seconder clause", () => {
    // The strip must run before the terminators, or this truncates to nothing.
    const [motion] = parseMotions(
      "Holmes moved and Blankenship seconded to approve the consent agenda. Motion carried.",
    );
    expect(motion.action).toBe("approve the consent agenda");
    expect(motion.seconder).toBe("Blankenship");
  });

  it("handles a motion seconded by the room rather than a member", () => {
    const [motion] = parseMotions(
      "Bettge moved, seconded and mutually agreed upon to adjourn at 9:13 p.m.",
    );
    expect(motion.action).toContain("adjourn");
    expect(motion.action).not.toMatch(/^,/);
  });

  it("strips a signature rule from the trailing motion", () => {
    const text = normaliseMinutesText([
      "Bettge moved to adjourn. ______________________________ Arthur Bettge, Mayor",
    ]);
    expect(text).not.toContain("____");
  });
});

describe("the mid-sentence seconder clause", () => {
  it("reads 'X moved to A, and Y seconded the motion' without a dangling conjunction", () => {
    const [motion] = parseMotions(
      "Bettge moved to accept the minutes, and Hukill seconded the motion. Motion carried.",
    );
    expect(motion.mover).toBe("Bettge");
    expect(motion.seconder).toBe("Hukill");
    expect(motion.action).toBe("accept the minutes");
  });

  it("keeps an 'and' that belongs to the motion itself", () => {
    const [motion] = parseMotions(
      "Comstock moved to approve the permit and direct Staff to draft findings, seconded by Weldon. Motion carried.",
    );
    expect(motion.action).toBe("approve the permit and direct Staff to draft findings");
  });
});
