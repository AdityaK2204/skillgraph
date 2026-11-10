import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, HttpError, ok } from '@/lib/http';
import { syncUserQuietly } from '@/lib/graph';

// A student may withdraw evidence only while it is still pending review.
export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const { id } = await params;
  const rows = await query(
    `DELETE FROM evidence WHERE evidence_id = $1 AND user_id = $2 AND status = 'pending' RETURNING evidence_id`, [id, me.userId]);
  if (!rows.length) throw new HttpError(409, 'Only your own pending evidence can be withdrawn');
  syncUserQuietly(me.userId);
  return ok({ deleted: true });
});
