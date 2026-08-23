"use client";

import { useEffect, useState } from "react";

/**
 * Jump navigation for the long pages.
 *
 * These pages are dense on purpose -- the point is that a resident can see
 * everything without clicking -- but that makes them tall. This gives a
 * standing index: a sticky rail beside the content on wide screens, and a
 * sticky strip of chips under the header on narrow ones.
 *
 * The links are plain anchors and work with JavaScript disabled. The only
 * thing JS adds is highlighting whichever section you are currently reading,
 * which is orientation rather than content.
 */

export interface NavSection {
  id: string;
  label: string;
  /** Optional count shown beside the label. */
  count?: number | string;
}

/** Tracks which section is currently under the top of the viewport. */
function useActiveSection(sections: NavSection[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = sections.map((s) => s.id).join("|");

  useEffect(() => {
    const ids = key.split("|").filter(Boolean);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    setActive(ids[0]);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      // Biased toward the top so a heading counts as "current" as soon as it
      // settles below the sticky header.
      { rootMargin: "-88px 0px -55% 0px", threshold: [0, 0.1] },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [key]);

  return active;
}

function Chips({ sections, active }: { sections: NavSection[]; active: string | null }) {
  return (
    <nav
      aria-label="On this page"
      className="scroll-x sticky top-0 z-30 -mx-5 mb-6 border-b px-5 py-2 lg:hidden"
      style={{
        borderColor: "var(--border)",
        background: "var(--ground)",
      }}
    >
      <ul className="flex gap-2">
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id}>
              <a
                href={"#" + section.id}
                aria-current={isActive ? "true" : undefined}
                className="block rounded-full border px-3 py-1 text-xs whitespace-nowrap"
                style={
                  isActive
                    ? {
                        borderColor: "transparent",
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        fontWeight: 600,
                      }
                    : { borderColor: "var(--border)", color: "var(--ink-muted)" }
                }
              >
                {section.label}
                {section.count !== undefined ? (
                  <span className="faint mono ml-1.5">{section.count}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Rail({ sections, active }: { sections: NavSection[]; active: string | null }) {
  return (
    <nav aria-label="On this page" className="sticky top-8">
      <p className="eyebrow mb-2">On this page</p>
      <ul className="space-y-0.5 border-l" style={{ borderColor: "var(--border)" }}>
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id}>
              <a
                href={"#" + section.id}
                aria-current={isActive ? "true" : undefined}
                className="-ml-px flex items-baseline justify-between gap-2 border-l-2 py-1 pl-3 text-sm"
                style={
                  isActive
                    ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 600 }
                    : { borderColor: "transparent", color: "var(--ink-muted)" }
                }
              >
                <span>{section.label}</span>
                {section.count !== undefined ? (
                  <span className="faint mono text-xs">{section.count}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Two-column shell: content plus the sticky rail, collapsing to a single
 * column below `lg` where the nav becomes the chip strip. The active-section
 * hook runs once here and feeds both renderings.
 */
export function WithSectionNav({
  sections,
  children,
}: {
  sections: NavSection[];
  children: React.ReactNode;
}) {
  const active = useActiveSection(sections);
  if (sections.length < 2) return <>{children}</>;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_12rem] lg:gap-12">
      <div className="min-w-0">
        <Chips sections={sections} active={active} />
        {children}
      </div>
      <aside className="hidden lg:block">
        <Rail sections={sections} active={active} />
      </aside>
    </div>
  );
}
