import { requireUser } from '@/lib/auth';
import { query, tx } from '@/lib/db';
import { body, handle, HttpError, ok, searchParams } from '@/lib/http';
import { prerequisiteSchema } from '@/lib/validation';
import { neo4jAvailable } from '@/lib/neo4j';
import { syncCatalog } from '@/lib/graph';

// Adding an edge that would close a loop is rejected by trigger prereq_no_cycle (the graph stays a DAG).
export const POST = handle(async (req: Request) => {
  const me = await requireUser('admin');
  const p = await body(req, prerequisiteSchema);
  await tx(me.userId, (c) => c.query(
    `INSERT INTO skill_prerequisites (skill_id, prereq_skill_id, strength) VALUES ($1,$2,$3)
     ON CONFLICT (skill_id, prereq_skill_id) DO UPDATE SET strength = EXCLUDED.strength`,
    [p.skillId, p.prereqSkillId, p.strength]));
  if (await neo4jAvailable()) await syncCatalog().catch(() => undefined);
  return ok({ saved: true }, 201);
});

export const DELETE = handle(async (req: Request) => {
  await requireUser('admin');
  const sp = searchParams(req);
  const rows = await query('DELETE FROM skill_prerequisites WHERE skill_id = $1 AND prereq_skill_id = $2 RETURNING 1',
    [Number(sp.get('skillId')), Number(sp.get('prereqSkillId'))]);
  if (!rows.length) throw new HttpError(404, 'Prerequisite not found');
  if (await neo4jAvailable()) await syncCatalog().catch(() => undefined);
  return ok({ deleted: true });
});
