import Link from "next/link";
import type { Metadata } from "next";

import { PaymentList } from "@/components/Spending";
import { SearchBox } from "@/components/SearchBox";
import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, EmptyState, Row, RowList, SectionHeading, SourceNote, Stat } from "@/components/ui";
import { formatCalendarDate, formatMoneyCents, formatMoneyShort, pluralise } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import {
  accountTotals,
  fundTotals,
  largestPayments,
  searchPacketSegments,
  searchPayments,
  searchStaffReports,
  spendingSearchCounts,
  spendingStats,
  topVendors,
  untrustedRegisters,
  type SpendingFilters,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spending",
  description:
    "Every payment the Moscow City Council was asked to approve, read from the check " +
    "register bound into each agenda packet.",
};

interface PageProps {
  searchParams: Promise<{ q?: string; fund?: string; account?: string }>;
}

export default async function SpendingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();
  const filters: SpendingFilters = { fund: params.fund, account: params.account };
  const filtered = Boolean(params.fund || params.account);

  const [stats, vendors, largest, funds, accounts, untrusted] = await Promise.all([
    spendingStats(),
    topVendors(40, filters),
    largestPayments(30, filters),
    fundTotals(filters),
    accountTotals(24, filters),
    untrustedRegisters(10),
  ]);

  const [payments, reports, segments, counts] = term
    ? await Promise.all([
        searchPayments(term),
        searchStaffReports(term),
        searchPacketSegments(term),
        spendingSearchCounts(term),
      ])
    : [null, null, null, null];

  const stat = stats.rows[0];
  const hits = counts?.rows[0];
  const totalHits = hits
    ? Number(hits.payments) + Number(hits.staff_reports) + Number(hits.segments)
    : undefined;

  const sections: NavSection[] = [];
  if (term) sections.push({ id: "results", label: "Results", count: totalHits });
  sections.push(
    { id: "vendors", label: "Who gets paid", count: vendors.rows.length },
    { id: "largest", label: "Largest payments", count: largest.rows.length },
    { id: "funds", label: "By fund", count: funds.rows.length },
    { id: "accounts", label: "By account", count: accounts.rows.length },
    { id: "how", label: "How this is read" },
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Spending</h1>
        <p className="muted mt-2 max-w-prose">
          Every payment the City Council was asked to approve, read line by line from the
          accounts payable register bound into each agenda packet. None of this appears on the
          agenda or in the minutes.
        </p>

        {stat ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Submitted for approval"
              value={formatMoneyShort(stat.payment_total_cents)}
              detail={
                stat.earliest_check && stat.latest_check
                  ? formatCalendarDate(stat.earliest_check) +
                    " to " +
                    formatCalendarDate(stat.latest_check)
                  : undefined
              }
            />
            <Stat label="Payments" value={Number(stat.payment_count).toLocaleString()} />
            <Stat label="Payees" value={Number(stat.vendor_count).toLocaleString()} />
            <Stat
              label="Packets read"
              value={stat.packets_read}
              detail={
                Number(stat.registers_untrusted) > 0
                  ? Number(stat.registers_untrusted) + " registers not counted"
                  : pluralise(Number(stat.registers_trusted), "register") + " counted"
              }
            />
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              error={stats.error}
              emptyMessage="No packets have been read yet."
              hint="Run npm run ingest:packets to read the published packets."
            />
          </div>
        )}

        <div className="mt-5">
          <SearchBox
            action="/spending"
            label="Search spending"
            placeholder="A payee, a fund, an account -- try a law firm or Vehicles"
            value={term}
            hidden={{ fund: params.fund, account: params.account }}
            resultCount={totalHits}
          />
        </div>

        {filtered ? (
          <p className="muted mt-3 text-sm">
            Filtered to {params.fund ?? params.account}.{" "}
            <Link href="/spending" className="link-underline">
              Clear
            </Link>
          </p>
        ) : null}
      </section>

      <WithSectionNav sections={sections}>
        <div className="space-y-10">
          {term ? (
            <section id="results">
              <SectionHeading
                title={'Matches for "' + term + '"'}
                hint={
                  hits
                    ? pluralise(Number(hits.payments), "payment") +
                      ", " +
                      pluralise(Number(hits.staff_reports), "staff report") +
                      ", " +
                      pluralise(Number(hits.segments), "packet page") +
                      "."
                    : undefined
                }
              />

              {payments && payments.rows.length > 0 ? (
                <div className="mb-6">
                  <p className="eyebrow mb-2">Payments</p>
                  <PaymentList payments={payments.rows} />
                </div>
              ) : null}

              {reports && reports.rows.length > 0 ? (
                <div className="mb-6">
                  <p className="eyebrow mb-2">Staff reports</p>
                  <RowList>
                    {reports.rows.map((report) => (
                      <Row key={report.id}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            <Link
                              href={dynamicHref("/meetings/" + report.meeting_id)}
                              className="link-underline"
                            >
                              {report.agenda_item_title ?? "Untitled item"}
                            </Link>
                          </p>
                          <p className="muted mt-0.5 text-xs">
                            {report.body} · {formatCalendarDate(report.starts_at)}
                            {report.start_page ? " · packet p" + report.start_page : ""}
                          </p>
                          {report.fiscal_impact ? (
                            <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                              <span className="eyebrow">Fiscal impact </span>
                              {report.fiscal_impact.slice(0, 240)}
                            </p>
                          ) : null}
                        </div>
                      </Row>
                    ))}
                  </RowList>
                </div>
              ) : null}

              {segments && segments.rows.length > 0 ? (
                <div>
                  <p className="eyebrow mb-2">Elsewhere in the packet</p>
                  <RowList>
                    {segments.rows.map((hit) => (
                      <Row key={hit.id}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {hit.title ?? hit.kind}
                            <span className="faint ml-2 text-xs">
                              {hit.body} · {formatCalendarDate(hit.starts_at)}
                            </span>
                          </p>
                          <p className="muted mono mt-1 text-xs">…{hit.excerpt}…</p>
                          {hit.packet_url ? (
                            <p className="faint mt-1 text-xs">
                              <a
                                href={hit.packet_url + "#page=" + hit.start_page}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link-underline"
                              >
                                Packet page {hit.start_page}
                              </a>
                            </p>
                          ) : null}
                        </div>
                      </Row>
                    ))}
                  </RowList>
                </div>
              ) : null}

              {totalHits === 0 ? (
                <EmptyState
                  error={payments?.error ?? null}
                  emptyMessage={'Nothing matches "' + term + '".'}
                  hint="Only packets that have been read are searchable."
                />
              ) : null}
            </section>
          ) : null}

          <section id="vendors">
            <SectionHeading
              title="Who gets paid"
              hint="Grouped by payee, largest first. The name shown is the spelling the register prints most often."
            />
            {vendors.rows.length > 0 ? (
              <RowList>
                {vendors.rows.map((vendor) => (
                  <Row key={vendor.vendor_key}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <Link
                          href={dynamicHref("/spending/vendor/" + encodeURIComponent(vendor.vendor_key))}
                          className="link-underline"
                        >
                          {vendor.vendor_name}
                        </Link>
                      </p>
                      <p className="muted mt-0.5 text-xs">
                        {pluralise(Number(vendor.payment_count), "payment")} across{" "}
                        {pluralise(Number(vendor.meeting_count), "meeting")}
                        {vendor.last_check ? " · last " + formatCalendarDate(vendor.last_check) : ""}
                      </p>
                    </div>
                    <span className="mono shrink-0 text-sm font-semibold">
                      {formatMoneyCents(vendor.total_cents)}
                    </span>
                  </Row>
                ))}
              </RowList>
            ) : (
              <EmptyState
                error={vendors.error}
                emptyMessage="No payments have been read yet."
                hint="Run npm run ingest:packets to read the published packets."
              />
            )}
          </section>

          <section id="largest">
            <SectionHeading title="Largest payments" hint="Individual lines, not cheque totals." />
            {largest.rows.length > 0 ? (
              <PaymentList payments={largest.rows} />
            ) : (
              <EmptyState error={largest.error} emptyMessage="No payments have been read yet." />
            )}
          </section>

          <section id="funds">
            <SectionHeading title="By fund" hint="Which pot of money each payment came out of." />
            {funds.rows.length > 0 ? (
              <RowList>
                {funds.rows.map((fund) => (
                  <Row key={fund.label ?? "unstated"}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {fund.label ? (
                          <Link
                            href={dynamicHref("/spending?fund=" + encodeURIComponent(fund.label))}
                            className="link-underline"
                          >
                            {fund.label}
                          </Link>
                        ) : (
                          <span className="muted">Fund not stated</span>
                        )}
                      </p>
                      <p className="muted mt-0.5 text-xs">
                        {pluralise(Number(fund.payment_count), "payment")}
                      </p>
                    </div>
                    <span className="mono shrink-0 text-sm">{formatMoneyCents(fund.total_cents)}</span>
                  </Row>
                ))}
              </RowList>
            ) : (
              <EmptyState error={funds.error} emptyMessage="No payments have been read yet." />
            )}
          </section>

          <section id="accounts">
            <SectionHeading
              title="By account"
              hint="What the money was spent on, in the city's own account names."
            />
            {accounts.rows.length > 0 ? (
              <RowList>
                {accounts.rows.map((account) => (
                  <Row key={account.label ?? "unstated"}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {account.label ? (
                          <Link
                            href={dynamicHref(
                              "/spending?account=" + encodeURIComponent(account.label),
                            )}
                            className="link-underline"
                          >
                            {account.label}
                          </Link>
                        ) : (
                          <span className="muted">Account not stated</span>
                        )}
                      </p>
                      <p className="muted mt-0.5 text-xs">
                        {pluralise(Number(account.payment_count), "payment")}
                      </p>
                    </div>
                    <span className="mono shrink-0 text-sm">
                      {formatMoneyCents(account.total_cents)}
                    </span>
                  </Row>
                ))}
              </RowList>
            ) : (
              <EmptyState error={accounts.error} emptyMessage="No payments have been read yet." />
            )}
          </section>

          <section id="how">
            <SectionHeading title="How this is read" />
            <div className="card space-y-3 p-4 text-sm">
              <p>
                <strong>This is money submitted for approval, not money already spent.</strong> The
                register lists the cheques the Council is being asked to approve at that meeting. An
                item can be pulled or amended, and the packet is not the final word on it.
              </p>
              <p>
                Every register prints its own total, so our reading of it can be checked against the
                document. Both numbers are shown on the meeting page, whether or not they agree, and
                ours is never adjusted to match.
              </p>
              <p>
                The register is a fixed-width report that <strong>clips an amount</strong> which
                overflows its column, printing <span className="mono">$1,193,437.</span> where the
                cheque total says <span className="mono">$1,193,437.50</span>. Where the cheque total
                makes the missing figure a matter of arithmetic it is recovered and marked{" "}
                <Badge>cents recovered</Badge>. Where it does not, the amount is left as printed and
                marked <Badge tone="warn">understated</Badge>.
              </p>
              <p>
                A blank fiscal impact on a staff report means the field was left blank, not that the
                item was free. The FY2027 budget, at $149,942,154, leaves it blank.
              </p>
              <p>
                Only City Council packets carry a register. The commissions and committees publish
                staff reports and attachments only, so a body with no spending here has none
                published, not none at all.
              </p>
              <p>
                The contracts, plats and engineering specifications bound in behind each staff report
                are not indexed — they are more than half the packet and almost entirely boilerplate,
                and searching them returns twenty hits of{" "}
                <span className="mono">ARTICLE 13. LEGAL FEES</span> for every real payment. Their
                page ranges are kept, and every figure here links to the page it is printed on.
              </p>
              <p>
                The <em>Major Expenditures</em> page is searchable but is not turned into rows: it is
                laid out in three columns which flatten together on extraction, so no payee, amount
                and description can be put back together reliably.
              </p>
            </div>

            {untrusted.rows.length > 0 ? (
              <div className="mt-4">
                <p className="eyebrow mb-2">Registers we could not read, and so do not count</p>
                <RowList>
                  {untrusted.rows.map((batch) => (
                    <Row key={batch.id}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <Link
                            href={dynamicHref("/meetings/" + batch.meeting_id)}
                            className="link-underline"
                          >
                            {batch.body} {formatCalendarDate(batch.starts_at)}
                          </Link>
                        </p>
                        <p className="muted mt-0.5 text-xs">
                          {batch.declared_page_count !== null &&
                          batch.page_count !== batch.declared_page_count
                            ? "says it is " +
                              batch.declared_page_count +
                              " pages, read " +
                              batch.page_count
                            : batch.declared_total_cents === null
                              ? "printed no total to check against"
                              : "read " +
                                formatMoneyCents(batch.parsed_total_cents) +
                                " against a printed " +
                                formatMoneyCents(batch.declared_total_cents)}
                        </p>
                      </div>
                      <Badge tone="warn">not counted</Badge>
                    </Row>
                  ))}
                </RowList>
              </div>
            ) : null}

            <SourceNote
              publisher="City of Moscow (CivicClerk portal)"
              href="https://moscowid.portal.civicclerk.com/"
              checkedAt={stat?.latest_check ?? null}
            />
          </section>
        </div>
      </WithSectionNav>
    </div>
  );
}
