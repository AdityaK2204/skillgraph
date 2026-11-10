import { requireUser } from '@/lib/auth';
import { query, tx } from '@/lib/db';
import { body, handle, HttpError, ok, searchParams } from '@/lib/http';
import { userSkillSchema } from '@/lib/validation';
import { refreshProfileEmbedding } from '@/lib/profile';
import { syncUserQuietly } from '@/lib/graph';

export const GET = handle(async () => {
  const me = await requireUser();
  const rows = await query(
    `SELECT v.skill_id, v.skill_name, v.category, v.claimed_level, v.verified_level, v.effective_level,
            v.unproven_claim, v.source, v.updated_at,
            (SELECT count(*)::int FROM evidence e WHERE e.user_id = v.user_id AND e.skill_id = v.skill_id AND e.status = 'pending') AS pending_evidence,
            rs.required_level AS required_for_goal
       FROM v_user_skills v
       LEFT JOIN v_active_goals ag ON ag.user_id = v.user_id
       LEFT JOIN role_skills rs ON rs.role_id = ag.role_id AND rs.skill_id = v.skill_id
      WHERE v.user_id = $1
      ORDER BY v.effective_level DESC, v.skill_name`, [me.userId]);
  return ok(rows);
});

// Upsert a self-declared claim. verified_level is never set here: only reviewed evidence changes it.
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  const s = await body(req, userSkillSchema);
  await tx(me.userId, (c) => c.query(
    `INSERT INTO user_skills (user_id, skill_id, claimed_level, source) VALUES ($1, $2, $3, 'self')
     ON CONFLICT (user_id, skill_id) DO UPDATE
       SET claimed_level = GREATEST(EXCLUDED.claimed_level, user_skills.verified_level),
           source = CASE WHEN user_skills.source = 'evidence' THEN 'evidence' ELSE 'self' END`,
    [me.userId, s.skillId, s.claimedLevel]));
  await refreshProfileEmbedding(me.userId);
  syncUserQuietly(me.userId);
  return ok({ saved: true });
});

export const DELETE = handle(async (req: Request) => {
  const me = await requireUser();
  const skillId = Number(searchParams(req).get('skillId'));
  if (!Number.isInteger(skillId) || skillId <= 0) throw new HttpError(400, 'skillId is required');
  const rows = await query(
    `DELETE FROM user_skills us WHERE us.user_id = $1 AND us.skill_id = $2
       AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.user_id = us.user_id AND e.skill_id = us.skill_id AND e.status = 'verified')
     RETURNING skill_id`, [me.userId, skillId]);
  if (!rows.length) throw new HttpError(409, 'This skill has verified evidence and cannot be removed');
  await refreshProfileEmbedding(me.userId);
  syncUserQuietly(me.userId);
  return ok({ deleted: true });
});
