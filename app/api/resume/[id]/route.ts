import { ObjectId } from 'mongodb';
import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { handle, HttpError, ok } from '@/lib/http';
import { mongo } from '@/lib/mongo';

// Joins the PostgreSQL pointer row with the MongoDB document, plus the user's current claims.
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const { id } = await params;
  const row = await one<{ mongo_doc_id: string; file_name: string; uploaded_at: string }>(
    `SELECT mongo_doc_id, file_name, uploaded_at FROM resumes WHERE resume_id = $1 AND user_id = $2`, [id, me.userId]);
  if (!row) throw new HttpError(404, 'Resume not found');

  const doc = await (await mongo()).collection('resumes_raw').findOne(
    { _id: new ObjectId(row.mongo_doc_id), userId: me.userId },
    { projection: { text: 0 } });
  if (!doc) throw new HttpError(404, 'The parsed document is missing from MongoDB');

  const current = await query<{ skill_id: number; claimed_level: number; verified_level: number }>(
    'SELECT skill_id, claimed_level, verified_level FROM user_skills WHERE user_id = $1', [me.userId]);
  const byId = new Map(current.map((c) => [c.skill_id, c]));
  const skills = (doc.extracted.skills as Array<{ skillId: number }>).map((s) => ({
    ...s, currentClaimed: byId.get(s.skillId)?.claimed_level ?? 0, currentVerified: byId.get(s.skillId)?.verified_level ?? 0,
  }));
  return ok({
    fileName: row.file_name, uploadedAt: row.uploaded_at, mongoId: row.mongo_doc_id, parser: doc.parser,
    sections: Object.fromEntries(Object.entries(doc.sections ?? {}).map(([k, v]) => [k, (v as string[]).length])),
    extracted: { ...doc.extracted, skills },
  });
});
