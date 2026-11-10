import { requireUser } from '@/lib/auth';
import { one, tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { importSkillsSchema } from '@/lib/validation';
import { logActivity } from '@/lib/mongo';
import { refreshProfileEmbedding } from '@/lib/profile';
import { syncUserQuietly } from '@/lib/graph';

/**
 * Imports the skills the user confirmed from a parsed resume, in ONE transaction:
 * either every selected skill is saved or none is. Imported levels are claims;
 * an existing higher claim or verified level is never lowered.
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const { id } = await params;
  const data = await body(req, importSkillsSchema);
  const owns = await one('SELECT 1 FROM resumes WHERE resume_id = $1 AND user_id = $2', [id, me.userId]);
  if (!owns) throw new HttpError(404, 'Resume not found');

  const saved = await tx(me.userId, async (c) => {
    let n = 0;
    for (const s of data.skills) {
      const r = await c.query(
        `INSERT INTO user_skills (user_id, skill_id, claimed_level, source) VALUES ($1, $2, $3, 'resume')
         ON CONFLICT (user_id, skill_id) DO UPDATE
           SET claimed_level = GREATEST(user_skills.claimed_level, EXCLUDED.claimed_level)`,
        [me.userId, s.skillId, s.claimedLevel]);
      n += r.rowCount ?? 0;
    }
    if (data.applyProfile?.educationLevel) {
      await c.query(`UPDATE profiles SET education_level = coalesce(education_level, $2) WHERE user_id = $1`,
        [me.userId, data.applyProfile.educationLevel]);
    }
    return n;
  });
  await refreshProfileEmbedding(me.userId);
  await logActivity(me.userId, 'skills_imported', { resumeId: id, count: saved });
  syncUserQuietly(me.userId);
  return ok({ imported: saved });
});
