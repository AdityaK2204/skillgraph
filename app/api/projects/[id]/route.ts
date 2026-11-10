import { requireUser } from '@/lib/auth';
import { tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { projectSchema } from '@/lib/validation';
import { syncUserQuietly } from '@/lib/graph';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const { id } = await params;
  const p = await body(req, projectSchema);
  await tx(me.userId, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE projects SET title = $3, description = $4, repo_url = $5, started_on = $6, completed_on = $7
        WHERE project_id = $1 AND user_id = $2`,
      [id, me.userId, p.title, p.description || null, p.repoUrl ?? null, p.startedOn ?? null, p.completedOn ?? null]);
    if (!rowCount) throw new HttpError(404, 'Project not found');
    await c.query('DELETE FROM project_skills WHERE project_id = $1 AND skill_id <> ALL($2::int[])', [id, p.skillIds]);
    await c.query(
      `INSERT INTO project_skills (project_id, skill_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`, [id, p.skillIds]);
  });
  syncUserQuietly(me.userId);
  return ok({ saved: true });
});

// Evidence that points at the project keeps its link (ON DELETE SET NULL) only if it also has a URL;
// chk_has_backing then blocks the delete, and the user is told why.
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const { id } = await params;
  try {
    await tx(me.userId, async (c) => {
      const { rowCount } = await c.query('DELETE FROM projects WHERE project_id = $1 AND user_id = $2', [id, me.userId]);
      if (!rowCount) throw new HttpError(404, 'Project not found');
    });
  } catch (err) {
    if ((err as { constraint?: string }).constraint === 'chk_has_backing') {
      throw new HttpError(409, 'Evidence relies on this project and has no link of its own. Add a URL to that evidence or delete it first.');
    }
    throw err;
  }
  syncUserQuietly(me.userId);
  return ok({ deleted: true });
});
