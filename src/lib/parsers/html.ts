/** Minimal HTML helpers shared by the CivicPlus scrapers. */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

export function decodeEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/**
 * Convert a fragment of CivicPlus article HTML into plain text, preserving
 * the line structure. The press log encodes every line as its own <p><span>,
 * so block-level tags become newlines and everything else is stripped.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(withBreaks)
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\r]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Read the value of an attribute out of a single start tag. */
function attributeValue(tag: string, name: string): string | null {
  const pattern = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', "i");
  const m = pattern.exec(tag);
  if (!m) return null;
  return m[2] ?? m[3] ?? null;
}

/**
 * Extract the inner HTML of the first <div> whose class list contains
 * `className`. Counts nested <div> opens and closes so we stop at the
 * matching close tag rather than the first one.
 *
 * Matching on the split class list (rather than a regex over the raw
 * attribute) avoids both escaping hazards and accidental substring hits --
 * "article-content-footer" must not match "article-content".
 */
export function extractDivByClass(html: string, className: string): string | null {
  const openTag = /<div\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = openTag.exec(html)) !== null) {
    const classes = (attributeValue(match[0], "class") ?? "").split(/\s+/);
    if (!classes.includes(className)) continue;

    const start = match.index + match[0].length;
    const tagPattern = /<div\b[^>]*>|<\/div\s*>/gi;
    tagPattern.lastIndex = start;

    let depth = 1;
    let token: RegExpExecArray | null;
    while ((token = tagPattern.exec(html)) !== null) {
      depth += token[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return html.slice(start, token.index);
    }
    return html.slice(start);
  }

  return null;
}
