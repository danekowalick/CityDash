/**
 * The source registry.
 *
 * Every feed the site ingests is declared here, including the terms review
 * that justifies scraping it. `termsNote` is not decoration: no scraper ships
 * without a human having read the publisher's terms and written down what
 * they found. It is rendered on the public /sources page.
 */

export interface SourceDefinition {
  id: string;
  name: string;
  url: string;
  kind: "api" | "rss" | "scrape" | "file";
  cadence: string;
  publisher: string;
  termsNote: string;
  enabled: boolean;
}

export const SOURCES: SourceDefinition[] = [
  {
    id: "mpd-press-logs",
    name: "MPD Daily Press Logs",
    url: "https://www.ci.moscow.id.us/m/newsflash?cat=23",
    kind: "scrape",
    cadence: "daily",
    publisher: "Moscow Police Department",
    termsNote:
      "Published by the City of Moscow as a public daily activity log under News Flash " +
      "category 23. No login or paywall. Fetched once daily at a 1s/request floor, " +
      "honouring robots.txt. Only the published block-level address is stored; the log " +
      "contains no names. These are calls for service, not charges or convictions.",
    enabled: true,
  },
  {
    id: "civicclerk-meetings",
    name: "City of Moscow Public Meetings",
    url: "https://moscowid.api.civicclerk.com/v1/Events",
    kind: "api",
    cadence: "hourly",
    publisher: "City of Moscow (CivicClerk portal)",
    termsNote:
      "Public OData endpoint backing the City's own public meetings portal. Serves the " +
      "same records the portal shows anonymously. We window by date and follow the " +
      "API's own pagination, so we pull the period we need rather than enumerating " +
      "the whole archive.",
    enabled: true,
  },
  {
    id: "meeting-minutes",
    name: "Meeting Minutes & Outcomes",
    url: "https://moscowid.portal.civicclerk.com/",
    kind: "scrape",
    cadence: "daily",
    publisher: "City of Moscow (CivicClerk portal)",
    termsNote:
      "Minutes are the official public record of what each body decided, published " +
      "without login through the City's own portal. We read the same PDFs the portal " +
      "serves anonymously, extract motions and votes, and link every motion back to the " +
      "minutes document. Some minutes are scanned images with no text layer; those are " +
      "marked unreadable rather than reported as meetings with no decisions.",
    enabled: true,
  },
  {
    id: "agenda-packets",
    name: "Agenda Packets & Spending",
    url: "https://moscowid.portal.civicclerk.com/",
    kind: "scrape",
    cadence: "daily",
    publisher: "City of Moscow (CivicClerk portal)",
    termsNote:
      "The packet is the meeting material the City publishes alongside each agenda, served " +
      "without login through its own portal. We read the same PDF the portal serves " +
      "anonymously and store only extracted text, never the file. What we keep is the parts " +
      "a reader can act on -- the agenda, the check register, the disbursement report and " +
      "each staff report; the contracts and engineering specifications bound in behind them " +
      "are left as page references back to the City's own PDF. The register lists payments " +
      "submitted to Council for approval, which is not the same thing as money already " +
      "spent, and our reading of it is published alongside the total the City printed on it " +
      "so the two can be compared.",
    enabled: true,
  },
  {
    id: "latah-gis",
    name: "Latah County GIS — Zoning & Land Use",
    url: "https://gis.latah.id.us/arcgis/rest/services",
    kind: "api",
    cadence: "weekly",
    publisher: "Latah County",
    termsNote:
      "An open, unauthenticated ArcGIS REST server the county publishes for public use. " +
      "We read only the zoning districts and the land use application layer, without " +
      "geometry, in paged requests. Applicant names come from public land use " +
      "proceedings, which the county itself publishes. No sale prices exist in any of " +
      "this: Idaho does not require them to be reported.",
    enabled: true,
  },
  {
    id: "city-code",
    name: "Moscow City Code",
    url: "https://www.ci.moscow.id.us/393/City-Code",
    kind: "scrape",
    cadence: "weekly",
    publisher: "City of Moscow",
    termsNote:
      "The city publishes its municipal code as free public PDFs, one per chapter, with " +
      "no login or paywall -- publication is the point. We fetch each chapter at a " +
      "1s/request floor honouring robots.txt, and only re-process a chapter when its " +
      "published bytes change. We store extracted text to show what language changed, " +
      "and always link back to the city's own PDF as the authoritative version.",
    enabled: true,
  },
  {
    id: "city-news-rss",
    name: "City of Moscow News, Alerts & Calendar",
    url: "https://www.ci.moscow.id.us/RSSFeed.aspx?ModID=76&CID=All",
    kind: "rss",
    cadence: "hourly",
    publisher: "City of Moscow",
    termsNote:
      "Syndication feeds the City publishes for exactly this purpose -- the alert feed " +
      "and the calendar feed. Titles, dates, links, and the City's own one-line " +
      "descriptions only; we link back rather than reproducing its pages.",
    enabled: true,
  },
];

export function sourceById(id: string): SourceDefinition | undefined {
  return SOURCES.find((source) => source.id === id);
}
