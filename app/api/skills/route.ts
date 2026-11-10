import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok, searchParams } from '@/lib/http';

/**
 * Skill catalogue search.
 *  q        full-text search (GIN index on skills.search_tsv), with a trigram
 *           "did you mean" fallback (pg_trgm) when nothing matches exactly
 *  category filter
 */
export const GET = handle(async (req: Request) => {
  await requireUser();
  const sp = searchParams(req);
  const q = (sp.get('q') ?? '').trim().slice(0, 80);
  const category = sp.get('category') || null;

  if (!q) {
    return ok({ mode: 'all', skills: await query(
      `SELECT d.skill_id, d.skill_name AS name, d.category, s.effort_hours, s.description, d.postings, d.roles_requiring
         FROM mv_skill_demand d JOIN skills s USING (skill_id)
        WHERE ($1::text IS NULL OR d.category = $1)
        ORDER BY d.category, d.skill_name`, [category]) });
  }

  const fts = await query(
    `SELECT s.skill_id, s.name, s.category, s.effort_hours, s.description,
            ts_rank(s.search_tsv, websearch_to_tsquery('english', $1)) AS rank
       FROM skills s
      WHERE (s.search_tsv @@ websearch_to_tsquery('english', $1)
             OR s.name ILIKE '%' || $1 || '%'
             OR EXISTS (SELECT 1 FROM unnest(s.aliases) a WHERE a ILIKE $1 || '%'))
        AND ($2::text IS NULL OR s.category = $2)
      ORDER BY (lower(s.name) = lower($1)) DESC, rank DESC, s.name
      LIMIT 30`, [q, category]);
  if (fts.length) return ok({ mode: 'search', skills: fts });

  const fuzzy = await query(
    `SELECT skill_id, name, category, effort_hours, description, round(similarity(name, $1)::numeric, 2) AS similarity
       FROM skills WHERE similarity(name, $1) > 0.2 AND ($2::text IS NULL OR category = $2)
      ORDER BY similarity DESC LIMIT 5`, [q, category]);
  return ok({ mode: 'did-you-mean', skills: fuzzy });
});
