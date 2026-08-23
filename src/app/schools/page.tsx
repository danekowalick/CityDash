import type { Metadata } from "next";

import { WithSectionNav, type NavSection } from "@/components/SectionNav";
import { Badge, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schools",
  description:
    "Where to find enrollment, proficiency, and safety data for Moscow School District 281 and the University of Idaho.",
};

interface Resource {
  name: string;
  url: string;
  note: string;
  tone?: "ok" | "blocked";
}

const DISTRICT: Resource[] = [
  {
    name: "Idaho Report Card — Moscow District 281",
    url: "https://www.idahoreportcard.org/about-us/district?districtId=281",
    note: "The state's official district page: enrollment, ISAT proficiency, graduation rates, and student-group breakdowns.",
  },
  {
    name: "Moscow School District 281",
    url: "https://www.msd281.org/",
    note: "Board agendas and minutes, calendars, budget documents, and school-by-school pages.",
  },
  {
    name: "Moscow Middle School report card data",
    url: "https://mms.msd281.org/facts_information/school_report_card_assessment_data",
    note: "An example of a school publishing its own assessment data directly.",
  },
  {
    name: "Idaho State Department of Education",
    url: "https://apps.sde.idaho.gov/ReportCard",
    note: "Statewide report card portal, including prior years for trend comparison.",
  },
  {
    name: "NCES district profile",
    url: "https://nces.ed.gov/ccd/districtsearch/district_detail.asp?Search=2&details=1&DistrictID=1602220",
    note: "Federal figures for the district — useful for comparing Moscow against national data.",
  },
];

const UNIVERSITY: Resource[] = [
  {
    name: "UI crime & safety statistics",
    url: "https://www.ci.moscow.id.us/293/UI-Crime-Safety-Statistics",
    note: "Campus crime reported under NIBRS by Moscow PD — the university side of the police data on this site.",
  },
  {
    name: "University of Idaho",
    url: "https://www.uidaho.edu/",
    note: "Enrollment reporting, the academic calendar, and public events.",
  },
];

export default function SchoolsPage() {
  const sections: NavSection[] = [
    { id: "status", label: "Why this is links" },
    { id: "district", label: "School district", count: DISTRICT.length },
    { id: "university", label: "University of Idaho", count: UNIVERSITY.length },
    { id: "planned", label: "What would be built" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">Schools</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          How education in Moscow is doing
        </h1>
        <p className="muted mt-2 max-w-prose">
          Moscow School District 281 serves roughly 2,300 students across the city, and the
          University of Idaho shapes a great deal of what happens here. This section points
          at the authoritative sources for both.
        </p>
        <div className="mt-3">
          <Badge tone="warn">Links, not ingested data</Badge>
        </div>
      </section>

      <WithSectionNav sections={sections}>
        <div className="space-y-10">
          <section
            id="status"
            className="card p-5 text-sm"
            style={{ background: "var(--opinion)" }}
          >
            <h2 className="font-semibold">Why this section links out instead of charting</h2>
            <p className="muted mt-2 max-w-prose">
              The Idaho Report Card — the authoritative source for enrollment, proficiency,
              and graduation rates — is built as a <strong>Blazor Server</strong>{" "}
              application. Its pages render over a stateful WebSocket rather than serving
              HTML or JSON, and its &ldquo;Data Files&rdquo; page exposes no downloadable
              file. There is no endpoint to read.
            </p>
            <p className="muted mt-2 max-w-prose">
              Ingesting it would mean driving a scripted browser session through the site
              on a schedule — fragile, heavy on someone else&rsquo;s server, and hard to
              square with how politely the rest of this site fetches. Every other source
              here is an API, a feed, or a published document.
            </p>
            <p className="muted mt-2 max-w-prose">
              So rather than show a chart built on a brittle scrape, or worse a stale copy
              that silently drifts from the state&rsquo;s figures, this page sends you to
              the real thing.
            </p>
          </section>

          <section id="district">
            <SectionHeading
              title="Moscow School District 281"
              hint="Enrollment, proficiency, graduation, and board business."
            />
            <ul className="space-y-2">
              {DISTRICT.map((resource) => (
                <li key={resource.url} className="card p-3">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline font-medium"
                  >
                    {resource.name}
                  </a>
                  <p className="muted mt-0.5 text-sm">{resource.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="university">
            <SectionHeading
              title="University of Idaho"
              hint="The campus is inside the city, and its safety data is reported by Moscow PD."
            />
            <ul className="space-y-2">
              {UNIVERSITY.map((resource) => (
                <li key={resource.url} className="card p-3">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline font-medium"
                  >
                    {resource.name}
                  </a>
                  <p className="muted mt-0.5 text-sm">{resource.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="planned">
            <SectionHeading
              title="What would be built here"
              hint="If a usable source appears, or a records request produces the files."
            />
            <ul className="card muted list-disc space-y-1.5 py-4 pr-4 pl-9 text-sm">
              <li>District enrollment by school and grade, year over year</li>
              <li>ISAT proficiency and graduation rates with the statewide figure alongside</li>
              <li>Per-pupil spending and the district budget</li>
              <li>School board meetings folded into the same civic calendar as city meetings</li>
              <li>University enrollment, and Clery Act safety statistics over time</li>
            </ul>
            <p className="faint mt-3 max-w-prose text-xs">
              The most likely route in is a public records request to the State Department
              of Education for the underlying report card files, which would give clean
              multi-year data without scraping anything. That is a phone call, not a
              parser.
            </p>
          </section>
        </div>
      </WithSectionNav>
    </div>
  );
}
