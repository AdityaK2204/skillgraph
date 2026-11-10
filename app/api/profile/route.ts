import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { body, handle, ok } from '@/lib/http';
import { profileSchema } from '@/lib/validation';
import { refreshProfileEmbedding } from '@/lib/profile';
import { syncUserQuietly } from '@/lib/graph';

export const GET = handle(async () => {
  const me = await requireUser();
  const profile = await one(
    `SELECT p.full_name, p.education_level, p.institution, p.graduation_year, p.interests, p.bio, p.weekly_hours,
            p.embedding IS NOT NULL AS has_embedding, u.email, u.role, u.created_at
       FROM profiles p JOIN users u USING (user_id) WHERE p.user_id = $1`, [me.userId]);
  const goal = await one(`SELECT goal_id, role_id, role_title, target_date FROM v_active_goals WHERE user_id = $1`, [me.userId]);
  return ok({ profile, goal });
});

export const PUT = handle(async (req: Request) => {
  const me = await requireUser();
  const p = await body(req, profileSchema);
  await query(
    `UPDATE profiles SET full_name = $2, education_level = $3, institution = $4, graduation_year = $5,
            interests = $6, bio = $7, weekly_hours = $8
      WHERE user_id = $1`,
    [me.userId, p.fullName, p.educationLevel ?? null, p.institution || null, p.graduationYear ?? null,
     [...new Set(p.interests)], p.bio || null, p.weeklyHours]);
  await refreshProfileEmbedding(me.userId);   // interests changed -> new profile vector
  syncUserQuietly(me.userId);
  return ok({ saved: true });
});
