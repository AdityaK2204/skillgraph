import neo4j, { type Driver } from 'neo4j-driver';
import { env } from './env';

const g = globalThis as unknown as { __sgNeo?: Driver; __sgNeoOk?: { ok: boolean; at: number } };

export function driver(): Driver {
  if (!g.__sgNeo) {
    const e = env();
    g.__sgNeo = neo4j.driver(e.NEO4J_URI, neo4j.auth.basic(e.NEO4J_USER, e.NEO4J_PASSWORD), {
      connectionTimeout: 3000,
      maxConnectionPoolSize: 20,
      disableLosslessIntegers: true,
    });
  }
  return g.__sgNeo;
}

/** Cached health check (30 s) so a missing Neo4j does not slow every request. */
export async function neo4jAvailable(): Promise<boolean> {
  const now = Date.now();
  if (g.__sgNeoOk && now - g.__sgNeoOk.at < 30_000) return g.__sgNeoOk.ok;
  let ok = false;
  try {
    if (env().NEO4J_PASSWORD) {
      await driver().getServerInfo();
      ok = true;
    }
  } catch {
    ok = false;
  }
  g.__sgNeoOk = { ok, at: now };
  return ok;
}

export async function cypher<T = Record<string, unknown>>(q: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const res = await driver().executeQuery(q, params, { database: 'neo4j' });
  return res.records.map((r) => r.toObject() as T);
}

export async function closeNeo4j() {
  await g.__sgNeo?.close();
  g.__sgNeo = undefined;
}
