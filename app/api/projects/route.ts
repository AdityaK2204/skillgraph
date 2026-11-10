import { requireUser } from '@/lib/auth';
import { query, tx } from '@/lib/db';
import { body, handle, ok } from '@/lib/http';
import { projectSchema } from '@/lib/validation';
import { syncUserQuietly } from '@/lib/graph';

export const GET = handle(async () => {
  const me = await requireUser();
  return ok(await query(
    `SELECT p.project_id, p.title, p.description, p.repo_url, p.started_on, p.completed_on, p.created_at,
            coalesce(json_agg(json_build_object('skillId', s.skill_id, 'name', s.name) ORDER BY s.name)
                     FILTER (WHERE s.skill_id IS NOT NULL), '[]') AS skills,
            (SELECT count(*)::int FROM evidence e WHERE e.project_id = p.project_id) AS evidence_count
       FROM projects p
       LEFT JOIN project_skills ps USING (project_id)
       LEFT JOIN skills s USING (skill_id)
      WHERE p.user_id = $1
      GROUP BY p.project_id
      ORDER BY coalesce(p.completed_on, p.started_on, p.created_at::date) DESC`, [me.userId]));
});

export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  const p = await body(req, projectSchema);
  const projectId = await tx(me.userId, async (c) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO projects (user_id, title, description, repo_url, started_on, completed_on)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING project_id`,
      [me.userId, p.title, p.description || null, p.repoUrl ?? null, p.startedOn ?? null, p.completedOn ?? null]);
    if (p.skillIds.length) {
      await c.query('INSERT INTO project_skills (project_id, skill_id) SELECT $1, unnest($2::int[])', [row.project_id, p.skillIds]);
    }
    return row.project_id as string;
  });
  syncUserQuietly(me.userId);
  return ok({ projectId }, 201);
});
