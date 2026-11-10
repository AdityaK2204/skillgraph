import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok } from '@/lib/http';

// Career roles, with how many postings and requirements each has, and how close the user's profile is (pgvector)
export const GET = handle(async () => {
  const me = await requireUser();
  const roles = await query(
    `SELECT r.role_id, r.title, r.domain, r.seniority, r.description,
            count(DISTINCT rs.skill_id)::int AS requirements,
            (SELECT count(*)::int FROM job_postings jp WHERE jp.role_id = r.role_id AND jp.is_active) AS postings,
            round(CASE WHEN p.embedding IS NULL OR r.embedding IS NULL THEN NULL
                       ELSE (1 - (r.embedding <=> p.embedding))::numeric END, 3) AS profile_fit,
            json_agg(json_build_object('skill', s.name, 'level', rs.required_level, 'importance', rs.importance)
                     ORDER BY rs.importance DESC, s.name) AS skills
       FROM career_roles r
       JOIN role_skills rs USING (role_id)
       JOIN skills s       USING (skill_id)
       LEFT JOIN profiles p ON p.user_id = $1
      GROUP BY r.role_id, p.embedding
      ORDER BY profile_fit DESC NULLS LAST, r.title`, [me.userId]);
  return ok(roles);
});
