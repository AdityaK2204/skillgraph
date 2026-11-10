import { ObjectId } from 'mongodb';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handle, HttpError, ok } from '@/lib/http';
import { mongo, logActivity } from '@/lib/mongo';
import { extractText, parseResume, PARSER, type CatalogSkill } from '@/lib/resume-parser';

const MAX_BYTES = 5 * 1024 * 1024;

export const GET = handle(async () => {
  const me = await requireUser();
  return ok(await query(
    `SELECT resume_id, file_name, file_size_bytes, parse_status, skills_detected, uploaded_at
       FROM resumes WHERE user_id = $1 ORDER BY uploaded_at DESC`, [me.userId]));
});

/**
 * Upload a resume (PDF or .txt, max 5 MB) or paste its text.
 * The full parsed document goes to MongoDB (variable structure); PostgreSQL keeps a
 * constrained pointer row. If the PostgreSQL insert fails, the MongoDB document is
 * removed again (compensating action) so the two stores never disagree.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  const form = await req.formData().catch(() => { throw new HttpError(400, 'Send the resume as multipart form data'); });
  const file = form.get('file');
  const pasted = String(form.get('text') ?? '').trim();

  let buf: Buffer, mime: string, fileName: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) throw new HttpError(413, 'The file is larger than 5 MB');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
    if (!isPdf && !isTxt) throw new HttpError(415, 'Upload a PDF or a .txt file');
    buf = Buffer.from(await file.arrayBuffer());
    if (isPdf && buf.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(415, 'This file is not a valid PDF');
    mime = isPdf ? 'application/pdf' : 'text/plain';
    fileName = file.name.slice(0, 255);
  } else if (pasted.length >= 50) {
    buf = Buffer.from(pasted, 'utf8');
    mime = 'text/plain';
    fileName = 'pasted-resume.txt';
  } else {
    throw new HttpError(422, 'Choose a file or paste at least 50 characters of resume text');
  }

  const text = (await extractText(buf, mime)).slice(0, 200_000);
  if (text.trim().length < 50) throw new HttpError(422, 'No readable text was found. Scanned PDFs need OCR first; try pasting the text instead.');

  const catalog = (await query<{ skill_id: number; name: string; aliases: string[] }>('SELECT skill_id, name, aliases FROM skills'))
    .map<CatalogSkill>((s) => ({ skillId: s.skill_id, name: s.name, aliases: s.aliases }));
  const parsed = parseResume(text, catalog);

  const db = await mongo();
  const _id = new ObjectId();
  await db.collection('resumes_raw').insertOne({
    _id, userId: me.userId, fileName, mimeType: mime, text: parsed.text, sections: parsed.sections,
    extracted: parsed.extracted, parser: PARSER, createdAt: new Date(),
  });

  let resumeId: string;
  try {
    const [row] = await query<{ resume_id: string }>(
      `INSERT INTO resumes (user_id, mongo_doc_id, file_name, file_size_bytes, parse_status, skills_detected)
       VALUES ($1, $2, $3, $4, 'parsed', $5) RETURNING resume_id`,
      [me.userId, _id.toHexString(), fileName, buf.length, parsed.extracted.skills.length]);
    resumeId = row.resume_id;
  } catch (err) {
    await db.collection('resumes_raw').deleteOne({ _id });   // compensate: keep both stores consistent
    throw err;
  }
  await logActivity(me.userId, 'resume_uploaded', { resumeId, skills: parsed.extracted.skills.length });
  return ok({ resumeId, skillsDetected: parsed.extracted.skills.length }, 201);
});
