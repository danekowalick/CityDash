import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * A single shared connection pool. Next.js reloads modules in development,
 * so the pool is stashed on globalThis to avoid leaking a new pool per
 * reload and exhausting the database's connection limit.
 */
const globalForDb = globalThis as unknown as { __cityDashPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres instance " +
        "(`docker compose up -d` starts a local one).",
    );
  }

  // Managed Postgres (Neon, Supabase) requires TLS; a local container does not.
  const needsSsl = /\bsslmode=require\b/.test(connectionString) ||
    /\.neon\.tech|\.supabase\./.test(connectionString);

  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export function pool(): Pool {
  if (!globalForDb.__cityDashPool) globalForDb.__cityDashPool = createPool();
  return globalForDb.__cityDashPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run `fn` inside a transaction, rolling back if it throws. */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** True if the database is reachable. Used by the /sources health page. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
