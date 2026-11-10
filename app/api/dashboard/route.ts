import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { handle, ok } from '@/lib/http';
import { mongo } from '@/lib/mongo';

// One round-trip for the student dashboard.
export const GET = handle(async () => {
  const me = await requireUser();
  const goal = await one<{ role_id: number; role_title: string; target_date: string | null }>(
    'SELECT role_id, role_title, target_date FROM v_active_goals WHERE user_id = $1', [me.userId]);

  const [counts, readiness, top, roadmap, jobs, byCategory] = await Promise.all([
    one(`SELECT
           (SELECT count(*)::int FROM user_skills WHERE user_id = $1)                                  AS skills,
           (SELECT count(*)::int FROM user_skills WHERE user_id = $1 AND verified_level > 0)           AS verified,
           (SELECT count(*)::int FROM user_skills WHERE user_id = $1 AND claimed_level > verified_level) AS unproven,
           (SELECT count(*)::int FROM projects WHERE user_id = $1)                                     AS projects,
           (SELECT count(*)::int FROM evidence WHERE user_id = $1 AND status = 'pending')               AS pending`, [me.userId]),
    goal ? one('SELECT goal_readiness($1) AS pct', [me.userId]) : null,
    goal ? query('SELECT skill_name, priority, gap, demand, is_direct FROM compute_skill_priorities($1, $2) LIMIT 5', [me.userId, goal.role_id]) : [],
    one(`SELECT r.version, count(i.*)::int AS items, count(i.*) FILTER (WHERE i.status = 'done')::int AS done,
                count(i.*) FILTER (WHERE i.status = 'doing')::int AS doing,
                (SELECT json_build_object('skill', s.name, 'phase', ni.phase, 'rationale', ni.rationale)
                   FROM roadmap_items ni JOIN skills s USING (skill_id)
                  WHERE ni.roadmap_id = r.roadmap_id AND ni.status <> 'done' ORDER BY ni.sequence_no LIMIT 1) AS next_item
           FROM roadmaps r LEFT JOIN roadmap_items i USING (roadmap_id)
          WHERE r.user_id = $1 AND r.status IN ('active', 'completed')
          GROUP BY r.roadmap_id`, [me.userId]),
    query('SELECT job_id, title, company, location, match_score, missing_required FROM match_jobs($1, 3)', [me.userId]),
    query(`SELECT category, count(*)::int AS skills, round(avg(claimed_level), 2) AS claimed, round(avg(verified_level), 2) AS verified
             FROM v_user_skills WHERE user_id = $1 GROUP BY category ORDER BY count(*) DESC, category`, [me.userId]),
  ]);

  let activity: unknown[] = [];
  try {
    activity = await (await mongo()).collection('activity_log')
      .find({ userId: me.userId }, { projection: { _id: 0, type: 1, at: 1 } }).sort({ at: -1 }).limit(6).toArray();
  } catch { /* MongoDB down: dashboard still renders */ }

  return ok({ user: me, goal, counts, readiness: readiness?.pct ?? null, top, roadmap, jobs, byCategory, activity });
});
