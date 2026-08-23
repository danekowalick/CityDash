/**
 * Parser for City of Moscow meeting minutes.
 *
 * Minutes are published as PDFs through CivicClerk. They are written to a
 * consistent house style, but that style varies by body, so the parser
 * recognises four phrasings seen in real minutes:
 *
 *   Council:     "Holmes moved and Blankenship seconded to approve the consent
 *                 agenda. Roll Call Vote: Ayes: Unanimous. Nays: None. Motion carried."
 *   BOA / P&Z:   "Bush moved for approval of the minutes as written, seconded by Dickinson."
 *   Parks:       "Kisha moved to approve the minutes. Heinlein seconded the motion."
 *   BOA (alt):   "Comstock moved to approve the VAR... The motion was seconded by Weldon."
 *
 * Two hazards drove the design:
 *
 *  1. "Motion" appears in ordinary prose -- the P&Z minutes discuss "operating
 *     motion picture theaters". Detection therefore anchors on the verb
 *     "moved", never on the noun "motion", and the outcome must appear inside
 *     the window belonging to a specific motion.
 *
 *  2. Only some bodies record a vote tally. Council and Transportation print
 *     one; Board of Adjustment, Planning & Zoning, and Parks usually just say
 *     "Motion carried." A missing tally is normal, not a parse failure, and is
 *     represented as null rather than invented.
 */

export type MotionOutcome = "carried" | "failed" | "tabled" | "withdrawn" | "unknown";

export interface MotionVote {
  /** Verbatim text after "Ayes:", e.g. "Unanimous" or "Denison, Mills (2)". */
  ayesRaw: string | null;
  naysRaw: string | null;
  abstentionsRaw: string | null;
  /**
   * Counts, when the minutes actually state them. "Unanimous" names no number
   * and implies no particular attendance, so it yields null rather than a
   * guess.
   */
  ayeCount: number | null;
  nayCount: number | null;
  unanimous: boolean;
}

export interface ParsedMotion {
  sequence: number;
  mover: string | null;
  seconder: string | null;
  /** What was moved, with the leading "to"/"for" trimmed. */
  action: string;
  outcome: MotionOutcome;
  vote: MotionVote | null;
}

export interface ParsedAgendaItem {
  number: number;
  title: string;
  kind: string | null;
}

