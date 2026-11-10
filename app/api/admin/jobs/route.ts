import { requireUser } from '@/lib/auth';
import { body, handle, ok } from '@/lib/http';
import { jobIngestSchema } from '@/lib/validation';
import { ingestJob } from '@/lib/jobs';
import { mongo } from '@/lib/mongo';

// Recent raw ingestions (MongoDB job_sources), newest first
export const GET = handle(async () => {
  await requireUser('admin');
  const docs = await (await mongo()).collection('job_sources')
    .find({}, { projection: { source: 1, externalId: 1, status: 1, error: 1, ingestedAt: 1, 'normalized.title': 1, 'normalized.company': 1, unresolvedSkills: 1, pgJobId: 1, payload: 1 } })
    .sort({ ingestedAt: -1 }).limit(25).toArray();
  return ok(docs.map((d) => ({ ...d, _id: String(d._id), payloadFields: Object.keys(d.payload ?? {}), payload: undefined })));
});

// Manual posting from the admin form -> MongoDB (raw) -> PostgreSQL (normalised, embedded)
export const POST = handle(async (req: Request) => {
  const me = await requireUser('admin');
  const job = await body(req, jobIngestSchema);
  const result = await ingestJob('manual', `admin-${Date.now()}`, job, me.userId);
  return ok(result, result.status === 'normalized' ? 201 : 422);
});
