import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session';

export const POST = handle(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return ok({ signedOut: true });
});
