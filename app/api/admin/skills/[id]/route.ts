import { requireUser } from '@/lib/auth';
import { tx, toVector } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { skillCatalogSchema } from '@/lib/validation';
import { embed } from '@/lib/embeddings';
import { neo4jAvailable } from '@/lib/neo4j';
import { syncCatalog } from '@/lib/graph';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('admin');
  const id = Number((await params).id);
  const s = await body(req, skillCatalogSchema);
  const vector = toVector(await embed(`${s.name}. ${s.description} Also known as: ${s.aliases.join(', ')}.`));
  await tx(me.userId, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE skills SET name = $2, category = $3, description = $4, aliases = $5, effort_hours = $6, embedding = $7 WHERE skill_id = $1`,
      [id, s.name, s.category, s.description, s.aliases.map((a) => a.toLowerCase()), s.effortHours, vector]);
    if (!rowCount) throw new HttpError(404, 'Skill not found');
  });
  if (await neo4jAvailable()) await syncCatalog().catch(() => undefined);
  return ok({ saved: true });
});

// FK ON DELETE RESTRICT protects skills that roles, users, jobs or roadmaps still reference.
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('admin');
  const id = Number((await params).id);
  try {
    await tx(me.userId, async (c) => {
      const { rowCount } = await c.query('DELETE FROM skills WHERE skill_id = $1', [id]);
      if (!rowCount) throw new HttpError(404, 'Skill not found');
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23503') {
      throw new HttpError(409, `This skill is still used (${(err as { table?: string }).table ?? 'other records'}). Remove those references first.`);
    }
    throw err;
  }
  if (await neo4jAvailable()) await syncCatalog().catch(() => undefined);
  return ok({ deleted: true });
});
