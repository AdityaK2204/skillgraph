import { one, query, toVector } from './db';
import { embed } from './embeddings';

/**
 * The profile vector describes the person: interests, bio, target role and current skills.
 * It drives the "interest" factor of the priority score and semantic job matching.
 */
export async function refreshProfileEmbedding(userId: string): Promise<void> {
  const p = await one<{ bio: string | null; interests: string[]; role_title: string | null }>(
    `SELECT p.bio, p.interests, ag.role_title
       FROM profiles p LEFT JOIN v_active_goals ag USING (user_id) WHERE p.user_id = $1`, [userId]);
  if (!p) return;
  const skills = await query<{ skill_name: string }>(
    `SELECT skill_name FROM v_user_skills WHERE user_id = $1 ORDER BY effective_level DESC LIMIT 15`, [userId]);
  const text = [
    p.role_title ? `Aspiring ${p.role_title}.` : '',
    p.interests.length ? `Interested in ${p.interests.join(', ')}.` : '',
    p.bio ?? '',
    skills.length ? `Skills: ${skills.map((s) => s.skill_name).join(', ')}.` : '',
  ].join(' ');
  await query('UPDATE profiles SET embedding = $2 WHERE user_id = $1', [userId, toVector(await embed(text))]);
}
