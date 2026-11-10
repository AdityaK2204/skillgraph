import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { handle, ok } from '@/lib/http';
import { mongoAnalytics } from '@/lib/mongo-analytics';
import { neo4jAvailable } from '@/lib/neo4j';

// Platform analytics: SQL aggregates (PostgreSQL) side by side with aggregation pipelines (MongoDB).
export const GET = handle(async () => {
  await requireUser('admin');
  const [totals, roles, funnel, supplyDemand, readiness] = await Promise.all([
    one(`SELECT (SELECT count(*)::int FROM users WHERE role = 'student') AS students,
                (SELECT count(*)::int FROM users WHERE role = 'mentor')  AS mentors,
                (SELECT count(*)::int FROM job_postings WHERE is_active) AS jobs,
                (SELECT count(*)::int FROM skills)                       AS skills,
                (SELECT count(*)::int FROM evidence WHERE status = 'pending') AS pending_evidence,
                (SELECT count(*)::int FROM roadmaps WHERE status IN ('active','completed')) AS roadmaps`),
    // GROUP BY + HAVING-style rollup: which roles students aim for, with average readiness
    query(`SELECT ag.role_title, count(*)::int AS students, round(avg(goal_readiness(ag.user_id)), 1) AS avg_readiness
             FROM v_active_goals ag GROUP BY ag.role_title ORDER BY students DESC, ag.role_title`),
    query(`SELECT status, count(*)::int AS n FROM evidence GROUP BY status ORDER BY status`),
    query(`SELECT skill_name, category, postings, learners, roles_requiring
             FROM mv_skill_demand WHERE postings > 0 ORDER BY postings DESC, learners ASC LIMIT 12`),
    query(`SELECT width_bucket(goal_readiness(user_id), 0, 100, 5) AS bucket, count(*)::int AS students
             FROM v_active_goals GROUP BY 1 ORDER BY 1`),
  ]);
  let mongoStats: unknown = null;
  try { mongoStats = await mongoAnalytics(); } catch (err) { mongoStats = { error: (err as Error).message }; }
  return ok({ totals, roles, funnel, supplyDemand, readiness, mongo: mongoStats, neo4j: await neo4jAvailable() });
});
