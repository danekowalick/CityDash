# City Dash

A civic dashboard for **Moscow, Idaho** — public meetings and what they decided, what the
city spends, police activity, changes to the city code, zoning and land use, and the
civic calendar. All assembled from primary sources, with a link back to every one.

It is a facts site. Nothing here is written, summarised, or interpreted by a language
model: records are parsed deterministically, counts are counted, and code changes are
produced by a text diff.

---

## Getting started

```bash
npm install
```

Copy the environment template and point it at a Postgres database:

```bash
cp .env.example .env
```

`DATABASE_URL` can be any Postgres 14+ instance. Three options, all on port **55432** so
nothing collides with an existing Postgres on 5432:

- **Portable Postgres (no install)** — what this repo is set up for. The binaries and data
  live under `.localdb/` (gitignored) and are removed by deleting that folder:
  ```bash
  npm run db:start
  ```
  `npm run db:stop` stops it, `npm run db:psql` opens a shell. If `.localdb/pgsql` is
  missing, `scripts/localdb.sh` prints the download command.
- **Docker** — `docker compose up -d`.
- **Neon** — free hosted Postgres; paste its connection string into `.env`.

Create the schema and populate the source registry:

```bash
npm run db:migrate
```

Fetch data:

```bash
npm run ingest
```

Run the site:

```bash
npm run dev
```

