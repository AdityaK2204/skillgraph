/**
 * npm run embed
 * Recomputes every stored vector with the current EMBEDDING_PROVIDER
 * (needed after switching between minilm and hash, because vectors from
 * different models cannot be compared).
 */
import './_env';
import { pool, query, toVector } from '../lib/db';
import { activeProvider, embed, modelName } from '../lib/embeddings';
import { refreshProfileEmbedding } from '../lib/profile';

async function main() {
  const provider = await activeProvider();
  console.log(`Re-embedding with ${modelName(provider)}`);
  for (const s of await query<{ skill_id: number; name: string; description: string; aliases: string[] }>('SELECT skill_id, name, description, aliases FROM skills')) {
    await query('UPDATE skills SET embedding = $2 WHERE skill_id = $1', [s.skill_id, toVector(await embed(`${s.name}. ${s.description} Also known as: ${s.aliases.join(', ')}.`))]);
  }
  for (const r of await query<{ role_id: number; text: string }>(
    `SELECT r.role_id, r.title || '. ' || r.description || ' Requires ' || string_agg(s.name, ', ' ORDER BY rs.importance DESC) || '.' AS text
       FROM career_roles r JOIN role_skills rs USING (role_id) JOIN skills s USING (skill_id) GROUP BY r.role_id`)) {
    await query('UPDATE career_roles SET embedding = $2 WHERE role_id = $1', [r.role_id, toVector(await embed(r.text))]);
  }
  for (const j of await query<{ job_id: string; text: string }>(
    `SELECT jp.job_id, jp.title || '. ' || jp.description || ' Skills: ' || coalesce(string_agg(s.name, ', '), '') AS text
       FROM job_postings jp LEFT JOIN job_skills js USING (job_id) LEFT JOIN skills s USING (skill_id) GROUP BY jp.job_id`)) {
    await query('UPDATE job_postings SET embedding = $2 WHERE job_id = $1', [j.job_id, toVector(await embed(j.text))]);
  }
  for (const p of await query<{ user_id: string }>('SELECT user_id FROM profiles')) await refreshProfileEmbedding(p.user_id);
  await query(`INSERT INTO app_meta (key, value) VALUES ('embedding_model', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [modelName(provider)]);
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool().end());