export interface ParsedMinutes {
  /** True when the PDF carries no text layer -- i.e. it is a scan. */
  isScanned: boolean;
  text: string;
  agendaItems: ParsedAgendaItem[];
  motions: ParsedMotion[];
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Running heads sit mid-sentence once pages are joined, e.g.
 * "Transportation Commission Minutes May 14, 2026 Page 1 of 2".
 */
const MINUTES_RUNNING_HEAD =
  /[A-Z][A-Za-z&' ]{3,60}(?:Minutes|MINUTES)\s+[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}\s+Page\s+\d+\s+of\s+\d+/g;

/**
 * PDF extraction sporadically splits a word across a space -- the real
 * Council minutes contain "Abstenti ons: None", and the code chapters
 * produced "0 7/15/2019". Repairing the handful of keywords the parser keys
 * on is safer than loosening every regex to tolerate arbitrary internal
 * spaces, which would invite false matches elsewhere.
 */
/** Signature blocks at the foot of minutes leak into the last motion. */
const SIGNATURE_RULE = /_{4,}/g;

const BROKEN_KEYWORDS: Array<[RegExp, string]> = [
  [SIGNATURE_RULE, " "],
  [/\bAbstenti\s+ons?\b/gi, "Abstentions"],
  [/\bAbst\s+entions?\b/gi, "Abstentions"],
  [/\bUnani\s+mous\b/gi, "Unanimous"],
  [/\bsecon\s+ded\b/gi, "seconded"],
  [/\bcarri\s+ed\b/gi, "carried"],
];

function repairBrokenKeywords(text: string): string {
  let repaired = text;
  for (const [pattern, replacement] of BROKEN_KEYWORDS) {
    repaired = repaired.replace(pattern, replacement);
  }
  return repaired;
}

export function normaliseMinutesText(pages: string[]): string {
  return repairBrokenKeywords(
    pages
      .join(" ")
      .replace(MINUTES_RUNNING_HEAD, " ")
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * A PDF with no text layer is a scan. Reporting that plainly is far better
 * than reporting a meeting with no recorded decisions, which would be false.
 */
export function looksScanned(pages: string[]): boolean {
  if (pages.length === 0) return true;
  const totalChars = pages.reduce((sum, page) => sum + page.trim().length, 0);
  return totalChars / pages.length < 50;
}

// ---------------------------------------------------------------------------
// Agenda items
// ---------------------------------------------------------------------------

const AGENDA_ITEM =
  /\b(\d{1,2})\.\s+([A-Z][^.]{3,110}?)\s*\((ACTION ITEM|PUBLIC HEARING|INFORMATION(?:AL)?(?: ITEM)?|DISCUSSION(?: ITEM)?|CONSENT(?: AGENDA)?)[^)]{0,30}\)/gi;

export function parseAgendaItems(text: string): ParsedAgendaItem[] {
  const items = new Map<number, ParsedAgendaItem>();

  AGENDA_ITEM.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AGENDA_ITEM.exec(text)) !== null) {
    const number = Number(m[1]);
    if (items.has(number)) continue;
    items.set(number, {
      number,
      title: m[2].replace(/\s+/g, " ").trim(),
      kind: m[3].toUpperCase().replace(/\s+/g, " ").trim(),
    });
  }

  return [...items.values()].sort((a, b) => a.number - b.number);
}

// ---------------------------------------------------------------------------
// Motions
// ---------------------------------------------------------------------------

/** A surname followed by the verb. This anchors motion detection. */
const MOVED = /\b([A-Z][A-Za-z'’-]{1,24})\s+moved\b/g;

/**
 * Words that can precede "moved" without naming anybody. The minutes really
 * do write "He moved to approve the expenditure..." after naming someone in
 * an earlier sentence. Recording "He" as a member's name would attribute a
 * vote to a person who does not exist, so these yield a null mover and the
 * motion is kept without one.
 */
const NOT_A_NAME = new Set([
  "he", "she", "they", "it", "we", "i", "you",
  "the", "this", "that", "there", "then", "who", "which",
  "staff", "council", "commission", "committee", "board", "city",
  "motion", "vote", "after", "before", "having", "following", "later",
  "members", "member", "applicant", "public", "meeting",
]);

function moverName(raw: string): string | null {
  return NOT_A_NAME.has(raw.toLowerCase()) ? null : raw;
}

/** How far after "moved" a motion's own outcome may appear. */
const MOTION_WINDOW = 900;

const SECONDER_PATTERNS: RegExp[] = [
  // "moved and Blankenship seconded"
  /^\s*and\s+([A-Z][A-Za-z'’-]{1,24})\s+seconded\b/,
  // "moved, Kelly seconded, to adjourn" -- the comma form, which the Council
  // uses often enough that missing it garbled one motion in eight.
  /^\s*,\s*([A-Z][A-Za-z'’-]{1,24})\s+seconded\b/,
  // "..., seconded by Dickinson"
  /,?\s*seconded\s+by\s+([A-Z][A-Za-z'’-]{1,24})/,
  // "The motion was seconded by Weldon"
  /\.\s*The\s+motion\s+was\s+seconded\s+by\s+([A-Z][A-Za-z'’-]{1,24})/,
  // "Heinlein seconded the motion"
  /\.\s*([A-Z][A-Za-z'’-]{1,24})\s+seconded\s+the\s+motion/,
  // "McCetich seconded." -- the bare form, which Council and Parks both use
  // and which is by far the most common in practice.
  /\.\s*([A-Z][A-Za-z'’-]{1,24})\s+seconded\b/,
  // The same with no sentence break at all: "...by summary Davis seconded."
  // Last resort, so the better-anchored patterns above win when they apply.
  /\s([A-Z][A-Za-z'’-]{1,24})\s+seconded\b/,
];

const OUTCOME_PATTERN =
  /\bMotion\s+(carried|passed|failed|died|tabled|withdrawn)\b|\bmotion\s+(?:was\s+)?(withdrawn|tabled)\b/i;

function readOutcome(window: string): MotionOutcome {
  const m = OUTCOME_PATTERN.exec(window);
  if (!m) return "unknown";
  const word = (m[1] ?? m[2] ?? "").toLowerCase();
  if (word === "carried" || word === "passed") return "carried";
  if (word === "failed" || word === "died") return "failed";
  if (word === "tabled") return "tabled";
  if (word === "withdrawn") return "withdrawn";
  return "unknown";
}

/** Count "Denison, Hamilton, Mills (3)" or a bare "(5)"; null if unstated. */
function readVoteCount(raw: string | null): number | null {
  if (!raw) return null;
  const parenthesised = /\((\d{1,2})\)/.exec(raw);
  if (parenthesised) return Number(parenthesised[1]);
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "none" || trimmed === "0") return 0;
  return null;
}

function readVote(window: string): MotionVote | null {
  const ayes = /\bAyes?\s*:\s*([^.]{0,120}?)\s*(?:\.|Nays)/i.exec(window);
  const nays = /\bNays?\s*:\s*([^.]{0,120}?)\s*(?:\.|Abstentions|Absent)/i.exec(window);
  const abstentions = /\bAbstentions?\s*:\s*([^.]{0,120}?)\s*(?:\.|Motion|Absent)/i.exec(window);

  if (!ayes && !nays) return null;

  const ayesRaw = ayes ? ayes[1].trim() : null;
  const naysRaw = nays ? nays[1].trim() : null;

  return {
    ayesRaw,
    naysRaw,
    abstentionsRaw: abstentions ? abstentions[1].trim() : null,
    ayeCount: readVoteCount(ayesRaw),
    nayCount: readVoteCount(naysRaw),
    unanimous: /unanimous/i.test(ayesRaw ?? ""),
  };
}

/** Trim the action text at whichever clause ends it first. */
const ACTION_TERMINATORS: RegExp[] = [
  /,?\s*seconded\s+by\s+/i,
  /\.\s*The\s+motion\s+was\s+seconded/i,
  /\.\s*[A-Z][A-Za-z'’-]{1,24}\s+seconded\b/,
  // The same clause without the sentence break: "...by summary Davis
  // seconded." Minutes are not consistently punctuated, and without this the
  // seconder's name runs on into the text of the motion.
  /\s+[A-Z][A-Za-z'’-]{1,24}\s+seconded\b/,
  /\.\s*Roll\s*Call/i,
  /\bVote\s+by\s+Acclamation/i,
  /\bRoll\s*Call\s*Vote/i,
  /\.\s*Motion\s+(?:carried|passed|failed|died)/i,
  /\bAyes?\s*:/i,
];

function readAction(afterMoved: string): string {
  // A seconder clause can come *before* the action ("moved and Blankenship
  // seconded to approve...") or *after* it ("...by summary Davis seconded").
  // Strip the leading form first, so the terminators below only ever see a
  // trailing one -- otherwise the terminator matches the leading clause and
  // truncates the motion to nothing.
  let body = afterMoved
    .replace(/^[\s,]*(?:and\s+)?[A-Z][A-Za-z'’-]{1,24}\s+seconded\s*,?\s*/, "")
    // "moved, seconded and mutually agreed upon to adjourn" -- seconded by
    // the room rather than a named member, so there is no name to strip.
    .replace(/^[\s,]*seconded(?:\s+and\s+mutually\s+agreed(?:\s+upon)?)?\s*,?\s*/i, "");

  let end = body.length;
  for (const terminator of ACTION_TERMINATORS) {
    const m = terminator.exec(body);
    if (m && m.index < end) end = m.index;
  }

  let action = body.slice(0, end).trim();
  // Normalise the lead-in verb.
  action = action.replace(/^(?:to|for)\s+/i, "");
  // Stop at the first sentence end if the motion ran on into narration.
  const sentenceEnd = /\.\s+[A-Z]/.exec(action);
  if (sentenceEnd) action = action.slice(0, sentenceEnd.index);

  return action
    .replace(/\s+/g, " ")
    // "accept the minutes, and" -- the conjunction that joined the seconder
    // clause is left dangling once that clause is cut away.
    .replace(/[,;]?\s*\b(?:and|but|then|which)\s*$/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function parseMotions(text: string): ParsedMotion[] {
  const motions: ParsedMotion[] = [];

  MOVED.lastIndex = 0;
  let m: RegExpExecArray | null;
  const heads: Array<{ mover: string; index: number; afterIndex: number }> = [];
  while ((m = MOVED.exec(text)) !== null) {
    heads.push({ mover: m[1], index: m.index, afterIndex: m.index + m[0].length });
  }

  heads.forEach((head, i) => {
    const nextStart = i + 1 < heads.length ? heads[i + 1].index : text.length;
    const window = text.slice(head.afterIndex, Math.min(nextStart, head.afterIndex + MOTION_WINDOW));

    let seconder: string | null = null;
    for (const pattern of SECONDER_PATTERNS) {
      const found = pattern.exec(window);
      if (found) {
        seconder = found[1];
        break;
      }
    }

    const action = readAction(window);
    // A motion with no discernible action is narration that happened to use
    // the word "moved" ("the applicant moved out of state"). Skip it.
    if (action.length < 4) return;

    motions.push({
      sequence: motions.length + 1,
      mover: moverName(head.mover),
      seconder,
      action,
      outcome: readOutcome(window),
      vote: readVote(window),
    });
  });

  return motions;
}

// ---------------------------------------------------------------------------
// References to the city code
// ---------------------------------------------------------------------------

/**
 * Moscow's code has eleven titles. Anything above that is a reference to some
 * other body of law -- the minutes cite "Idaho Code Title 74 Chapter 1" for
 * records retention, which must not be mistaken for a local chapter.
 */
const MAX_CITY_TITLE = 11;

/** "Title 4, Chapters 1,3, 4, and 6" and "Title 10, Chapter 1". */
const TITLE_CHAPTERS =
  /Title\s+(\d{1,3})\s*,?\s*Chapters?\s+([\d\s,and]+?)(?=[.;:)]|\s+(?:Regarding|of|for|and\s+[A-Z])|$)/gi;

/** "Moscow City Code 4-3-4" -- title, chapter, section. */
const CODE_SECTION_REF = /City\s+Code\s+(\d{1,2})\s*-\s*(\d{1,2})(?:\s*-\s*(\d{1,3}))?/gi;

export interface CodeReference {
  /** Chapter slug, matching code_chapters.slug -- "title-04/chapter-03". */
  slug: string;
  titleNumber: number;
  chapterNumber: number;
}

function slugFor(title: number, chapter: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return "title-" + pad(title) + "/chapter-" + pad(chapter);
}

/**
 * Find the code chapters a document says it amends.
 *
 * This is the link from a council decision to the law it changed. It is
 * deliberately conservative: a reference must name a title within Moscow's
 * range, and "Idaho Code Title 74" is excluded by that alone.
 */
export function parseCodeReferences(text: string): CodeReference[] {
  const found = new Map<string, CodeReference>();

  const add = (title: number, chapter: number) => {
    if (!Number.isFinite(title) || !Number.isFinite(chapter)) return;
    if (title < 1 || title > MAX_CITY_TITLE) return;
    if (chapter < 1 || chapter > 99) return;
    const slug = slugFor(title, chapter);
    if (!found.has(slug)) {
      found.set(slug, { slug, titleNumber: title, chapterNumber: chapter });
    }
  };

  TITLE_CHAPTERS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TITLE_CHAPTERS.exec(text)) !== null) {
    const title = Number(m[1]);
    // "1,3, 4, and 6" -> [1, 3, 4, 6]
    for (const piece of m[2].split(/[,\s]+|\band\b/i)) {
      const chapter = Number(piece.trim());
      if (piece.trim() !== "" && Number.isFinite(chapter)) add(title, chapter);
    }
  }

  CODE_SECTION_REF.lastIndex = 0;
  while ((m = CODE_SECTION_REF.exec(text)) !== null) {
    add(Number(m[1]), Number(m[2]));
  }

  return [...found.values()].sort((a, b) =>
    a.titleNumber - b.titleNumber || a.chapterNumber - b.chapterNumber,
  );
}

export function parseMinutes(pages: string[]): ParsedMinutes {
  if (looksScanned(pages)) {
    return { isScanned: true, text: "", agendaItems: [], motions: [] };
  }

  const text = normaliseMinutesText(pages);
  return {
    isScanned: false,
    text,
    agendaItems: parseAgendaItems(text),
    motions: parseMotions(text),
  };
}
