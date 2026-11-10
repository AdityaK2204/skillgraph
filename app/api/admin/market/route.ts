import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { handle, ok } from '@/lib/http';
import { neo4jAvailable } from '@/lib/neo4j';
import { syncCatalog } from '@/lib/graph';

export const GET = handle(async () => {
  await requireUser('admin');
  const meta = await one<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'market_refreshed_at'`);
  const signals = await query(
    `SELECT s.name AS skill_name, ms.demand_score, ms.posting_count
       FROM market_signals ms JOIN skills s USING (skill_id)
      WHERE ms.role_id IS NULL AND ms.snapshot_date = (SELECT max(snapshot_date) FROM market_signals)
      ORDER BY ms.demand_score DESC LIMIT 15`);
  return ok({ refreshedAt: meta?.value ?? null, signals });
});

// Runs the stored procedure refresh_market_signals() and re-projects the catalogue into Neo4j.
export const POST = handle(async () => {
  await requireUser('admin');
  const started = Date.now();
  await query('CALL refresh_market_signals()');
  const counts = await one<{ n: number }>(`SELECT count(*)::int AS n FROM market_signals WHERE snapshot_date = current_date`);
  let graph: unknown = 'skipped (Neo4j not reachable)';
  if (await neo4jAvailable()) graph = await syncCatalog();
  return ok({ signals: counts?.n ?? 0, graph, ms: Date.now() - started });
});
