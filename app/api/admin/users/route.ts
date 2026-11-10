import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, ok, searchParams } from '@/lib/http';

export const GET = handle(async (req: Request) => {
  await requireUser('admin');
  const sp = searchParams(req);
  const q = (sp.get('q') ?? '').trim() || null;
  const role = ['student', 'mentor', 'admin'].includes(sp.get('role') ?? '') ? sp.get('role') : null;
  return ok(await query(
    `SELECT o.*, goal_readiness(o.user_id) AS readiness
       FROM v_student_overview o
      WHERE ($1::text IS NULL OR o.full_name ILIKE '%' || $1 || '%' OR o.email::text ILIKE '%' || $1 || '%')
        AND ($2::user_role IS NULL OR o.role = $2::user_role)
      ORDER BY o.role, o.full_name`, [q, role]));
});
