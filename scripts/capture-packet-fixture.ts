/**
 * Capture an agenda packet as a test fixture.
 *
 * The packets themselves are far too large to commit -- a Council packet is
 * 20MB of PDF -- so what gets committed is the extracted page text, the same
 * trade already made for minutes/boa.txt. That is also the honest boundary for
 * these tests: pdf.ts is what turns bytes into text, and the packet parsers are
 * only ever handed text.
 *
 *   npx tsx scripts/capture-packet-fixture.ts <fileId> <name> [maxPages]
 *
 * e.g. npx tsx scripts/capture-packet-fixture.ts 9905 council-2026-08-17
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import "../src/ingest/env";
import { politeFetchBytes } from "../src/lib/fetcher";
import { extractPdfText, looksLikePdf } from "../src/lib/pdf";
import { meetingFileUrl } from "../src/lib/parsers/civicclerk";

async function main(): Promise<void> {
  const [fileIdRaw, name, maxPagesRaw] = process.argv.slice(2);
  if (!fileIdRaw || !name) {
    console.error("usage: capture-packet-fixture.ts <fileId> <name> [maxPages]");
    process.exit(1);
  }

  const url = meetingFileUrl(Number(fileIdRaw));
  console.log("Fetching " + url);
  const fetched = await politeFetchBytes(url);
  if (!looksLikePdf(fetched.bytes)) throw new Error("not a PDF");

  // Read the size first: pdfjs takes ownership of the buffer and detaches it,
  // after which bytes.length reads back as 0.
  const byteSize = fetched.bytes.length;
  const extracted = await extractPdfText(fetched.bytes);
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : extracted.pageCount;
  const pages = extracted.pages.slice(0, maxPages);

  const dir = join(process.cwd(), "src", "lib", "fixtures", "packets");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name + ".pages.json");

  writeFileSync(
    file,
    JSON.stringify(
      {
        fileId: Number(fileIdRaw),
        url,
        byteSize,
        pageCount: extracted.pageCount,
        capturedPages: pages.length,
        pages,
      },
      null,
      0,
    ) + "\n",
    "utf8",
  );

  console.log(
    "Wrote " + file + " (" + pages.length + " of " + extracted.pageCount + " pages, " +
      byteSize + " source bytes)",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
