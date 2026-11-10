import { requireUser } from '@/lib/auth';
import { tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { reviewSchema } from '@/lib/validation';
import { logActivity } from '@/lib/mongo';
import { syncUserQuietly } from '@/lib/graph';

/**
 * Mentor decision. In one transaction:
 *  - evidence_guard trigger checks the reviewer is a mentor/admin and not the owner
 *  - evidence_sync trigger recomputes user_skills.verified_level
 *  - audit_evidence trigger records the change with the mentor as actor
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser('mentor', 'admin');
  const { id } = await params;
  const { decision, note } = await body(req, reviewSchema);
  if (decision === 'rejected' && !note) throw new HttpError(422, 'Add a note explaining what is missing');

  const result = await tx(me.userId, async (c) => {
    const { rows: [e] } = await c.query(
      `UPDATE evidence SET status = $2, reviewed_by = $3, review_note = $4
        WHERE evidence_id = $1 AND status = 'pending'
        RETURNING user_id, skill_id`, [id, decision, me.userId, note ?? null]);
    if (!e) throw new HttpError(409, 'This evidence was already reviewed or withdrawn');
    const { rows: [s] } = await c.query(
      'SELECT claimed_level, verified_level FROM user_skills WHERE user_id = $1 AND skill_id = $2', [e.user_id, e.skill_id]);
    return { studentId: e.user_id as string, skill: s };
  });
  await logActivity(result.studentId, 'evidence_reviewed', { evidenceId: id, decision, by: me.userId });
  syncUserQuietly(result.studentId);
  return ok({ decision, skill: result.skill });
});
