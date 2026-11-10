import { SignJWT, jwtVerify } from 'jose';

// Edge-safe session helpers (used by middleware and route handlers).
export const SESSION_COOKIE = 'sg_session';
export type Role = 'student' | 'mentor' | 'admin';
export interface SessionClaims {
  sub: string;
  role: Role;
  name: string;
}

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims, hours: number) {
  return new SignJWT({ role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .setIssuer('skillgraph')
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'skillgraph', algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: payload.role as Role, name: String(payload.name ?? '') };
  } catch {
    return null;
  }
}
