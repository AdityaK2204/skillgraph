import { cookies } from 'next/headers';
import { one } from './db';
import { HttpError } from './http';
import { readSession, SESSION_COOKIE, type Role } from './session';

export { hashPassword, verifyPassword } from './password';

export interface CurrentUser {
  userId: string;
  email: string;
  role: Role;
  fullName: string;
}

/**
 * Resolves the signed-in user. The JWT proves identity; the role is re-read from
 * PostgreSQL on every request so a role change or deactivation applies immediately.
 */
export async function requireUser(...allowed: Role[]): Promise<CurrentUser> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await readSession(token);
  if (!claims) throw new HttpError(401, 'Please sign in');

  const row = await one<{ user_id: string; email: string; role: Role; is_active: boolean; full_name: string | null }>(
    `SELECT u.user_id, u.email, u.role, u.is_active, p.full_name
       FROM users u LEFT JOIN profiles p USING (user_id)
      WHERE u.user_id = $1`,
    [claims.sub],
  );
  if (!row || !row.is_active) throw new HttpError(401, 'This account is not active');
  if (allowed.length && !allowed.includes(row.role)) {
    throw new HttpError(403, `This action needs one of these roles: ${allowed.join(', ')}`);
  }
  return { userId: row.user_id, email: row.email, role: row.role, fullName: row.full_name ?? row.email };
}
