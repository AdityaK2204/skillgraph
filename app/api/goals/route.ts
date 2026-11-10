import { requireUser } from '@/lib/auth';
import { query, tx } from '@/lib/db';
import { body, handle, ok } from '@/lib/http';
import { goalSchema } from '@/lib/validation';
import { logActivity } from '@/lib/mongo';
import { refreshProfileEmbedding } from '@/lib/profile';
import { syncUserQuietly } from '@/lib/graph';

export const GET = handle(async () => {
  const me = await requireUser();
  const goals = await query(
    `SELECT g.goal_id, g.role_id, r.title AS role_title, g.target_date, g.status, g.created_at
       FROM goals g JOIN career_roles r USING (role_id) WHERE g.user_id = $1 ORDER BY g.created_at DESC`, [me.userId]);
  return ok(goals);
});

// Setting a goal: the trigger goal_single_active retires the previous active goal,
// then a first roadmap is generated for the new one, all in one transaction.
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  const g = await body(req, goalSchema);
  const roadmapId = await tx(me.userId, async (c) => {
    await c.query(`INSERT INTO goals (user_id, role_id, target_date) VALUES ($1, $2, $3)`, [me.userId, g.roleId, g.targetDate ?? null]);
    const { rows: [r] } = await c.query('SELECT generate_roadmap($1, 12) AS id', [me.userId]);
    return r.id as string;
  });
  await refreshProfileEmbedding(me.userId);
  await logActivity(me.userId, 'goal_set', { roleId: g.roleId });
  syncUserQuietly(me.userId);
  return ok({ roadmapId }, 201);
});
