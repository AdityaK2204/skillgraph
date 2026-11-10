import { requireUser } from '@/lib/auth';
import { tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { userAdminSchema } from '@/lib/validation';

// Change a user's role or deactivate them. Audited by trigger audit_users (actor = this admin).
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser('admin');
  const { id } = await params;
  const change = await body(req, userAdminSchema);
  if (id === me.userId && (change.role && change.role !== 'admin' || change.isActive === false)) {
    throw new HttpError(409, 'You cannot remove your own admin access');
  }
  const user = await tx(me.userId, async (c) => {
    const { rows: [u] } = await c.query(
      `UPDATE users SET role = coalesce($2::user_role, role), is_active = coalesce($3, is_active)
        WHERE user_id = $1 RETURNING user_id, email, role, is_active`, [id, change.role ?? null, change.isActive ?? null]);
    if (!u) throw new HttpError(404, 'User not found');
    // never leave the platform without an active admin
    const { rows: [a] } = await c.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active`);
    if (a.n === 0) throw new HttpError(409, 'At least one active admin is required');
    return u;
  });
  return ok(user);
});
