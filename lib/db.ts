import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env';

// One pool per process (cached on globalThis so dev hot-reload does not leak connections)
const g = globalThis as unknown as { __sgPool?: Pool };

export function pool(): Pool {
  if (!g.__sgPool) {
    g.__sgPool = new Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  }
  return g.__sgPool;
}

/** Parameterised query. Values are always sent separately from the SQL text (no injection). */
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Runs fn inside BEGIN … COMMIT, rolling back on any error.
 * The acting user is recorded with SET LOCAL so the audit trigger can attribute changes.
 */
export async function tx<T>(actorId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    if (actorId) await client.query(`SELECT set_config('app.user_id', $1, true)`, [actorId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** pgvector literal: [0.1,0.2,...] */
export function toVector(v: number[] | null | undefined): string | null {
  return v && v.length ? `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]` : null;
}
