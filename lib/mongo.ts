import { MongoClient, type Db } from 'mongodb';
import { env } from './env';

const g = globalThis as unknown as { __sgMongo?: Promise<MongoClient> };

export async function mongo(): Promise<Db> {
  if (!g.__sgMongo) {
    const client = new MongoClient(env().MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
    g.__sgMongo = client.connect().catch((err) => {
      g.__sgMongo = undefined; // allow a retry on the next request
      throw err;
    });
  }
  const client = await g.__sgMongo;
  return client.db(env().MONGODB_DB);
}

export async function closeMongo() {
  if (g.__sgMongo) {
    const c = await g.__sgMongo.catch(() => null);
    await c?.close();
    g.__sgMongo = undefined;
  }
}

export type ActivityType =
  | 'login' | 'resume_uploaded' | 'skills_imported' | 'roadmap_generated' | 'item_completed'
  | 'evidence_submitted' | 'evidence_reviewed' | 'goal_set' | 'job_viewed';

/** Append-only activity log in MongoDB. Best effort: never breaks the request that triggered it. */
export async function logActivity(userId: string, type: ActivityType, meta: Record<string, unknown> = {}) {
  try {
    const db = await mongo();
    const at = new Date();
    await db.collection('activity_log').insertOne({ userId, type, meta, at, day: at.toISOString().slice(0, 10) });
  } catch {
    /* activity logging is non-critical */
  }
}
