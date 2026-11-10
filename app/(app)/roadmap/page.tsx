'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, fmtDate, useApi } from '@/lib/client';
import { Badge, Bar, Empty, Loading, Notice, PageHead, useToast } from '@/components/ui';

type Item = { item_id: string; sequence_no: number; phase: 'learn' | 'build' | 'prove'; priority_score: string; rationale: string; status: 'todo' | 'doing' | 'done';
              skill_name: string; category: string; effort_hours: number; score_breakdown: Record<string, unknown> };
type Res = { current: { roadmap_id: string; version: number; status: string; generated_at: string; role_title: string } | null; items: Item[];
             history: Array<{ roadmap_id: string; version: number; status: string; generated_at: string; role_title: string; items: number; done: number }>; weeklyHours: number };

const LANES: Array<[Item['phase'], string, string]> = [
  ['learn', 'Learn', 'Close the knowledge gap'],
  ['build', 'Build', 'Apply it in a project'],
  ['prove', 'Prove', 'Get it verified'],
];

export default function RoadmapPage() {
  const { data, error, loading, reload } = useApi<Res>('/api/roadmap');
  const { toast, node } = useToast();
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    try { await api('/api/roadmap', { method: 'POST' }); toast('New roadmap version generated'); reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const setStatus = async (id: string, status: Item['status']) => {
    try {
      const r = await api<{ roadmapStatus: string }>(`/api/roadmap/items/${id}`, { method: 'PATCH', json: { status } });
      if (r.roadmapStatus === 'completed') toast('Roadmap completed. Regenerate to see what comes next.');
      reload();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (error) return <Notice kind="error">{error}</Notice>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  if (!data.current) {
    return <div className="page"><PageHead title="Roadmap" /><div className="card"><Empty title="No roadmap yet">
      <span>Choose a target role on <Link href="/profile">Profile &amp; goal</Link>; a roadmap is generated automatically.</span>
      <button className="btn primary" onClick={regenerate} disabled={busy}>Generate now</button></Empty></div>{node}</div>;
  }
  const open = data.items.filter((i) => i.status !== 'done');
  const hoursLeft = open.reduce((s, i) => s + i.effort_hours * (i.phase === 'learn' ? 1 : i.phase === 'build' ? 0.5 : 0.15), 0);
  const done = data.items.length - open.length;

  return (
    <div className="page">
      <PageHead title={`Roadmap · ${data.current.role_title}`}
        sub={<>Version {data.current.version}, generated {fmtDate(data.current.generated_at)} by the stored function <span className="kbd">generate_roadmap()</span>. Order respects prerequisites first, then priority.</>}
        actions={<button className="btn" onClick={regenerate} disabled={busy}>{busy ? 'Generating…' : 'Regenerate'}</button>} />

      <div className="card">
        <div className="spread">
          <span><strong>{done}</strong> of {data.items.length} done{data.current.status === 'completed' && <> · <Badge kind="verified">completed</Badge></>}</span>
          <span className="muted small">about {Math.ceil(hoursLeft)} hours left ≈ {Math.ceil(hoursLeft / Math.max(data.weeklyHours, 1))} weeks at {data.weeklyHours} h/week</span>
        </div>
        <Bar value={data.items.length ? done / data.items.length : 0} />
      </div>

      <div className="lanes">
        {LANES.map(([phase, label, hint], li) => {
          const items = data.items.filter((i) => i.phase === phase);
          return (
            <section key={phase} className="lane" aria-label={label}>
              <div className="lane-head"><span><Badge kind={phase}>{label}</Badge> <span className="muted small" style={{ fontWeight: 400 }}>{hint}</span></span>{li < 2 && <span className="arrow">→</span>}</div>
              {items.length ? items.map((i) => (
                <article key={i.item_id} className={`item ${phase} ${i.status === 'done' ? 'done' : ''}`}>
                  <div className="spread"><span><span className="seq">#{i.sequence_no}</span> <strong>{i.skill_name}</strong></span><span className="num small">{Number(i.priority_score).toFixed(2)}</span></div>
                  <p className="small">{i.rationale}</p>
                  <div className="spread">
                    <span className="muted small">{i.category} · ~{i.effort_hours} h</span>
                    <select aria-label={`Status of ${i.skill_name}`} value={i.status} onChange={(e) => setStatus(i.item_id, e.target.value as Item['status'])} style={{ width: 'auto', padding: '3px 8px', fontSize: 12.5 }}>
                      <option value="todo">To do</option><option value="doing">Doing</option><option value="done">Done</option>
                    </select>
                  </div>
                  {phase === 'build' && i.status !== 'done' && <Link className="small" href="/projects">Add a project using {i.skill_name}</Link>}
                  {phase === 'prove' && i.status !== 'done' && <Link className="small" href="/evidence">Submit evidence</Link>}
                </article>
              )) : <p className="muted small">Nothing in this phase.</p>}
            </section>
          );
        })}
      </div>

      <section className="stack">
        <h2>Versions</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="num">Version</th><th>Role</th><th>Status</th><th className="num">Done</th><th>Generated</th></tr></thead>
            <tbody>{data.history.map((h) => (
              <tr key={h.roadmap_id}><td className="num">v{h.version}</td><td>{h.role_title}</td><td><Badge kind={h.status === 'active' ? 'accent' : h.status === 'completed' ? 'verified' : ''}>{h.status}</Badge></td>
                <td className="num">{h.done}/{h.items}</td><td className="small muted">{fmtDate(h.generated_at)}</td></tr>))}</tbody>
          </table>
        </div>
      </section>
      {node}
    </div>
  );
}
