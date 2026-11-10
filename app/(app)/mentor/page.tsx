'use client';
import { useState } from 'react';
import { api, fmtDate, useApi } from '@/lib/client';
import { Badge, Empty, Loading, PageHead, Pips, useToast } from '@/components/ui';

type Q = { evidence_id: string; submitted_at: string; kind: string; title: string; url: string | null; demonstrated_level: number; student_name: string; student_email: string;
           skill_name: string; project_title: string | null; project_repo: string | null; claimed_level: number; verified_level: number };
type R = { evidence_id: string; title: string; status: string; reviewed_at: string; review_note: string | null; skill_name: string; student_name: string };

export default function MentorPage() {
  const { data, loading, reload } = useApi<{ queue: Q[]; recent: R[] }>('/api/mentor/queue');
  const { toast, node } = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (id: string, decision: 'verified' | 'rejected') => {
    setBusy(id);
    try {
      const r = await api<{ skill: { claimed_level: number; verified_level: number } | null }>(`/api/mentor/evidence/${id}`, { method: 'POST', json: { decision, note: notes[id] || undefined } });
      toast(decision === 'verified' ? `Verified. The student's verified level is now ${r.skill?.verified_level ?? '—'}.` : 'Rejected with feedback.');
      reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  return (
    <div className="page">
      <PageHead title="Review queue" sub="Verify or reject student evidence. Verifying fires a trigger that recomputes the student's verified level; every decision is written to the audit log with you as the actor." />
      {loading || !data ? <Loading rows={5} /> : data.queue.length ? (
        <div className="stack">
          {data.queue.map((q) => (
            <article key={q.evidence_id} className="card">
              <div className="card-head">
                <h2>{q.student_name} · {q.skill_name}</h2>
                <span className="hint">submitted {fmtDate(q.submitted_at)}</span>
              </div>
              <div className="grid g3">
                <div className="stack" style={{ gap: 4 }}>
                  <span className="small muted">Evidence</span>
                  <span>{q.url ? <a href={q.url} target="_blank" rel="noreferrer">{q.title}</a> : q.title} <Badge>{q.kind}</Badge></span>
                  {q.project_title && <span className="small">Project: {q.project_repo ? <a href={q.project_repo} target="_blank" rel="noreferrer">{q.project_title}</a> : q.project_title}</span>}
                </div>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="small muted">Claims level {q.demonstrated_level}</span>
                  <span className="row"><Pips claimed={q.claimed_level} verified={q.verified_level} /><span className="small">claimed {q.claimed_level}, verified {q.verified_level}</span></span>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <textarea aria-label="Review note" placeholder="Note to the student (required when rejecting)" rows={2} value={notes[q.evidence_id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [q.evidence_id]: e.target.value })} />
                  <div className="row">
                    <button className="btn primary" disabled={busy === q.evidence_id} onClick={() => decide(q.evidence_id, 'verified')}>Verify level {q.demonstrated_level}</button>
                    <button className="btn danger" disabled={busy === q.evidence_id || !notes[q.evidence_id]} onClick={() => decide(q.evidence_id, 'rejected')}>Reject</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty title="Queue is empty">No evidence is waiting for review.</Empty></div>}

      {data && data.recent.length > 0 && (
        <section className="stack">
          <h2>Your recent decisions</h2>
          <div className="table-wrap">
            <table><thead><tr><th>Student</th><th>Skill</th><th>Evidence</th><th>Decision</th><th>Note</th><th>When</th></tr></thead>
              <tbody>{data.recent.map((r) => <tr key={r.evidence_id}><td>{r.student_name}</td><td>{r.skill_name}</td><td>{r.title}</td><td><Badge kind={r.status}>{r.status}</Badge></td><td className="small">{r.review_note ?? '—'}</td><td className="small muted">{fmtDate(r.reviewed_at)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      {node}
    </div>
  );
}
