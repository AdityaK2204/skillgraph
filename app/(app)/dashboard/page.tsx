'use client';
import Link from 'next/link';
import { useApi, fmtDate, pct } from '@/lib/client';
import { Badge, Bar, Empty, Loading, Notice, PageHead, Stat } from '@/components/ui';

type Dash = {
  user: { fullName: string; role: string };
  goal: { role_title: string; target_date: string | null } | null;
  counts: { skills: number; verified: number; unproven: number; projects: number; pending: number };
  readiness: string | null;
  top: Array<{ skill_name: string; priority: string; gap: string; demand: string; is_direct: boolean }>;
  roadmap: { version: number; items: number; done: number; doing: number; next_item: { skill: string; phase: string; rationale: string } | null } | null;
  jobs: Array<{ job_id: string; title: string; company: string; location: string; match_score: string; missing_required: string[] }>;
  byCategory: Array<{ category: string; skills: number; claimed: string; verified: string }>;
  activity: Array<{ type: string; at: string }>;
};

export default function Dashboard() {
  const { data: d, error, loading } = useApi<Dash>('/api/dashboard');
  if (error) return <Notice kind="error">{error}</Notice>;
  if (loading || !d) return <div className="page"><Loading rows={6} /></div>;
  const readiness = Number(d.readiness ?? 0);

  return (
    <div className="page">
      <PageHead title={`Hello, ${d.user.fullName.split(' ')[0]}`}
        sub={d.goal ? <>Working towards <strong>{d.goal.role_title}</strong>{d.goal.target_date ? ` by ${fmtDate(d.goal.target_date)}` : ''}.</> : 'Set a target role to get a personal roadmap.'}
        actions={<Link className="btn" href="/roadmap">Open roadmap</Link>} />

      {!d.goal && <Notice>Start on <Link href="/profile">Profile &amp; goal</Link>: choose a target role, then upload your <Link href="/resume">resume</Link>.</Notice>}

      <div className="grid g2">
        <section className="card">
          <div className="card-head"><h2>Readiness for {d.goal?.role_title ?? 'your goal'}</h2><span className="hint">importance-weighted, unproven claims count half</span></div>
          <div className="row" style={{ gap: 22 }}>
            <div className="ring" style={{ ['--p' as string]: readiness }}><div>{d.goal ? `${Math.round(readiness)}%` : '—'}</div></div>
            <div className="grid g3" style={{ flex: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
              <Stat label="Skills claimed" value={d.counts.skills} />
              <Stat label="Verified" value={d.counts.verified} />
              <Stat label="Claims to prove" value={d.counts.unproven} />
              <Stat label="Projects" value={d.counts.projects} />
              <Stat label="Awaiting review" value={d.counts.pending} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Do next</h2>{d.roadmap && <span className="hint">roadmap v{d.roadmap.version} · {d.roadmap.done}/{d.roadmap.items} done</span>}</div>
          {d.roadmap?.next_item ? (
            <div className="stack">
              <div className="row"><Badge kind={d.roadmap.next_item.phase}>{d.roadmap.next_item.phase}</Badge><strong>{d.roadmap.next_item.skill}</strong></div>
              <p className="muted">{d.roadmap.next_item.rationale}</p>
              <Bar value={d.roadmap.items ? d.roadmap.done / d.roadmap.items : 0} />
            </div>
          ) : <Empty title="No open roadmap items">{d.goal ? <Link className="btn" href="/roadmap">Generate a roadmap</Link> : null}</Empty>}
        </section>
      </div>

      <div className="grid g2">
        <section className="card">
          <div className="card-head"><h2>Highest-priority gaps</h2><Link className="small" href="/gap">Why these?</Link></div>
          {d.top.length ? (
            <div className="list">
              {d.top.map((t) => (
                <div key={t.skill_name} className="spread">
                  <span>{t.skill_name} {!t.is_direct && <Badge>prerequisite</Badge>}</span>
                  <span className="row" style={{ gap: 8, minWidth: 160 }}><Bar value={Number(t.priority)} /><span className="num small">{Number(t.priority).toFixed(2)}</span></span>
                </div>
              ))}
            </div>
          ) : <Empty title={d.goal ? 'No gaps left for this role' : 'No goal yet'} />}
        </section>

        <section className="card">
          <div className="card-head"><h2>Best job matches</h2><Link className="small" href="/jobs">All jobs</Link></div>
          {d.jobs.length ? (
            <div className="list">
              {d.jobs.map((j) => (
                <div key={j.job_id} className="stack" style={{ gap: 4 }}>
                  <div className="spread"><Link href={`/jobs/${j.job_id}`}><strong>{j.title}</strong></Link><span className="num">{pct(j.match_score)}</span></div>
                  <span className="muted small">{j.company} · {j.location}</span>
                  {j.missing_required.length > 0 && <span className="small">Missing: {j.missing_required.join(', ')}</span>}
                </div>
              ))}
            </div>
          ) : <Empty title="No postings yet" />}
        </section>
      </div>

      <div className="grid g2">
        <section className="card">
          <div className="card-head"><h2>Claims vs. evidence by area</h2><span className="hint">average level, 0–5</span></div>
          {d.byCategory.length ? (
            <div className="table-wrap" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Area</th><th className="num">Skills</th><th>Claimed</th><th>Verified</th></tr></thead>
                <tbody>
                  {d.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td><td className="num">{c.skills}</td>
                      <td><div className="row" style={{ gap: 6 }}><Bar value={Number(c.claimed) / 5} color="color-mix(in srgb, var(--accent) 45%, transparent)" /><span className="num small">{c.claimed}</span></div></td>
                      <td><div className="row" style={{ gap: 6 }}><Bar value={Number(c.verified) / 5} /><span className="num small">{c.verified}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No skills yet"><Link className="btn" href="/resume">Import from resume</Link></Empty>}
        </section>

        <section className="card">
          <div className="card-head"><h2>Recent activity</h2><span className="hint">from the MongoDB activity log</span></div>
          {d.activity.length ? (
            <div className="list">
              {d.activity.map((a, i) => (
                <div key={i} className="spread"><span>{a.type.replace(/_/g, ' ')}</span><span className="muted small">{fmtDate(a.at)}</span></div>
              ))}
            </div>
          ) : <Empty title="Nothing yet" />}
        </section>
      </div>
    </div>
  );
}
