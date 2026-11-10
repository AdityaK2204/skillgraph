'use client';
import Link from 'next/link';
import { use } from 'react';
import { fmtDate, useApi } from '@/lib/client';
import { Badge, Loading, Notice, PageHead, Pips } from '@/components/ui';

type Detail = {
  job: { title: string; company: string; location: string; work_mode: string; description: string; salary_min_lpa: string | null; salary_max_lpa: string | null; posted_at: string; role_title: string | null };
  skills: Array<{ skill_id: number; name: string; is_required: boolean; claimed: number; verified: number; effective: string }>;
  similar: Array<{ job_id: string; title: string; company: string; similarity: string }>;
  source: { source: string; fields: string[]; ingestedAt: string } | null;
};

export default function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading } = useApi<Detail>(`/api/jobs/${id}`);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (loading || !data) return <div className="page"><Loading rows={6} /></div>;
  const { job } = data;
  const have = data.skills.filter((s) => Number(s.effective) >= 2).length;

  return (
    <div className="page">
      <PageHead title={job.title} sub={`${job.company} · ${job.location} · ${job.work_mode}${job.role_title ? ` · ${job.role_title}` : ''}`} actions={<Link className="btn" href="/jobs">Back to jobs</Link>} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>Description</h2>
          <p>{job.description}</p>
          <div className="spread small muted">
            <span>{job.salary_min_lpa ? `₹${Number(job.salary_min_lpa)}–${Number(job.salary_max_lpa)} LPA` : 'Salary not stated'}</span>
            <span>Posted {fmtDate(job.posted_at)}</span>
          </div>
          {data.source && <p className="small muted">Source: <span className="kbd">{data.source.source}</span>, raw fields in MongoDB: {data.source.fields.join(', ')}</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Skills asked for</h2><span className="hint">you have {have} of {data.skills.length} at level 2+</span></div>
          <div className="list">{data.skills.map((s) => (
            <div key={s.skill_id} className="spread">
              <span>{s.name} {s.is_required ? <Badge kind="accent">required</Badge> : <Badge>nice to have</Badge>}</span>
              <Pips claimed={s.claimed} verified={s.verified} />
            </div>))}</div>
        </section>
      </div>
      <section className="card">
        <div className="card-head"><h2>Similar postings</h2><span className="hint">nearest neighbours by embedding (HNSW index, cosine)</span></div>
        <div className="list">{data.similar.map((s) => (
          <div key={s.job_id} className="spread"><Link href={`/jobs/${s.job_id}`}>{s.title} <span className="muted">· {s.company}</span></Link><span className="num small">{Number(s.similarity).toFixed(3)}</span></div>))}</div>
      </section>
    </div>
  );
}
