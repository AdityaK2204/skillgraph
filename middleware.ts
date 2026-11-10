import { NextResponse, type NextRequest } from 'next/server';
import { readSession, SESSION_COOKIE } from './lib/session';

// Route protection. API handlers re-check the role against the database as well.
const PUBLIC = ['/login', '/register', '/api/auth/login', '/api/auth/register', '/api/health'];
const ROLE_PREFIXES: Array<[string, string[]]> = [
  ['/admin', ['admin']],
  ['/api/admin', ['admin']],
  ['/mentor', ['mentor', 'admin']],
  ['/api/mentor', ['mentor', 'admin']],
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith('/api/');

  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const rule = ROLE_PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
  if (rule && !rule[1].includes(session.role)) {
    if (isApi) return NextResponse.json({ error: 'Not allowed for your role' }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
