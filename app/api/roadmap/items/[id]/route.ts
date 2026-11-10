import { requireUser } from '@/lib/auth';
import { tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { itemStatusSchema } from '@/lib/validation';
import { logActivity } from '@/lib/mongo';

// Item progress; triggers stamp completed_at and roll the roadmap up to 'completed'.
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const { id } = await params;
  const { status } = await body(req, itemStatusSchema);
  const roadmapStatus = await tx(me.userId, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE roadmap_items i SET status = $3
         FROM roadmaps r
        WHERE i.item_id = $1 AND r.roadmap_id = i.roadmap_id AND r.user_id = $2 AND r.status IN ('active', 'completed')`,
      [id, me.userId, status]);
    if (!rowCount) throw new HttpError(404, 'Roadmap item not found on your current roadmap');
    const { rows: [r] } = await c.query(
      'SELECT r.status FROM roadmaps r JOIN roadmap_items i USING (roadmap_id) WHERE i.item_id = $1', [id]);
    return r.status as string;
  });
  if (status === 'done') await logActivity(me.userId, 'item_completed', { itemId: id });
  return ok({ status, roadmapStatus });
});
