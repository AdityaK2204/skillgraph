import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Maps database and validation errors to HTTP responses with a clear message. */
export function toResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Some fields are invalid', details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) },
      { status: 422 },
    );
  }
  const pg = err as { code?: string; message?: string; constraint?: string; detail?: string };
  // PostgreSQL SQLSTATE codes raised by constraints and triggers
  const map: Record<string, [number, string]> = {
    '23505': [409, 'That record already exists'],
    '23503': [409, 'This record is still referenced by other data'],
    '23514': [422, 'The data breaks a database rule'],
    '23502': [422, 'A required value is missing'],
    '22P02': [400, 'A value has the wrong format'],
    '22023': [400, 'Invalid parameter'],
    '42501': [403, 'Not allowed'],
    'P0002': [404, 'Not found'],
  };
  if (pg?.code && map[pg.code]) {
    const [status, fallback] = map[pg.code];
    // trigger messages are written for users; constraint names are shown for transparency
    const message = pg.code === '23505' || pg.code === '23503' ? fallback : pg.message || fallback;
    return NextResponse.json({ error: message, constraint: pg.constraint ?? null }, { status });
  }
  const msg = (err as Error)?.message ?? 'Unexpected error';
  // a refused connection can arrive as an AggregateError whose message is empty but whose code is set
  const netCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
  const nested = (err as { errors?: Array<{ code?: string }> })?.errors ?? [];
  if (netCodes.includes(pg?.code ?? '') || nested.some((e) => netCodes.includes(e?.code ?? '')) ||
      /ECONNREFUSED|Server selection timed out|getaddrinfo/i.test(msg)) {
    return NextResponse.json({ error: 'A database is not reachable. Check that docker compose is running.' }, { status: 503 });
  }
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 });
}

/** Wraps a route handler so every error becomes a JSON response. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return toResponse(err);
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
  return schema.parse(data);
}

export function searchParams(req: Request) {
  return new URL(req.url).searchParams;
}
