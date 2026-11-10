'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fmtDate, pct, useApi } from '@/lib/client';
import { Badge, Bar, Empty, Field, Loading, PageHead } from '@/components/ui';

type Match = { job_id: string; title: string; company: string; location: string; work_mode: string; role_title: string | null;
               structured_score: string; semantic_score: string; match_score: string; matched_skills: string[]; missing_required: string[] };
type Job = { job_id: string; title: string; company: string; location: string; work_mode: string; salary_min_lpa: string | null; salary_max_lpa: string | null;
             posted_at: string; role_title: string | null; snippet: string | null; skills: string[] | null; rank: number };
type Search = { total: number; page: number; pageSize: number; jobs: Job[]; facets: Array<{ facet: string; value: string; n: number }> };
type Role = { role_id: number; title: string };

export default function JobsPage() {
  const [tab, setTab] = useState<'match' | 'search'>('match');
  const matches = useApi<Match[]>('/api/jobs/match?limit=12');
  const roles = useApi<Role[]>('/api/roles');
  const [f, setF] = useState({ q: '', mode: '', roleId: '', location: '', minSalary: '', sort: 'relevance', page: 1 });
  const [res, setRes] = useState<Search | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab !== 'search') return;
    const t = setTimeout(async () => {
      setBusy(true);
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => [k, String(v)]));
      try { setRes(await api<Search>(`/api/jobs/search?${qs}`)); } finally { setBusy(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [f, tab]);

  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value, page: 1 });
  const pages = res ? Math.ceil(res.total / res.pageSize) : 0;

  return (
    <div className="page">
      <PageHead title="Jobs" sub="Matches combine structured skill overlap (60%) with semantic similarity between your profile and the posting (40%, pgvector cosine). Search uses PostgreSQL full-text ranking."
        actions={<div className="row" role="tablist">
          <button role="tab" aria-selected={tab === 'match'} className={`btn ${tab === 'match' ? 'primary' : ''}`} onClick={() => setTab('match')}>Matches for you</button>
          <button role="tab" aria-selected={tab === 'search'} className={`btn ${tab === 'search' ? 'primary' : ''}`} onClick={() => setTab('search')}>Search all</button>
        </div>} />

      {tab === 'match' ? (matches.loading ? <Loading rows={6} /> : matches.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Posting</th><th>Role</th><th>Skill overlap</th><th>Semantic</th><th>Match</th><th>Missing required skills</th></tr></thead>
            <tbody>{matches.data.map((m) => (
              <tr key={m.job_id}>
                <td><Link href={`/jobs/${m.job_id}`}><strong>{m.title}</strong></Link><div className="muted small">{m.company} · {m.location} · {m.work_mode}</div></td>
                <td className="small">{m.role_title ?? '—'}</td>
                <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Bar value={Number(m.structured_score)} /><span className="num small">{pct(m.structured_score)}</span></div></td>
                <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Bar value={Number(m.semantic_score)} color="var(--learn)" /><span className="num small">{Number(m.semantic_score).toFixed(2)}</span></div></td>
                <td className="num"><strong>{pct(m.match_score)}</strong></td>
                <td>{m.missing_required.length ? <div className="chips">{m.missing_required.map((s) => <span key={s} className="chip" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{s}</span>)}</div> : <Badge kind="verified">none</Badge>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ) : <div className="card"><Empty title="No postings yet" /></div>) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div className="toolbar">
            <Field label="Keywords"><input id="q" value={f.q} onChange={upd('q')} placeholder='e.g. python dashboards or "power bi"' /></Field>
            <Field label="Role"><select value={f.roleId} onChange={upd('roleId')}><option value="">Any</option>{roles.data?.map((r) => <option key={r.role_id} value={r.role_id}>{r.title}</option>)}</select></Field>
            <Field label="Work mode"><select value={f.mode} onChange={upd('mode')}><option value="">Any</option><option>onsite</option><option>hybrid</option><option>remote</option></select></Field>
            <Field label="Location"><input value={f.location} onChange={upd('location')} placeholder="City" /></Field>
            <Field label="Min. salary (LPA)"><input type="number" min={0} value={f.minSalary} onChange={upd('minSalary')} /></Field>
            <Field label="Sort"><select value={f.sort} onChange={upd('sort')}><option value="relevance">Relevance</option><option value="recent">Newest</option><option value="salary">Salary</option></select></Field>
          </div>
          {res && <div className="chips">{res.facets.map((x) => <span key={x.facet + x.value} className="chip"><span className="muted">{x.facet}:</span> {x.value} <span className="num muted">{x.n}</span></span>)}</div>}
          {busy && !res ? <Loading /> : res && res.jobs.length ? (
            <div className="stack">
              <span className="muted small">{res.total} postings</span>
              {res.jobs.map((j) => (
                <article key={j.job_id} className="card" style={{ gap: 6 }}>
                  <div className="spread"><Link href={`/jobs/${j.job_id}`}><strong>{j.title}</strong></Link>
                    <span className="muted small">{j.salary_min_lpa ? `₹${Number(j.salary_min_lpa)}–${Number(j.salary_max_lpa)} LPA · ` : ''}{fmtDate(j.posted_at)}</span></div>
                  <span className="muted small">{j.company} · {j.location} · {j.work_mode}{j.role_title ? ` · ${j.role_title}` : ''}</span>
                  {j.snippet && <p className="small" dangerouslySetInnerHTML={{ __html: j.snippet.replace(/<(?!\/?mark>)[^>]*>/g, '') }} />}
                  <div className="chips">{(j.skills ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</div>
                </article>
              ))}
              {pages > 1 && <div className="row">
                <button className="btn sm" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Previous</button>
                <span className="small">Page {f.page} of {pages}</span>
                <button className="btn sm" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</button>
              </div>}
            </div>
          ) : res ? <div className="card"><Empty title="No postings match these filters" /></div> : null}
        </div>
      )}
    </div>
  );
}
