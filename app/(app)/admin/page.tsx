'use client';
import { Fragment } from 'react';
import { useApi } from '@/lib/client';
import { Badge, Bar, Loading, Notice, PageHead, Stat } from '@/components/ui';

type A = {
  totals: { students: number; mentors: number; jobs: number; skills: number; pending_evidence: number; roadmaps: number };
  roles: Array<{ role_title: string; students: number; avg_readiness: string }>;
  funnel: Array<{ status: string; n: number }>;
  supplyDemand: Array<{ skill_name: string; category: string; postings: number; learners: number; roles_requiring: number }>;
  readiness: Array<{ bucket: number; students: number }>;
  neo4j: boolean;
  mongo: { error?: string; resumeCount: number; topResumeSkills: Array<{ skill: string; resumes: number; mentions: number }>;
           unknownTerms: Array<{ term: string; resumes: number }>; jobSources: Array<{ source: string; status: string; count: number }>;
           activity: Array<{ day: string; events: number; users: number }> };
};

export default function AdminAnalytics() {
  const { data: d, error, loading } = useApi<A>('/api/admin/analytics');
  if (error) return <Notice kind="error">{error}</Notice>;
  if (loading || !d) return <div className="page"><Loading rows={8} /></div>;
  const maxPost = Math.max(1, ...d.supplyDemand.map((s) => Math.max(s.postings, s.learners)));
  const maxAct = Math.max(1, ...(d.mongo.activity ?? []).map((a) => a.events));
  const bucketLabel = (b: number) => ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%', '100%'][b - 1] ?? `${b}`;

  return (
    <div className="page">
      <PageHead title="Platform analytics" sub="SQL aggregates from PostgreSQL alongside aggregation pipelines from MongoDB."
        actions={<Badge kind={d.neo4j ? 'up' : 'pending'}>Neo4j {d.neo4j ? 'connected' : 'not reachable: graph uses PostgreSQL'}</Badge>} />

      <div className="card"><div className="grid g4">
        <Stat label="Students" value={d.totals.students} /><Stat label="Mentors" value={d.totals.mentors} />
        <Stat label="Active postings" value={d.totals.jobs} /><Stat label="Catalogue skills" value={d.totals.skills} />
        <Stat label="Evidence to review" value={d.totals.pending_evidence} /><Stat label="Live roadmaps" value={d.totals.roadmaps} />
      </div></div>

      <div className="grid g2">
        <section className="card">
          <div className="card-head"><h2>Target roles</h2><span className="hint">GROUP BY role · avg readiness</span></div>
          <div className="table-wrap" style={{ border: 0 }}><table><thead><tr><th>Role</th><th className="num">Students</th><th>Avg readiness</th></tr></thead>
            <tbody>{d.roles.map((r) => <tr key={r.role_title}><td>{r.role_title}</td><td className="num">{r.students}</td>
              <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Bar value={Number(r.avg_readiness) / 100} /><span className="num small">{r.avg_readiness}%</span></div></td></tr>)}</tbody></table></div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Evidence pipeline</h2><span className="hint">readiness distribution (width_bucket)</span></div>
          <div className="row">{d.funnel.map((f) => <Badge key={f.status} kind={f.status}>{f.status}: {f.n}</Badge>)}</div>
          <div className="factor-grid" style={{ gridTemplateColumns: '80px 1fr 30px' }}>
            {d.readiness.map((r) => <Fragment key={r.bucket}><span className="small">{bucketLabel(r.bucket)}</span><Bar value={r.students / Math.max(1, d.totals.students)} /><span className="num small">{r.students}</span></Fragment>)}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Market demand vs. learner supply</h2><span className="hint">materialized view mv_skill_demand</span></div>
        <div className="table-wrap" style={{ border: 0 }}><table>
          <thead><tr><th>Skill</th><th>Area</th><th>Postings asking</th><th>Students with skill</th><th className="num">Roles requiring</th></tr></thead>
          <tbody>{d.supplyDemand.map((s) => (
            <tr key={s.skill_name}><td><strong>{s.skill_name}</strong></td><td><Badge>{s.category}</Badge></td>
              <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Bar value={s.postings / maxPost} /><span className="num small">{s.postings}</span></div></td>
              <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Bar value={s.learners / maxPost} color="var(--learn)" /><span className="num small">{s.learners}</span></div></td>
              <td className="num">{s.roles_requiring}</td></tr>))}</tbody>
        </table></div>
      </section>

      {d.mongo.error ? <Notice kind="error">MongoDB: {d.mongo.error}</Notice> : (
        <div className="grid g2">
          <section className="card">
            <div className="card-head"><h2>Skills found in resumes</h2><span className="hint">$unwind → $group → $sort · {d.mongo.resumeCount} resumes</span></div>
            <div className="list">{d.mongo.topResumeSkills.map((s) => <div key={s.skill} className="spread"><span>{s.skill}</span><span className="num small">{s.resumes} resumes · {s.mentions} mentions</span></div>)}</div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Catalogue gaps</h2><span className="hint">resume terms with no matching skill</span></div>
            <p className="muted small">Candidates to add to the skill catalogue.</p>
            <div className="chips">{d.mongo.unknownTerms.map((t) => <span key={t.term} className="chip">{t.term} <span className="num muted">{t.resumes}</span></span>)}</div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Job ingestion</h2><span className="hint">job_sources by source and status</span></div>
            <div className="list">{d.mongo.jobSources.map((j) => <div key={j.source + j.status} className="spread"><span className="mono">{j.source}</span><span><Badge kind={j.status === 'normalized' ? 'verified' : j.status === 'rejected' ? 'rejected' : 'pending'}>{j.status}</Badge> <span className="num">{j.count}</span></span></div>)}</div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Activity, last 30 days</h2><span className="hint">two-stage $group by day</span></div>
            <div className="factor-grid" style={{ gridTemplateColumns: '60px 1fr 96px' }}>
              {d.mongo.activity.map((a) => <Fragment key={a.day}><span className="small mono">{a.day.slice(5)}</span><Bar value={a.events / maxAct} /><span className="num small">{a.events} · {a.users} users</span></Fragment>)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
