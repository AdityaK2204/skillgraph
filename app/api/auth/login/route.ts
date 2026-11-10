import { cookies } from 'next/headers';
import { one, query } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { verifyPassword } from '@/lib/password';
import { loginSchema } from '@/lib/validation';
import { signSession, SESSION_COOKIE, type Role } from '@/lib/session';
import { env } from '@/lib/env';
import { logActivity } from '@/lib/mongo';

// a real bcrypt hash of a random string: comparing against it when the email is unknown
// keeps response time the same, so the endpoint does not reveal which emails exist
const DUMMY_HASH = '$2b$12$4u/hAGwUSFK2qsKxyh29MOYwEqq51Dbl2ZLNiV/ukNRQUdP3O.0Y.';

// simple per-IP throttle: at most 8 failed attempts per 5 minutes
const failures = new Map<string, { n: number; since: number }>();
function checkThrottle(ip: string) {
  const f = failures.get(ip);
  if (f && Date.now() - f.since > 5 * 60_000) failures.delete(ip);
  else if (f && f.n >= 8) throw new HttpError(429, 'Too many failed sign-in attempts. Wait a few minutes and try again.');
}
function recordFailure(ip: string) {
  const f = failures.get(ip);
  if (f) f.n++;
  else failures.set(ip, { n: 1, since: Date.now() });
}

export const POST = handle(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  checkThrottle(ip);
  const { email, password } = await body(req, loginSchema);

  const user = await one<{ user_id: string; password_hash: string; role: Role; is_active: boolean; full_name: string | null }>(
    `SELECT u.user_id, u.password_hash, u.role, u.is_active, p.full_name
       FROM users u LEFT JOIN profiles p USING (user_id) WHERE u.email = $1`, [email]);
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) {
    recordFailure(ip);
    throw new HttpError(401, 'Email or password is incorrect');
  }
  failures.delete(ip);
  if (!user.is_active) throw new HttpError(403, 'This account has been deactivated');

  await query('UPDATE users SET last_login_at = now() WHERE user_id = $1', [user.user_id]);
  const token = await signSession({ sub: user.user_id, role: user.role, name: user.full_name ?? email }, env().SESSION_HOURS);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: env().SESSION_HOURS * 3600,
  });
  await logActivity(user.user_id, 'login');
  return ok({ userId: user.user_id, role: user.role, name: user.full_name });
});