If the database is unreachable, the site still renders and says so on
[`/sources`](http://localhost:3000/sources) rather than returning a 500.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build and type check |
| `npm test` | Parser and utility tests, run against saved real fixtures |
| `npm run db:start` / `db:stop` / `db:psql` | Control the portable local Postgres |
| `npm run db:migrate` | Apply `db/migrations/*.sql`, sync the source registry |
| `npm run ingest` | Run every enabled ingestion job |
| `npm run ingest:police` | Just the MPD press logs |
| `npm run ingest:meetings` | Just the CivicClerk meetings |
| `npm run ingest:code` | Just the city code chapters |
| `npm run ingest:minutes` | Just meeting outcomes from minutes |
| `npm run ingest:packets` | Just spending read from the agenda packets |
| `npm run ingest:news` | Just the city RSS feeds |
| `npm run ingest:property` | Just zoning and land use from county GIS |

Useful flags: `npm run ingest -- --limit 30` deepens the press log backfill;
`--force` reparses pages even when their content is unchanged.

---

## How it is put together

**Reads and writes are separate.** The Next.js app on Vercel only ever reads the
database. Ingestion runs as a scheduled GitHub Actions workflow
(`.github/workflows/ingest.yml`), because crawling politely takes minutes and that fits
an Actions runner rather than a serverless function timeout.

**Raw documents are stored before they are parsed.** Every fetched page lands in
`raw_documents`, keyed by content hash, and is never discarded. CivicPlus markup *will*
change and parsers *will* break; when that happens we reparse history from this table
instead of re-crawling and losing whatever the publisher has since rotated out of its
archive.

```
src/
  lib/
    parsers/       pure parsing functions + tests (no I/O, no database)
    fixtures/      real captured pages the tests assert against
    fetcher.ts     the one HTTP client -- robots.txt, rate limits, backoff
    db.ts          Postgres pool
    queries.ts     read-side queries, each returning an honest empty state
    errors.ts      turns thrown values into non-empty, actionable text
  ingest/
    sources.ts     the source registry, including each terms review
    jobs/          one module per source
    run.ts         CLI entrypoint
  app/             Next.js App Router pages
db/migrations/     plain SQL, re-runnable
```

Parsing is deliberately isolated from I/O, so every parser is tested against a real
saved page rather than a mock.

---

## Sections

| Page | What it holds |
| --- | --- |
| `/` | This week: next meeting, latest police log, recent decisions |
| `/meetings` | 1,700+ meetings; motions, movers, seconders and vote tallies from the minutes |
| `/spending` | Every payment put to Council for approval, from the packet check registers |
| `/police` | Daily MPD press logs parsed into incidents, with coverage and gap detection |
| `/code` | 128 code chapters, hashed and diffed; ordinances; the Decision Tracker |
| `/property` | Zoning districts and 1,179 land use applications |
| `/community` | Civic calendar with an `.ics` feed, city alerts, news and opinion links |
| `/schools` | Links out — see the Idaho Report Card note below |
| `/sources` | Live health of every feed and the terms review behind it |

### The Decision Tracker

An ordinance followed from the vote that passed it to the code it changed, via two exact
links and no inference:

1. **Ordinance → adopting meeting**, by date. Chapter PDFs print the adoption date
   (`(Ord. 2026-04, 07/06/2026)`) and the Council met that evening.
2. **Meeting → code chapters**, from the minutes text — agenda items name what they amend
   ("Title 4, Chapters 1, 3, 4, and 6").

Minutes never print an ordinance number in the motion, because the number is assigned on
adoption. The tracker says so rather than guessing which motion passed which ordinance.

---

## Data sources

Currently ingested:

| Source | Type | Notes |
| --- | --- | --- |
| [MPD daily press logs](https://www.ci.moscow.id.us/m/newsflash?cat=23) | scrape | Rigidly structured; ~30–50 incidents a day |
| [City meetings (CivicClerk)](https://moscowid.api.civicclerk.com/v1/Events) | OData API | Agendas, minutes, video, attached documents |
| [Moscow city code](https://www.ci.moscow.id.us/393/City-Code) | scrape (PDF) | 128 chapters, hashed and diffed on change; ordinances read from the text |
| Meeting minutes | scrape (PDF) | Motions, movers, seconders, and vote tallies — what each body decided |
| Agenda packets | scrape (PDF) | The check register, disbursement report and per-item staff reports bound behind each agenda |
| [City alerts & calendar](https://www.ci.moscow.id.us/RSSFeed.aspx?ModID=76&CID=All) | RSS | Announcements, closures, public hearing notices |
| [Latah County GIS](https://gis.latah.id.us/arcgis/rest/services) | ArcGIS REST | Zoning districts and 1,179 land use applications |

Confirmed available and planned: the city code PDFs (each stamped with the ordinance it
is current through, which is what makes diffing possible), adopted ordinances and
resolutions, the city news RSS feed, Latah County's open ArcGIS services, and the Idaho
Report Card. See `/code`, `/property`, `/schools`, and `/community` in the running app —
each names its sources and their current status.

### Two constraints worth knowing before you plan around them

**Idaho is a non-disclosure state.** Home sale prices are not public record anywhere —
sellers are not required to report them to the recorder or assessor. Deed *transfers*
(date, instrument type, parties) are obtainable; sale prices are not. Any price figure on
this site must come from MLS-derived aggregates, at city level, on a lag, and be labelled
as such.

**PDF text extraction must use geometry, not blind spacing.** A PDF emits runs of
glyphs at coordinates, and kerning splits words across runs. Joining every run with a
space produced "se parate", "Abstenti ons", and "0 7/15/2019" — which not only read badly
but defeated parsers keyed on those words, affecting one motion in eight. `joinTextItems`
in `src/lib/pdf.ts` inserts a space only where the geometry implies one.

**The Idaho Report Card cannot be ingested.** It is a Blazor Server application: pages
render over a stateful WebSocket, and its data-files page exposes no download. Scraping it
would mean driving a scripted browser on a schedule. The Schools section links out instead
and says so.

**Minutes vary by body, and some cannot be read at all.** Four distinct motion
phrasings appear across Council and the commissions, only some bodies print a vote tally,
and a handful of minutes are scanned images with no text layer. The parser handles all
four forms, represents a missing tally as null rather than inventing one, and marks
unreadable minutes explicitly — a meeting we cannot read is not a meeting that decided
nothing. See `src/lib/parsers/minutes.ts`.

**Code diffs need aggressive whitespace normalisation.** The chapters are justified
two-column PDFs; the same sentence re-typeset extracts with different runs of spaces, and
per-page running heads ("§ 1-1 TITLE 1 — GENERAL § 1-3") move whenever content reflows.
Without stripping both, every reissue would appear to have changed everywhere. See
`normaliseCodeText` in `src/lib/parsers/cityCode.ts`.

**Agenda packets are read against their own arithmetic.** Every Council packet carries an
accounts payable check register listing each cheque the Council is being asked to approve
— 470-odd lines, none of which appears on the agenda or in the minutes. It is also a
fixed-width report that clips an amount which overflows its column, printing
`$1,193,437.` where the cheque total says `$1,193,437.50`. Two things make it safe to
publish anyway. The register prints its own *Total Amount Being Paid* and its own page
count, so our reading can be checked against the document; both numbers are stored and the
site shows them side by side, and ours is never adjusted to match. And a clipped amount is
recovered only where the cheque's own total makes it arithmetic rather than a guess —
otherwise it is flagged as understated. A register that fails either check is recorded but
excluded from every total on the site, because publishing 17 lines of a 400-line register
would understate the city's spending far more damagingly than admitting we could not read
it. See `src/lib/parsers/checkRegister.ts`.

**Packets come in two layouts, and half a packet is boilerplate.** Packets before about
July 2026 render the register with its columns abutting —
`Professional ServicesGeneral Fund116615 Alex Jones06/17/2026 $540.00`, no space between
account and fund, fund and cheque number, or payee and date. Since extraction returns each
page as a single line with no newlines anywhere, rows are found by their tail (a date
followed by an amount) and split on a closed set of fund names, which is the only thing
separating an account from a fund. Separately, the contracts, plats and engineering
specifications bound in behind each staff report are more than half the packet and almost
entirely template text: a search for "legal" across the raw packet returns twenty hits of
`ARTICLE 13. LEGAL FEES` and one real payment. Their page ranges are kept and their text is
not, which is what makes the search useful. The *Major Expenditures* page is kept as text
but deliberately not parsed into rows — it is laid out in three columns that flatten
together, so no payee, amount and description can be reassembled reliably. See
`src/lib/parsers/packet.ts`.

**CivicClerk timestamps lie about their zone.** `startDateTime` is serialised with a
trailing `Z` but is actually Moscow local wall-clock time. Reading it as UTC puts every
meeting seven hours off. `zonedWallTimeToUtc` in `src/lib/parsers/civicclerk.ts` handles
this, and there are tests pinning the behaviour on both sides of a DST boundary.

---

## Scraping conduct

Enforced centrally in `src/lib/fetcher.ts` so a new job cannot accidentally be impolite:
robots.txt honoured per host including `Crawl-delay`; a User-Agent naming the project and
a contact address; spaced requests with exponential backoff on 429 and 5xx; unchanged
content detected by hash and not reprocessed.

**Set a real contact address in `CITYDASH_USER_AGENT` before running against live
sources.** It is how a site operator reaches you instead of silently blocking you.

No source is enabled until someone has read the publisher's terms and written the finding
into `termsNote` in `src/ingest/sources.ts`. That text is published on `/sources`.

## Police data

Press logs are **calls for service** — not charges, not convictions. Many entries resolve
to nothing. The rules, decided before any of this was built: no names; block-level
addresses exactly as published; `noindex` on individual incident pages when they exist; and disclosed
gaps, since case numbers run sequentially and a skipped number means the published log
was incomplete.

## Not affiliated

Independent project. Not operated by, endorsed by, or affiliated with the City of Moscow,
Latah County, the Moscow Police Department, or the University of Idaho.
