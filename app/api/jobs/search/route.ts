import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok, searchParams } from '@/lib/http';

/**
 * Job search with full-text ranking (GIN on job_postings.search_tsv) and filters,
 * plus facet counts (GROUP BY) for the filter sidebar.
 */
export const GET = handle(async (req: Request) => {
  await requireUser();
  const sp = searchParams(req);
  const q = (sp.get('q') ?? '').trim().slice(0, 100) || null;
  const mode = ['onsite', 'remote', 'hybrid'].includes(sp.get('mode') ?? '') ? sp.get('mode') : null;
  const roleId = Number(sp.get('roleId')) || null;
  const location = (sp.get('location') ?? '').trim().slice(0, 60) || null;
  const minSalary = Number(sp.get('minSalary')) || null;
  const sort = sp.get('sort') === 'salary' ? 'salary' : sp.get('sort') === 'recent' || !q ? 'recent' : 'relevance';
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const size = 10;

  const params = [q, mode, roleId, location, minSalary];
  const where = `
      jp.is_active
  AND ($1::text IS NULL OR jp.search_tsv @@ websearch_to_tsquery('english', $1))
  AND ($2::text IS NULL OR jp.work_mode = $2)
  AND ($3::int  IS NULL OR jp.role_id = $3)
  AND ($4::text IS NULL OR jp.location ILIKE '%' || $4 || '%')
  AND ($5::numeric IS NULL OR jp.salary_max_lpa >= $5)`;

  const order = sort === 'salary' ? 'jp.salary_max_lpa DESC NULLS LAST, jp.posted_at DESC'
    : sort === 'recent' ? 'jp.posted_at DESC'
    : 'rank DESC, jp.posted_at DESC';

  const rows = await query(
    `SELECT jp.job_id, jp.title, jp.company, jp.location, jp.work_mode, jp.salary_min_lpa, jp.salary_max_lpa, jp.posted_at,
            cr.title AS role_title,
            CASE WHEN $1::text IS NULL THEN 0 ELSE ts_rank(jp.search_tsv, websearch_to_tsquery('english', $1)) END AS rank,
            CASE WHEN $1::text IS NULL THEN NULL
                 ELSE ts_headline('english', jp.description, websearch_to_tsquery('english', $1),
                                  'MaxWords=28, MinWords=12, StartSel=<mark>, StopSel=</mark>') END AS snippet,
            (SELECT array_agg(s.name ORDER BY js.is_required DESC, s.name) FROM job_skills js JOIN skills s USING (skill_id)
              WHERE js.job_id = jp.job_id) AS skills,
            count(*) OVER () AS total
       FROM job_postings jp LEFT JOIN career_roles cr ON cr.role_id = jp.role_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${size} OFFSET ${(page - 1) * size}`, params);

  const facets = await query(
    `SELECT 'mode' AS facet, jp.work_mode AS value, count(*)::int AS n FROM job_postings jp WHERE ${where} GROUP BY jp.work_mode
     UNION ALL
     SELECT 'role', cr.title, count(*)::int FROM job_postings jp JOIN career_roles cr ON cr.role_id = jp.role_id
      WHERE ${where} GROUP BY cr.title HAVING count(*) > 0
     ORDER BY 1, 3 DESC`, params);

  return ok({ total: Number(rows[0]?.total ?? 0), page, pageSize: size, sort, jobs: rows.map(({ total: _t, ...r }) => r), facets });
});
