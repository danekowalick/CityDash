import Link from "next/link";
import type { Metadata } from "next";

import { SearchBox } from "@/components/SearchBox";
import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, EmptyState, Row, RowList, SectionHeading, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  landUseSearchCount,
  searchLandUse,
  landUseActions,
  landUseByYear,
  landUseKinds,
  propertyStats,
  zoningSummary,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Property & development",
  description:
    "Zoning districts and land use applications for Moscow, Idaho — what is zoned what, and what is being asked for.",
};

/**
 * Expansions for the county's application-type codes.
 *
 * Only codes whose meaning is unambiguous are expanded. The county publishes
 * no legend, and several codes here (CL, ZPP, AP) have no standard planning
 * reading -- so those are shown exactly as published rather than given an
 * invented meaning, the same rule the police disposition codes follow.
 */
const KIND_LABELS: Record<string, string> = {
  CUP: "Conditional Use Permit",
  VAR: "Variance",
  AZP: "Accessory Zoning Permit",
  LUA: "Land Use Application",
  RZ: "Rezone",
  REZ: "Rezone",
  SP: "Short Plat",
  FP: "Final Plat",
  SUB: "Subdivision",
  PUD: "Planned Unit Development",
  ANX: "Annexation",
  CPA: "Comprehensive Plan Amendment",
  SUP: "Special Use Permit",
};

/**
 * Deep link straight to the assessor's detail page for a parcel.
 *
 * The GIS layer carries no address, so the parcel number is the only stable
 * way from one of these records to the property it concerns. The detail page
 * takes the parcel as "p" and renders owner, address, acreage and value
 * history; the "a" account parameter the assessor's own links include is not
 * required. Linking at the search page instead just dumped the reader on an
 * empty form.
 */
function assessorUrl(parcel: string): string {
  return "https://id-latah.publicaccessnow.com/Assessor/PropertySearch/Detail.aspx?p=" +
    encodeURIComponent(parcel);
}

