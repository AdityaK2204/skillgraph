import { ObjectId } from 'mongodb';
import { requireUser } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { handle, HttpError, ok } from '@/lib/http';
import { mongo, logActivity } from '@/lib/mongo';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Invalid job id');

  const job = await one<Record<string, unknown> & { mongo_source_id: string | null }>(
    `SELECT jp.job_id, jp.title, jp.company, jp.location, jp.work_mode, jp.description, jp.salary_min_lpa, jp.salary_max_lpa,
            jp.posted_at, jp.mongo_source_id, cr.title AS role_title
       FROM job_postings jp LEFT JOIN career_roles cr USING (role_id) WHERE jp.job_id = $1`, [id]);
  if (!job) throw new HttpError(404, 'Job not found');

  const [skills, similar] = await Promise.all([
    query(`SELECT s.skill_id, s.name, js.is_required, coalesce(us.claimed_level, 0) AS claimed, coalesce(us.verified_level, 0) AS verified,
                  effective_level(us.claimed_level, us.verified_level) AS effective
             FROM job_skills js JOIN skills s USING (skill_id)
             LEFT JOIN user_skills us ON us.skill_id = s.skill_id AND us.user_id = $2
            WHERE js.job_id = $1 ORDER BY js.is_required DESC, s.name`, [id, me.userId]),
    // k-nearest neighbours over the HNSW index (cosine distance)
    query(`SELECT o.job_id, o.title, o.company, round((1 - (o.embedding <=> j.embedding))::numeric, 3) AS similarity
             FROM job_postings j, job_postings o
            WHERE j.job_id = $1 AND o.job_id <> j.job_id AND o.is_active
            ORDER BY o.embedding <=> j.embedding LIMIT 4`, [id]),
  ]);

  // provenance: the raw record as the source delivered it (MongoDB)
  let source: { source: string; fields: string[]; ingestedAt: Date } | null = null;
  if (job.mongo_source_id) {
    const raw = await (await mongo()).collection('job_sources').findOne({ _id: new ObjectId(job.mongo_source_id) });
    if (raw) source = { source: raw.source, fields: Object.keys(raw.payload ?? {}), ingestedAt: raw.ingestedAt };
  }
  await logActivity(me.userId, 'job_viewed', { jobId: id });
  return ok({ job, skills, similar, source });
});
