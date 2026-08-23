import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "City Dash — what is happening in Moscow, Idaho",
    template: "%s · City Dash",
  },
  description:
    "Public meetings, police activity, city code, and community events for Moscow, Idaho — " +
    "assembled from primary sources, with a link back to every one.",
};

/**
 * Six flat sections. Nothing is nested in a submenu: the rule for this site
 * is at most two clicks from the front page to any record, and three to the
 * primary source document behind it.
 */
const NAV = [
  { href: "/meetings", label: "Meetings" },
  { href: "/police", label: "Police" },
  { href: "/code", label: "Code & Courts" },
  { href: "/property", label: "Property" },
  { href: "/schools", label: "Schools" },
  { href: "/community", label: "Community" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded focus:px-3 focus:py-2"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          Skip to content
        </a>

        <header className="border-b" style={{ borderColor: "var(--border)" }}>
          <div className="wrap flex flex-wrap items-baseline gap-x-6 gap-y-2 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              City Dash
              <span className="muted ml-2 text-sm font-normal">Moscow, Idaho</span>
            </Link>

            <nav aria-label="Sections" className="scroll-x -mb-1 flex gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap py-1 hover:text-[var(--accent)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="main" className="wrap py-8">
          {children}
        </main>

        <footer className="mt-16 border-t py-8 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="wrap grid gap-4 sm:grid-cols-2">
            <p className="muted max-w-prose">
              Assembled automatically from public records. Every figure on this site links
              to the document it came from. Nothing here is written or summarised by an AI
              model.
            </p>
            <p className="muted sm:text-right">
              <Link href="/sources" className="link-underline">
                Sources &amp; data health
              </Link>
              <span className="faint mx-2">·</span>
              <Link href="/about" className="link-underline">
                About &amp; corrections
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
