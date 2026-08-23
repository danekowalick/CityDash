/**
 * The single HTTP client every ingestion job uses.
 *
 * Scraping conduct is enforced here rather than left to each job, so a new
 * scraper cannot accidentally be impolite:
 *
 *   - robots.txt is fetched once per host and honoured
 *   - a descriptive User-Agent carries a contact address
 *   - requests to the same host are spaced out, honouring Crawl-delay
 *   - 429 and 5xx responses back off exponentially instead of hammering
 *
 * If a site operator needs us to stop, the User-Agent tells them who to ask.
 */

import { createHash } from "node:crypto";

const DEFAULT_USER_AGENT =
  "CityDashBot/0.1 (+https://example.org/citydash; contact@example.org)";

/** Minimum gap between requests to one host when robots.txt says nothing. */
const DEFAULT_DELAY_MS = 1000;
const MAX_RETRIES = 3;

export function userAgent(): string {
  return process.env.CITYDASH_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

export interface FetchedDocument {
  url: string;
  status: number;
  body: string;
  contentType: string | null;
  contentHash: string;
}

export function hashContent(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

const robotsCache = new Map<string, Promise<RobotsRules>>();

/**
 * Parse robots.txt, collecting the rules that apply to us: the most specific
 * matching group wins, falling back to the wildcard group. A group is a run
 * of User-agent lines followed by its directives.
 */
export function parseRobots(text: string, agentToken: string): RobotsRules {
  const wildcard: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
  const specific: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };

  let appliesToWildcard = false;
  let appliesToUs = false;
  let previousLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // A new group starts only after a run of directives, not between
      // consecutive User-agent lines.
      if (!previousLineWasAgent) {
        appliesToWildcard = false;
        appliesToUs = false;
      }
      const token = value.toLowerCase();
      if (token === "*") appliesToWildcard = true;
      if (token && token !== "*" && agentToken.toLowerCase().includes(token)) {
        appliesToUs = true;
      }
      previousLineWasAgent = true;
      continue;
    }

    previousLineWasAgent = false;
    const targets: RobotsRules[] = [];
    if (appliesToWildcard) targets.push(wildcard);
    if (appliesToUs) targets.push(specific);
    if (targets.length === 0) continue;

    for (const target of targets) {
      if (field === "disallow" && value) target.disallow.push(value);
      else if (field === "allow" && value) target.allow.push(value);
      else if (field === "crawl-delay") {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) {
          target.crawlDelayMs = Math.round(seconds * 1000);
        }
      }
    }
  }

  const hasSpecific =
    specific.disallow.length > 0 ||
    specific.allow.length > 0 ||
    specific.crawlDelayMs !== null;
  return hasSpecific ? specific : wildcard;
}

/** Longest-match wins; an equally specific Allow beats Disallow. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  const matchLength = (patterns: string[]) => {
    let longest = -1;
    for (const pattern of patterns) {
      if (path.startsWith(pattern) && pattern.length > longest) longest = pattern.length;
    }
    return longest;
  };

  const disallowed = matchLength(rules.disallow);
  if (disallowed === -1) return true;
  return matchLength(rules.allow) >= disallowed;
}

async function robotsFor(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const pending = (async (): Promise<RobotsRules> => {
    try {
      const response = await fetch(origin + "/robots.txt", {
        headers: { "User-Agent": userAgent() },
      });
      // No robots.txt, or an error page, means no restrictions stated.
      if (!response.ok) return { disallow: [], allow: [], crawlDelayMs: null };
      return parseRobots(await response.text(), userAgent());
    } catch {
      return { disallow: [], allow: [], crawlDelayMs: null };
    }
  })();

  robotsCache.set(origin, pending);
  return pending;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const lastRequestAt = new Map<string, number>();

async function waitForTurn(origin: string, delayMs: number): Promise<void> {
  const previous = lastRequestAt.get(origin) ?? 0;
  const earliest = previous + delayMs;
  const now = Date.now();
  if (now < earliest) await sleep(earliest - now);
  lastRequestAt.set(origin, Date.now());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super("robots.txt disallows fetching " + url);
    this.name = "RobotsDisallowedError";
  }
}

export interface PoliteFetchOptions {
  /** Override the inter-request gap for this host, in milliseconds. */
  delayMs?: number;
  /** Skip the robots.txt check. Only for fetching robots.txt itself. */
  ignoreRobots?: boolean;
  accept?: string;
}

export async function politeFetch(
  url: string,
  options: PoliteFetchOptions = {},
): Promise<FetchedDocument> {
  const parsed = new URL(url);
  const origin = parsed.origin;

  const rules = options.ignoreRobots
    ? { disallow: [], allow: [], crawlDelayMs: null }
    : await robotsFor(origin);

  if (!options.ignoreRobots && !robotsAllows(rules, parsed.pathname)) {
    throw new RobotsDisallowedError(url);
  }

  const delayMs = Math.max(
    options.delayMs ?? DEFAULT_DELAY_MS,
    rules.crawlDelayMs ?? 0,
  );

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForTurn(origin, delayMs);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent(),
          Accept: options.accept ?? "text/html,application/json;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error("HTTP " + response.status + " for " + url);
        const retryAfter = Number(response.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : delayMs * Math.pow(2, attempt + 1);
        if (attempt < MAX_RETRIES) {
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      const body = await response.text();
      return {
        url: response.url || url,
        status: response.status,
        body,
        contentType: response.headers.get("content-type"),
        contentHash: hashContent(body),
      };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      await sleep(delayMs * Math.pow(2, attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch " + url);
}


export interface FetchedBinary {
  url: string;
  status: number;
  bytes: Uint8Array;
  contentType: string | null;
  contentHash: string;
}

/**
 * Fetch a binary document (the city code chapters are PDFs).
 *
 * The hash is over the raw bytes, because that is the change signal the
 * publisher actually controls -- re-extracting text is our own step and must
 * not be what decides whether something changed.
 */
export async function politeFetchBytes(
  url: string,
  options: PoliteFetchOptions = {},
): Promise<FetchedBinary> {
  const parsed = new URL(url);
  const origin = parsed.origin;

  const rules = options.ignoreRobots
    ? { disallow: [], allow: [], crawlDelayMs: null }
    : await robotsFor(origin);

  if (!options.ignoreRobots && !robotsAllows(rules, parsed.pathname)) {
    throw new RobotsDisallowedError(url);
  }

  const delayMs = Math.max(options.delayMs ?? DEFAULT_DELAY_MS, rules.crawlDelayMs ?? 0);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForTurn(origin, delayMs);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent(),
          Accept: options.accept ?? "application/pdf,*/*;q=0.8",
        },
        redirect: "follow",
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error("HTTP " + response.status + " for " + url);
        if (attempt < MAX_RETRIES) {
          await sleep(delayMs * Math.pow(2, attempt + 1));
          continue;
        }
        throw lastError;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        url: response.url || url,
        status: response.status,
        bytes,
        contentType: response.headers.get("content-type"),
        contentHash: createHash("sha256").update(bytes).digest("hex"),
      };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      await sleep(delayMs * Math.pow(2, attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch " + url);
}

/** Convenience wrapper for endpoints that return JSON. */
export async function politeFetchJson<T = unknown>(
  url: string,
  options: PoliteFetchOptions = {},
): Promise<{ data: T; document: FetchedDocument }> {
  const document = await politeFetch(url, {
    ...options,
    accept: options.accept ?? "application/json",
  });
  return { data: JSON.parse(document.body) as T, document };
}
