import { assetHref } from "@/lib/routes";

/**
 * Reads a meeting's minutes in the page instead of downloading them.
 *
 * The PDF is served through this site's own proxy so it displays inline;
 * CivicClerk marks the original as an attachment, which makes a browser save
 * it rather than render it.
 *
 * Where we managed to extract text, that is offered alongside. It loads
 * instantly, reflows on a phone, and can be searched with the browser's own
 * find -- none of which is true of an embedded PDF. The PDF remains the
 * authoritative document, and for scanned minutes it is the only way to read
 * them at all.
 */
export function MinutesViewer({
  meetingId,
  sourceUrl,
  pageCount,
  isScanned,
  text,
}: {
  meetingId: number;
  sourceUrl: string;
  pageCount: number;
  isScanned: boolean;
  text: string | null;
}) {
  const proxied = assetHref("/meetings/" + meetingId + "/minutes.pdf");

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="muted text-sm">
          {pageCount > 0 ? pageCount + (pageCount === 1 ? " page" : " pages") : "Minutes"}
          {isScanned ? " · scanned image, no searchable text" : null}
        </p>
        <p className="text-sm">
          <a href={proxied} target="_blank" rel="noopener noreferrer" className="link-underline">
            Open full screen
          </a>
          <span className="faint mx-2">·</span>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="faint link-underline">
            Original on the city portal
          </a>
        </p>
      </div>

      {/*
        <object> rather than <iframe>: it renders the browser's built-in PDF
        viewer the same way, but its children act as fallback content when a
        browser cannot display PDFs, which an iframe cannot express.
      */}
      <object
        data={proxied}
        type="application/pdf"
        aria-label="Meeting minutes"
        className="card w-full"
        style={{ height: "min(80vh, 900px)" }}
      >
        <div className="p-6 text-sm">
          <p className="muted">
            Your browser will not display PDFs inline.{" "}
            <a href={proxied} target="_blank" rel="noopener noreferrer" className="link-underline">
              Open the minutes
            </a>{" "}
            instead.
          </p>
        </div>
      </object>

      {text ? (
        <details className="card mt-3 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Read as text instead
            <span className="faint ml-2 font-normal">
              searchable, and easier on a phone
            </span>
          </summary>
          <p className="muted mt-3 max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
          <p className="faint mt-3 text-xs">
            Extracted from the PDF for reading and searching. Tables and layout are
            flattened, so treat the PDF above as authoritative.
          </p>
        </details>
      ) : null}
    </div>
  );
}
