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
