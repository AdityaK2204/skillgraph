/**
 * Job ingestion pipeline: raw record -> MongoDB (as delivered) -> normalised -> PostgreSQL.
 * Sources disagree on field names and structure, which is why the raw form lives in MongoDB;
 * the normalised, constrained form lives in PostgreSQL where it can be joined and scored.
 */
import { ObjectId } from 'mongodb';
import { mongo } from './mongo';
import { query, tx, toVector } from './db';
import { embed } from './embeddings';

export interface NormalizedJob {
  title: string; company: string; location: string; workMode: 'onsite' | 'remote' | 'hybrid';
  description: string; requiredSkills: string[]; optionalSkills: string[]; roleTitle?: string | null;
  salaryMin?: number | null; salaryMax?: number | null; postedAt?: string | null;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : [];

/** One adapter per source format. */
export function normalize(source: string, p: Raw): NormalizedJob {
  if (source === 'portal-a') {
    return {
      title: p.jobTitle, company: p.org, location: p.city, workMode: p.mode ?? 'onsite', description: p.desc,
      requiredSkills: list(p.skillsCsv), optionalSkills: list(p.optional), roleTitle: p.category ?? null,
      salaryMin: p.salary?.min ?? null, salaryMax: p.salary?.max ?? null, postedAt: p.postedOn ?? null,
    };
  }
  if (source === 'portal-b') {
    const [min, max] = String(p.pay ?? '').match(/[\d.]+/g)?.map(Number) ?? [];
    return {
      title: p.position?.name, company: p.employer?.name,
      location: p.location?.remote ? 'Remote' : p.location?.city,
      workMode: p.location?.remote ? 'remote' : p.location?.hybrid ? 'hybrid' : 'onsite',
      description: p.body, requiredSkills: list(p.tags), optionalSkills: list(p.niceToHave),
      roleTitle: p.position?.family ?? null, salaryMin: min ?? null, salaryMax: max ?? min ?? null,
      postedAt: p.published ? String(p.published).slice(0, 10) : null,
    };
  }
  // 'manual' (admin form) is already in the normalised shape
  return {
    title: p.title, company: p.company, location: p.location, workMode: p.workMode ?? 'onsite', description: p.description,
    requiredSkills: list(p.requiredSkills), optionalSkills: list(p.optionalSkills), roleTitle: p.roleTitle ?? null,
    salaryMin: p.salaryMin ?? null, salaryMax: p.salaryMax ?? null, postedAt: p.postedAt ?? null,
  };
}

async function resolveSkills(names: string[]) {
  if (!names.length) return { ids: new Map<string, number>(), unresolved: [] as string[] };
  const rows = await query<{ term: string; skill_id: number }>(
    `SELECT t.term, s.skill_id
       FROM unnest($1::text[]) AS t(term)
       JOIN skills s ON lower(s.name) = lower(t.term)
                     OR EXISTS (SELECT 1 FROM unnest(s.aliases) a WHERE lower(a) = lower(t.term))`, [names]);
  const ids = new Map(rows.map((r) => [r.term, r.skill_id]));
  return { ids, unresolved: names.filter((n) => !ids.has(n)) };
}

export interface IngestResult { status: 'normalized' | 'skipped' | 'rejected'; jobId?: string; mongoId: string; unresolved?: string[]; error?: string }

export async function ingestJob(source: string, externalId: string, payload: Raw, actorId: string | null = null): Promise<IngestResult> {
  const db = await mongo();
  const col = db.collection('job_sources');

  const existing = await col.findOne({ source, externalId });
  if (existing?.status === 'normalized') return { status: 'skipped', mongoId: String(existing._id), jobId: existing.pgJobId };

  const mongoId = existing?._id ?? new ObjectId();
  if (!existing) await col.insertOne({ _id: mongoId, source, externalId, payload, status: 'received', ingestedAt: new Date() });

  try {
    const n = normalize(source, payload);
    if (!n.title || !n.company || !n.location || !n.description) throw new Error('Missing title, company, location or description');
    const req = await resolveSkills(n.requiredSkills);
    const opt = await resolveSkills(n.optionalSkills);
    if (req.ids.size === 0) throw new Error('None of the required skills match the catalogue');

    const vector = toVector(await embed(`${n.title}. ${n.description} Skills: ${[...n.requiredSkills, ...n.optionalSkills].join(', ')}`));

    const jobId = await tx(actorId, async (c) => {
      // role: as given, otherwise the role whose requirements overlap the posting most
      const { rows: [role] } = await c.query<{ role_id: number }>(
        `SELECT role_id FROM career_roles WHERE lower(title) = lower($1)
         UNION ALL
         (SELECT rs.role_id FROM role_skills rs WHERE rs.skill_id = ANY($2::int[])
          GROUP BY rs.role_id ORDER BY sum(rs.importance) DESC LIMIT 1)
         LIMIT 1`, [n.roleTitle ?? '', [...req.ids.values()]]);
      const { rows: [job] } = await c.query<{ job_id: string }>(
        `INSERT INTO job_postings (role_id, mongo_source_id, title, company, location, work_mode, description,
                                   salary_min_lpa, salary_max_lpa, posted_at, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::date, current_date),$11)
         RETURNING job_id`,
        [role?.role_id ?? null, mongoId.toHexString(), n.title, n.company, n.location, n.workMode, n.description,
         n.salaryMin, n.salaryMax, n.postedAt, vector]);
      await c.query(
        `INSERT INTO job_skills (job_id, skill_id, is_required)
         SELECT $1, sid, req FROM (
           SELECT unnest($2::int[]) AS sid, true AS req
           UNION ALL SELECT unnest($3::int[]), false) x
         ON CONFLICT (job_id, skill_id) DO NOTHING`,
        [job.job_id, [...req.ids.values()], [...opt.ids.values()]]);
      return job.job_id;
    });

    const unresolved = [...req.unresolved, ...opt.unresolved];
    await col.updateOne({ _id: mongoId }, {
      $set: { status: 'normalized', pgJobId: jobId,
              normalized: { title: n.title, company: n.company, location: n.location, skills: [...req.ids.keys(), ...opt.ids.keys()] },
              unresolvedSkills: unresolved },
      $unset: { error: '' },
    });
    return { status: 'normalized', jobId, mongoId: mongoId.toHexString(), unresolved };
  } catch (err) {
    await col.updateOne({ _id: mongoId }, { $set: { status: 'rejected', error: (err as Error).message } });
    return { status: 'rejected', mongoId: mongoId.toHexString(), error: (err as Error).message };
  }
}
