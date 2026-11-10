import { requireUser } from '@/lib/auth';
import { one, query, tx } from '@/lib/db';
import { handle, HttpError, ok } from '@/lib/http';
import { logActivity } from '@/lib/mongo';

export const GET = handle(async () => {
  const me = await requireUser();
  const current = await one<{ roadmap_id: string; version: number; status: string; generated_at: string; role_title: string }>(
    `SELECT r.roadmap_id, r.version, r.status, r.generated_at, cr.title AS role_title
       FROM roadmaps r JOIN goals g USING (goal_id) JOIN career_roles cr ON cr.role_id = g.role_id
      WHERE r.user_id = $1 AND g.status = 'active' AND r.status IN ('active', 'completed')`, [me.userId]);
  const history = await query(
    `SELECT r.roadmap_id, r.version, r.status, r.generated_at, cr.title AS role_title,
            count(i.*)::int AS items, count(i.*) FILTER (WHERE i.status = 'done')::int AS done
       FROM roadmaps r JOIN goals g USING (goal_id) JOIN career_roles cr ON cr.role_id = g.role_id
       LEFT JOIN roadmap_items i USING (roadmap_id)
      WHERE r.user_id = $1 GROUP BY r.roadmap_id, cr.title ORDER BY r.generated_at DESC LIMIT 10`, [me.userId]);
  const items = current ? await query(
    `SELECT i.item_id, i.sequence_no, i.phase, i.priority_score, i.score_breakdown, i.rationale, i.status, i.completed_at,
            s.skill_id, s.name AS skill_name, s.category, s.effort_hours
       FROM roadmap_items i JOIN skills s USING (skill_id)
      WHERE i.roadmap_id = $1 ORDER BY i.sequence_no`, [current.roadmap_id]) : [];
  const hours = await one<{ weekly_hours: number }>('SELECT weekly_hours FROM profiles WHERE user_id = $1', [me.userId]);
  return ok({ current, items, history, weeklyHours: hours?.weekly_hours ?? 8 });
});

// Regenerates the roadmap: stored function generate_roadmap() runs in a transaction
// (archives the old version, inserts the new version and its items atomically).
export const POST = handle(async () => {
  const me = await requireUser();
  try {
    const id = await tx(me.userId, async (c) => (await c.query('SELECT generate_roadmap($1, 12) AS id', [me.userId])).rows[0].id);
    await logActivity(me.userId, 'roadmap_generated', { roadmapId: id });
    return ok({ roadmapId: id }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === 'P0002') throw new HttpError(409, 'Choose a target role first, then generate a roadmap');
    throw err;
  }
});
