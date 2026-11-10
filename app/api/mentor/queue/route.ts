import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok } from '@/lib/http';

// Pending evidence (view v_evidence_queue; partial index ix_evidence_pending) + recent decisions.
export const GET = handle(async () => {
  const me = await requireUser('mentor', 'admin');
  const [queue, recent] = await Promise.all([
    query('SELECT * FROM v_evidence_queue WHERE user_id <> $1 ORDER BY submitted_at', [me.userId]),
    query(`SELECT e.evidence_id, e.title, e.status, e.reviewed_at, e.review_note, s.name AS skill_name, p.full_name AS student_name
             FROM evidence e JOIN skills s USING (skill_id) LEFT JOIN profiles p ON p.user_id = e.user_id
            WHERE e.reviewed_by = $1 ORDER BY e.reviewed_at DESC LIMIT 10`, [me.userId]),
  ]);
  return ok({ queue, recent });
});