function YearChart({ rows }: { rows: Array<{ year: number; total: string }> }) {
  const peak = Math.max(1, ...rows.map((r) => Number(r.total)));
  return (
    <div className="card p-4">
      <div className="scroll-x">
        <div className="flex min-w-[30rem] items-end gap-2" style={{ height: "7rem" }}>
          {rows.map((row) => {
            const total = Number(row.total);
            return (
              <div key={row.year} className="flex flex-1 flex-col items-center gap-1">
                <span className="faint mono text-[0.625rem]">{total}</span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: Math.max(2, Math.round((total / peak) * 100)) + "%",
                    background: "var(--accent)",
                    opacity: 0.85,
                  }}
                  title={total + " applications in " + row.year}
                />
                <span className="faint mono text-[0.625rem]">
                  {String(row.year).slice(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="faint mt-2 text-xs">
        Land use applications by year of decision. Peak: {peak}.
      </p>
    </div>
  );
}

export default async function PropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const { kind, q } = await searchParams;
  const term = (q ?? "").trim();
  const searching = term.length > 0;

  // A search looks across every application; the type chips narrow the
  // ordinary browse. Mixing the two silently would make results confusing,
  // so a search takes precedence and the chips step aside.
  const [zoning, actions, kinds, byYear, stats, hitCount] = await Promise.all([
    zoningSummary(),
    searching ? searchLandUse(term, 80) : landUseActions(60, kind),
    landUseKinds(),
    landUseByYear(12),
    propertyStats(),
    searching ? landUseSearchCount(term) : Promise.resolve(null),
  ]);

  const totalHits = hitCount?.rows[0] ? Number(hitCount.rows[0].total) : undefined;

  const totals = stats.rows[0] ?? null;

  const sections: NavSection[] = [
    { id: "prices", label: "About sale prices" },
    { id: "applications", label: "Land use applications", count: actions.rows.length },
    { id: "trend", label: "Applications by year" },
    { id: "zoning", label: "Zoning", count: zoning.rows.length },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">Property</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          How land is zoned, and what is being asked of it
        </h1>
        <p className="muted mt-2 max-w-prose">
          Conditional use permits, variances, rezones, and accessory permits from Latah
          County&rsquo;s public GIS — alongside the zoning districts they apply within.
        </p>
      </section>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Land use applications"
            value={Number(totals.land_use_actions).toLocaleString("en-US")}
            detail="on record"
          />
          <Stat label="Zoning districts" value={totals.zoning_districts} detail={zoning.rows.length + " classes"} />
          <Stat
            label="Most recent"
            value={totals.latest_action ? formatDate(totals.latest_action).replace(/^\w+,\s/, "") : "—"}
            detail="last decision on record"
          />
          <Stat
            label="Sale prices"
            value={<span className="text-base">None</span>}
            detail="not public in Idaho"
          />
        </div>
      ) : null}

      <SearchBox
        action="/property"
        label="Search land use applications"
        placeholder="Search applications — e.g. solar, setback, CUP26-018, a parcel or an applicant"
        value={term || undefined}
        resultCount={totalHits}
      />

      <WithSectionNav sections={sections}>
        <div className="space-y-10">
          <section
            id="prices"
            className="card p-5 text-sm"
            style={{ background: "var(--opinion)" }}
          >
            <h2 className="font-semibold">Why there are no sale prices here</h2>
            <p className="muted mt-2 max-w-prose">
              Idaho is a <strong>non-disclosure state</strong>. Buyers and sellers are not
              required to report what a property sold for to the county recorder or
              assessor, and that figure is not part of the public record. No amount of
              engineering changes that, and this site will not print a number it cannot
              source.
            </p>
            <p className="muted mt-2 max-w-prose">
              What is genuinely public is shown instead: how land is zoned, and every
              application made to use or change it. For prices, a licensed agent with MLS
              access is the honest answer.
            </p>
          </section>

          <section id="applications">
            <SectionHeading
              title={searching ? "Matching applications" : "Land use applications"}
              hint={
                searching
                  ? "Searching case numbers, descriptions, applicants and parcels."
                  : "Each one is a request to do something with a piece of land, decided in public."
              }
            />

            {kinds.rows.length > 0 && !searching ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <Link
                  href="/property"
                  scroll={false}
                  className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
                  style={
                    kind ? undefined : { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                  }
                >
                  All
                </Link>
                {kinds.rows.slice(0, 10).map((row) => {
                  const active = row.kind === kind;
                  return (
                    <Link
                      key={row.kind}
                      href={active ? "/property" : { pathname: "/property", query: { kind: row.kind } }}
                      scroll={false}
                      className="card px-2.5 py-1 text-sm transition-colors hover:border-[var(--accent)]"
                      style={
                        active
                          ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                          : undefined
                      }
                      title={KIND_LABELS[row.kind] ?? row.kind}
                    >
                      {KIND_LABELS[row.kind] ?? row.kind}
                      <span className="faint mono ml-1.5">{row.total}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {actions.rows.length === 0 ? (
              <EmptyState
                error={actions.error}
                emptyMessage={
                  searching
                    ? "Nothing matches “" + term + "”."
                    : "No land use applications have been ingested yet."
                }
                hint={
                  searching
                    ? "Search covers the case number, the description, the applicant and the parcel."
                    : "Run npm run ingest:property to pull the county GIS layers."
                }
              />
            ) : (
              <RowList>
                {actions.rows.map((item) => (
                  <Row key={item.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <span className="font-medium">{item.action ?? "Application"}</span>
                        {item.label ? (
                          <span className="faint mono ml-2 text-xs">{item.label}</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.kind ? <Badge>{KIND_LABELS[item.kind] ?? item.kind}</Badge> : null}
                        <span className="faint mono text-xs">
                          {item.decided_on ? formatDate(item.decided_on) : "date not recorded"}
                        </span>
                      </div>
                    </div>
                    {item.applicant ? (
                      <p className="muted mt-0.5 text-sm">Applicant: {item.applicant}</p>
                    ) : null}
                    <p className="faint mt-1 text-xs">
                      {item.parcel ? (
                        <a
                          href={assessorUrl(item.parcel)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-underline"
                        >
                          Parcel {item.parcel}
                        </a>
                      ) : (
                        <span>No parcel recorded</span>
                      )}
                    </p>
                  </Row>
                ))}
              </RowList>
            )}

            <p className="faint mt-2 text-xs">
              {totals && Number(totals.undated) > 0 ? (
                <>
                  {totals.undated} records carry an impossible date in the county data
                  (one reads 2055); those are shown as undated rather than given a wrong
                  year.{" "}
                </>
              ) : null}
              The county publishes no legend for its type codes, so codes with no
              unambiguous reading are shown exactly as published.
            </p>

            {/*
              The county GIS gives a case label, a parcel and a one-line action --
              no documents and no address. Saying plainly where the rest lives is
              more use than a row that dead-ends.
            */}
            <div
              className="card mt-4 p-4 text-sm"
              style={{ background: "var(--opinion)" }}
            >
              <h3 className="font-semibold">Following one of these further</h3>
              <p className="muted mt-2 max-w-prose">
                These records come from the county&rsquo;s mapping layer, which carries a
                case number, a parcel and a one-line description — no staff report, no
                address, and no link to the file. Three routes go deeper:
              </p>
              <ul className="muted mt-2 max-w-prose list-disc space-y-1.5 pl-5">
                <li>
                  <strong>The vote.</strong> Conditional use permits and variances are
                  decided in public by the{" "}
                  <Link href="/meetings" className="link-underline">
                    Board of Adjustment
                  </Link>
                  , and this site already holds those minutes — who moved, who seconded,
                  and how each member voted.
                </li>
                <li>
                  <strong>The property.</strong> Where a parcel number is recorded, the
                  link on each row opens it in the{" "}
                  <a
                    href="https://id-latah.publicaccessnow.com/Assessor/PropertySearch/Detail.aspx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline"
                  >
                    Latah County Assessor
                  </a>{" "}
                  record — owner, address, acreage and assessed value history. Bear in
                  mind Idaho publishes no sale price.
                </li>
                <li>
                  <strong>The case file.</strong> Quote the case number to{" "}
                  <a
                    href="https://www.ci.moscow.id.us/151/Community-Development"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline"
                  >
                    Moscow Community Development
                  </a>{" "}
                  — applications, staff reports and conditions are held there, not
                  published as open data.
                </li>
              </ul>
              <p className="faint mt-2 max-w-prose">
                Case numbering is not consistent between the county layer and the city
                minutes — the same permit can appear as CUP26-018 in one and
                LUP2026-0010 in the other — so this site does not link a row to its vote
                automatically rather than risk pairing the wrong two.
              </p>
            </div>
          </section>

          {byYear.rows.length > 0 ? (
            <section id="trend">
              <SectionHeading
                title="Applications by year"
                hint="A rough measure of development pressure."
              />
              <YearChart rows={byYear.rows} />
            </section>
          ) : null}

          <section id="zoning">
            <SectionHeading
              title="Zoning"
              hint="What the city permits where, by district class."
            />
            {zoning.rows.length === 0 ? (
              <EmptyState error={zoning.error} emptyMessage="No zoning data ingested yet." />
            ) : (
              <ul className="card px-4">
                {zoning.rows.map((row) => (
                  <li
                    key={row.zone_class}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2 last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="text-sm">
                      <span className="mono faint mr-2 text-xs">{row.zone_class}</span>
                      {row.zone_desc ?? "Unnamed district"}
                    </span>
                    <span className="faint mono text-xs">
                      {Number(row.acres).toLocaleString("en-US")} acres ·{" "}
                      {row.districts} {Number(row.districts) === 1 ? "area" : "areas"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="faint mt-2 text-xs">
              Acreage is derived from the mapped polygon areas, so treat it as indicative
              rather than survey-grade. See the{" "}
              <Link href="/code/title-04/chapter-02" className="link-underline">
                zoning code
              </Link>{" "}
              for what each district actually permits.
            </p>
          </section>
        </div>
      </WithSectionNav>
    </div>
  );
}
