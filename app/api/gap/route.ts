import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { handle, ok } from '@/lib/http';

// Gap analysis for the active goal: per-requirement status (view v_goal_gap)
// and the explainable 7-factor ranking (function compute_skill_priorities).
export const GET = handle(async () => {
  const me = await requireUser();
  const goal = await one<{ role_id: number; role_title: string; target_date: string | null }>(
    'SELECT role_id, role_title, target_date FROM v_active_goals WHERE user_id = $1', [me.userId]);
  if (!goal) return ok({ goal: null });

  const [requirements, priorities, weights, summary] = await Promise.all([
    query(`SELECT skill_id, skill_name, category, required_level, importance, claimed_level, verified_level,
                  effective_level, gap, gap_status
             FROM v_goal_gap WHERE user_id = $1 ORDER BY importance DESC, skill_name`, [me.userId]),
    query('SELECT * FROM compute_skill_priorities($1, $2)', [me.userId, goal.role_id]),
    query('SELECT factor, weight, label FROM scoring_weights ORDER BY weight DESC, factor'),
    one(`SELECT goal_readiness($1) AS readiness,
                count(*) FILTER (WHERE gap_status = 'proven')::int  AS proven,
                count(*) FILTER (WHERE gap_status = 'met')::int     AS met,
                count(*) FILTER (WHERE gap_status = 'partial')::int AS partial,
                count(*) FILTER (WHERE gap_status = 'missing')::int AS missing
           FROM v_goal_gap WHERE user_id = $1`, [me.userId]),
  ]);
  return ok({ goal, summary, requirements, priorities, weights });
});
