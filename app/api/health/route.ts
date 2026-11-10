import { one } from '@/lib/db';
import { mongo } from '@/lib/mongo';
import { neo4jAvailable } from '@/lib/neo4j';
import { ok } from '@/lib/http';

// Reports which of the three databases are reachable (no data, no credentials).
export async function GET() {
  const status: Record<string, string> = {};
  try { await one('SELECT 1'); status.postgres = 'up'; } catch { status.postgres = 'down'; }
  try { await (await mongo()).command({ ping: 1 }); status.mongodb = 'up'; } catch { status.mongodb = 'down'; }
  status.neo4j = (await neo4jAvailable()) ? 'up' : 'down (PostgreSQL fallback active)';
  return ok(status, status.postgres === 'up' ? 200 : 503);
}
