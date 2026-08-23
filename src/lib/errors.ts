/**
 * Turning a thrown value into something a human can act on.
 *
 * This exists because of a specific failure: when Postgres is unreachable,
 * Node's happy-eyeballs connector throws an AggregateError whose `message`
 * is the empty string. Reading `error.message` alone produced "", which is
 * falsy, so the UI decided there was simply no data yet and told the reader
 * to run the ingester -- when the real problem was that the database was
 * down. An empty error message must never be mistaken for the absence of an
 * error.
 */

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  errors?: unknown;
}

/** Always returns a non-empty, human-readable description. */
export function describeError(error: unknown): string {
  const parts = collectParts(error, 0);
  const joined = parts.filter((part) => part.length > 0).join(": ");
  return joined.length > 0 ? joined : "Unknown error (" + typeof error + ")";
}

function collectParts(error: unknown, depth: number): string[] {
  if (depth > 3) return [];

  if (typeof error === "string") return [error];
  if (error === null || error === undefined) return [];
  if (typeof error !== "object") return [String(error)];

  const candidate = error as ErrorLike;
  const parts: string[] = [];

  const message = typeof candidate.message === "string" ? candidate.message.trim() : "";
  const code = typeof candidate.code === "string" ? candidate.code.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";

  // Prefer a real message; fall back to the error's class name so the reader
  // at least learns what kind of failure this was.
  if (message) parts.push(message);
  else if (name && name !== "Error") parts.push(name);

  if (code && code !== message) parts.push(code);

  // AggregateError carries the actual causes; without unwrapping them the
  // description would say nothing useful.
  if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
    const inner = candidate.errors
      .slice(0, 3)
      .map((child) => collectParts(child, depth + 1).join(" "))
      .filter((text) => text.length > 0);
    if (inner.length > 0) parts.push(inner.join("; "));
  }

  return parts;
}

/** True when the failure looks like "nothing is listening on that port". */
export function isConnectionFailure(error: unknown): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|connect/i.test(describeError(error));
}
