import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok, searchParams } from '@/lib/http';

// Hybrid matching (function match_jobs): 60% structured skill overlap + 40% pgvector cosine similarity.
export const GET = handle(async (req: Request) => {
  const me = await requireUser();
  const limit = Math.min(Math.max(Number(searchParams(req).get('limit')) || 12, 1), 50);
  return ok(await query('SELECT * FROM match_jobs($1, $2)', [me.userId, limit]));
});
