import { cookies } from 'next/headers';
import { tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { hashPassword } from '@/lib/password';
import { registerSchema } from '@/lib/validation';
import { signSession, SESSION_COOKIE } from '@/lib/session';
import { env } from '@/lib/env';

// Self-registration always creates a student. Mentor and admin roles are granted by an admin.
export const POST = handle(async (req: Request) => {
  const { fullName, email, password } = await body(req, registerSchema);
  const hash = await hashPassword(password);
  let userId: string;
  try {
    userId = await tx(null, async (c) => {
      const { rows: [u] } = await c.query(
        `INSERT INTO users (email, password_hash, role, last_login_at) VALUES ($1, $2, 'student', now()) RETURNING user_id`, [email, hash]);
      await c.query('INSERT INTO profiles (user_id, full_name) VALUES ($1, $2)', [u.user_id, fullName]);
      return u.user_id as string;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
  const token = await signSession({ sub: userId, role: 'student', name: fullName }, env().SESSION_HOURS);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: env().SESSION_HOURS * 3600,
  });
  return ok({ userId, role: 'student' }, 201);
});
