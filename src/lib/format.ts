/**
 * Display formatting. Everything is rendered in Moscow's own time zone
 * regardless of where the reader or the server sits -- a council meeting is
 * at 7pm Moscow time, not 7pm wherever Vercel happened to run the request.
 *
 * Every absolute date carries its year. This site holds meetings back to 2020
 * and ordinances to 2000, and they are read long after the fact: "Mon, Jul 20"
 * stops being unambiguous the moment a second July is on the page. Only
 * relativeTime is exempt, since "in 3 days" is anchored by definition.
 */

export const CITY_TIME_ZONE = "America/Los_Angeles";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CITY_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CITY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CITY_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * A DATE column comes back from pg as a Date at local midnight. Reformatting
 * it through a time zone would shift it a day, so render the calendar date
 * as stored.
 */
export function formatCalendarDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** "Aug 7, 2026" for a calendar DATE column, without time-zone shifting. */
export function formatLogDayLabel(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDate(value: Date | string): string {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatShortDate(value: Date | string): string {
  return shortDateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/** "05:26:00" -> "5:26 am". Postgres TIME values arrive as strings. */
export function formatClockTime(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const hours = Number(m[1]);
  const suffix = hours < 12 ? "am" : "pm";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return display + ":" + m[2] + " " + suffix;
}

/** "in 3 days", "2 hours ago". Coarse on purpose. */
export function relativeTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const deltaMs = date.getTime() - Date.now();
  const absMinutes = Math.abs(deltaMs) / 60000;

  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (absMinutes < 60) return rtf.format(Math.round(deltaMs / 60000), "minute");
  if (absMinutes < 60 * 24) return rtf.format(Math.round(deltaMs / 3600000), "hour");
  if (absMinutes < 60 * 24 * 30) return rtf.format(Math.round(deltaMs / 86400000), "day");
  return rtf.format(Math.round(deltaMs / (86400000 * 30)), "month");
}

/** "1 incident" / "2 incidents". */
export function pluralise(count: number, singular: string, plural?: string): string {
  return count + " " + (count === 1 ? singular : (plural ?? singular + "s"));
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Money is stored and passed around as whole cents.
 *
 * Amounts come off a printed register where every figure has exactly two
 * decimal places, so cents are exact and integers keep them that way -- a
 * float would start disagreeing with the city's own printed total, which is
 * the one number we check ourselves against. Postgres hands BIGINT back as a
 * string, so both forms are accepted.
 *
 * A refund is shown in parentheses, the way the register itself prints it.
 */
export function formatMoneyCents(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const cents = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(cents)) return "—";
  const formatted = moneyFormatter.format(Math.abs(cents) / 100);
  return cents < 0 ? "(" + formatted + ")" : formatted;
}

/** "$2.4M", "$395K", "$603" -- for stat tiles, where precision is noise. */
export function formatMoneyShort(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const cents = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(cents)) return "—";
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (dollars >= 1_000_000) return sign + "$" + (dollars / 1_000_000).toFixed(1) + "M";
  if (dollars >= 1_000) return sign + "$" + Math.round(dollars / 1_000) + "K";
  return sign + "$" + Math.round(dollars);
}

/**
 * Moscow PD disposition codes, expanded. The published logs use the codes
 * bare; a reader should never have to guess what "ACT" means.
 *
 * Unrecognised codes are shown as-is rather than mislabelled -- if MPD adds a
 * code we do not know, saying so is better than inventing a meaning.
 */
const DISPOSITIONS: Record<string, string> = {
  ACT: "Active",
  CLO: "Closed",
  INA: "Inactive",
  UNF: "Unfounded",
  ARR: "Arrest made",
  CIT: "Citation issued",
  RPT: "Report taken",
  CAN: "Cancelled",
  ASST: "Assisted",
};

export function describeDisposition(code: string | null): string | null {
  if (!code) return null;
  return DISPOSITIONS[code.toUpperCase()] ?? null;
}

export function knownDispositions(): Array<{ code: string; meaning: string }> {
  return Object.entries(DISPOSITIONS).map(([code, meaning]) => ({ code, meaning }));
}
