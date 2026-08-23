import type { NextConfig } from "next";

/**
 * The site can be served either at the root of a domain or under a sub-path,
 * because on Minion2 it sits behind Tailscale Funnel at /citydash while the
 * Backyard Tourney app owns the root of that same hostname.
 *
 * Set NEXT_PUBLIC_BASE_PATH="/citydash" for that deployment; leave it unset
 * for local development and for any host where the site owns the root.
 *
 * next/link and static assets pick this up automatically. A plain <a> to an
 * internal path does NOT -- see assetHref in src/lib/routes.ts.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
