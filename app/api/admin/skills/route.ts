import { requireUser } from '@/lib/auth';
import { query, tx, toVector } from '@/lib/db';
import { body, handle, ok } from '@/lib/http';
import { skillCatalogSchema } from '@/lib/validation';
import { embed } from '@/lib/embeddings';
import { neo4jAvailable } from '@/lib/neo4j';
import { syncCatalog } from '@/lib/graph';

export const GET = handle(async () => {
  await requireUser('admin');
  return ok(await query(
    `SELECT s.skill_id, s.name, s.category, s.description, s.aliases, s.effort_hours,
            d.postings, d.roles_requiring, d.learners,
            coalesce((SELECT json_agg(json_build_object('id', p.skill_id, 'name', p.name, 'strength', sp.strength) ORDER BY p.name)
                        FROM skill_prerequisites sp JOIN skills p ON p.skill_id = sp.prereq_skill_id
                       WHERE sp.skill_id = s.skill_id), '[]') AS prerequisites
       FROM skills s LEFT JOIN mv_skill_demand d USING (skill_id)
      ORDER BY s.category, s.name`));
});

export const POST = handle(async (req: Request) => {
  const me = await requireUser('admin');
  const s = await body(req, skillCatalogSchema);
  const vector = toVector(await embed(`${s.name}. ${s.description} Also known as: ${s.aliases.join(', ')}.`));
  const id = await tx(me.userId, async (c) => (await c.query(
    `INSERT INTO skills (name, category, description, aliases, effort_hours, embedding)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING skill_id`,
    [s.name, s.category, s.description, s.aliases.map((a) => a.toLowerCase()), s.effortHours, vector])).rows[0].skill_id);
  if (await neo4jAvailable()) await syncCatalog().catch(() => undefined);
  return ok({ skillId: id }, 201);
});
