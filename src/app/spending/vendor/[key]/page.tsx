import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PaymentList } from "@/components/Spending";
import { EmptyState, SectionHeading, SourceNote, Stat } from "@/components/ui";
import { formatCalendarDate, formatMoneyCents, pluralise } from "@/lib/format";
import { paymentsForVendor, topVendors } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ key: string }>;
}

async function load(key: string) {
  const decoded = decodeURIComponent(key);
  const [payments, rollup] = await Promise.all([
    paymentsForVendor(decoded),
    topVendors(1, {}),
  ]);
  return { decoded, payments, rollup };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params;
  const { payments } = await load(key);
  const name = payments.rows[0]?.vendor_name ?? decodeURIComponent(key);
  return { title: name, description: "What the City of Moscow has paid " + name + "." };
}

export default async function VendorPage({ params }: PageProps) {
  const { key } = await params;
  const { decoded, payments } = await load(key);

  if (payments.rows.length === 0 && payments.error === null) notFound();

  if (payments.rows.length === 0) {
    return (
      <div className="card p-6 text-sm">
        <p className="muted">This payee could not be loaded.</p>
        <p className="faint mono mt-2 text-xs">{payments.error}</p>
      </div>
    );
  }

  // The register spells the same payee differently between packets, so show the
  // spelling it uses most often rather than whichever row happened to sort first.
  const spellings = new Map<string, number>();
  for (const payment of payments.rows) {
    spellings.set(payment.vendor_name, (spellings.get(payment.vendor_name) ?? 0) + 1);
  }
  const name = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const variants = [...spellings.keys()].filter((spelling) => spelling !== name);

  const total = payments.rows.reduce((sum, p) => sum + Number(p.amount_cents), 0);
  const meetings = new Set(payments.rows.map((p) => p.meeting_id)).size;
  const dates = payments.rows.map((p) => p.check_date).filter((d): d is Date => d !== null);

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">
          <Link href="/spending" className="link-underline">
            Spending
          </Link>
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{name}</h1>
        {variants.length > 0 ? (
          <p className="faint mt-2 text-xs">
            Also printed as {variants.join(", ")}. Grouped as one payee on{" "}
            <span className="mono">{decoded}</span>.
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Submitted for approval" value={formatMoneyCents(total)} />
          <Stat label="Payments" value={payments.rows.length} />
          <Stat
            label="Meetings"
            value={meetings}
            detail={
              dates.length > 0
                ? formatCalendarDate(dates[dates.length - 1]) +
                  " to " +
                  formatCalendarDate(dates[0])
                : undefined
            }
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Every payment"
          hint={pluralise(payments.rows.length, "line") + " of the registers, largest first."}
        />
        <PaymentList payments={payments.rows} />
        <p className="faint mt-3 text-xs">
          These are payments the Council was asked to approve, which is not the same as money paid
          out. Registers we could not read against their own printed total are excluded entirely.
        </p>
        <SourceNote
          publisher="City of Moscow (CivicClerk portal)"
          href="https://moscowid.portal.civicclerk.com/"
        />
      </section>
    </div>
  );
}
