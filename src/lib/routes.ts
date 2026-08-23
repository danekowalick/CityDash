import type { Route } from "next";

/**
 * typedRoutes checks link targets at compile time, which it cannot do for a
 * path assembled at runtime from database values -- a chapter slug or an
 * ordinance number. This is the one place that assertion is made, so the
 * escape hatch stays visible and searchable instead of being sprinkled
 * through the pages as inline casts.
 */
export function dynamicHref(path: string): Route {
  return path as Route;
}

export const chapterHref = (slug: string) => dynamicHref("/code/" + slug);
export const ordinanceHref = (number: string) => dynamicHref("/code/ordinance/" + number);

/**
 * The sub-path the site is served under, if any -- "/citydash" on Minion2,
 * empty when the site owns the root of its host.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

/**
 * Prefix an internal URL that Next will NOT rewrite for us.
 *
 * next/link and static imports get basePath applied automatically; a plain
 * <a href="/calendar.ics"> does not, and would 404 under a sub-path. Anything
 * reached by a bare anchor -- feeds, downloads -- must go through this.
 */
export function assetHref(path: string): string {
  return BASE_PATH + path;
}
