import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok, searchParams } from '@/lib/http';

export const GET = handle(async (req: Request) => {
  await requireUser('admin');
  const table = searchParams(req).get('table') || null;
  return ok(await query(
    `SELECT a.audit_id, a.changed_at, a.table_name, a.operation, a.row_pk, u.email AS actor,
            a.old_data, a.new_data
       FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
      WHERE ($1::text IS NULL OR a.table_name = $1)
      ORDER BY a.audit_id DESC LIMIT 40`, [table]));
});
