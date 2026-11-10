import { requireUser } from '@/lib/auth';
import { query, tx } from '@/lib/db';
import { body, handle, ok } from '@/lib/http';
import { evidenceSchema } from '@/lib/validation';
import { logActivity } from '@/lib/mongo';
import { syncUserQuietly } from '@/lib/graph';

export const GET = handle(async () => {
  const me = await requireUser();
  return ok(await query(
    `SELECT e.evidence_id, e.kind, e.title, e.url, e.demonstrated_level, e.status, e.review_note,
            e.submitted_at, e.reviewed_at, s.skill_id, s.name AS skill_name, p.title AS project_title,
            rp.full_name AS reviewer_name
       FROM evidence e
       JOIN skills s USING (skill_id)
       LEFT JOIN projects p ON p.project_id = e.project_id
       LEFT JOIN profiles rp ON rp.user_id = e.reviewed_by
      WHERE e.user_id = $1
      ORDER BY e.submitted_at DESC`, [me.userId]));
});

// Submitting evidence never changes verified_level by itself: it waits for a mentor (status 'pending').
// The trigger evidence_guard checks that a referenced project belongs to the same student.
export const POST = handle(async (req: Request) => {
  const me = await requireUser('student', 'admin');
  const e = await body(req, evidenceSchema);
  const id = await tx(me.userId, async (c) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO evidence (user_id, skill_id, project_id, kind, title, url, demonstrated_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING evidence_id`,
      [me.userId, e.skillId, e.projectId ?? null, e.kind, e.title, e.url ?? null, e.demonstratedLevel]);
    // make sure the claim exists so the skill shows up as "claimed, awaiting proof"
    await c.query(
      `INSERT INTO user_skills (user_id, skill_id, claimed_level, source) VALUES ($1,$2,$3,'self')
       ON CONFLICT (user_id, skill_id) DO NOTHING`, [me.userId, e.skillId, e.demonstratedLevel]);
    return row.evidence_id as string;
  });
  await logActivity(me.userId, 'evidence_submitted', { evidenceId: id, skillId: e.skillId });
  syncUserQuietly(me.userId);
  return ok({ evidenceId: id }, 201);
});
