'use client';
import { useEffect, useState } from 'react';
import { api, fieldErrors, fmtDate, useApi } from '@/lib/client';
import { Badge, Empty, Field, LEVELS, Loading, PageHead, useToast } from '@/components/ui';
import { SkillPicker } from '@/components/SkillPicker';

type Ev = { evidence_id: string; kind: string; title: string; url: string | null; demonstrated_level: number; status: string; review_note: string | null;
            submitted_at: string; reviewed_at: string | null; skill_name: string; project_title: string | null; reviewer_name: string | null };
type MySkill = { skill_id: number; skill_name: string; claimed_level: number; verified_level: number };
type Project = { project_id: string; title: string };

export default function EvidencePage() {
  const list = useApi<Ev[]>('/api/evidence');
  const mine = useApi<MySkill[]>('/api/me/skills');
  const projects = useApi<Project[]>('/api/projects');
  const { toast, node } = useToast();
  const [form, setForm] = useState({ skillId: 0, skillName: '', kind: 'repository', title: '', url: '', projectId: '', level: 3 });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {   // /evidence?skill=12 preselects a skill (link from the Skills page)
    const id = Number(new URLSearchParams(window.location.search).get('skill'));
    const s = mine.data?.find((m) => m.skill_id === id);
    if (s) setForm((f) => ({ ...f, skillId: s.skill_id, skillName: s.skill_name, level: Math.max(s.claimed_level, 1) }));
  }, [mine.data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrs({});
    try {
      await api('/api/evidence', { method: 'POST', json: { skillId: form.skillId, kind: form.kind, title: form.title, url: form.url || null,
        projectId: form.projectId || null, demonstratedLevel: form.level } });
      toast('Submitted for mentor review');
      setForm({ ...form, title: '', url: '', projectId: '' });
      list.reload(); mine.reload();
    } catch (err) { setErrs(fieldErrors(err)); toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };
  const withdraw = async (id: string) => {
    try { await api(`/api/evidence/${id}`, { method: 'DELETE' }); toast('Withdrawn'); list.reload(); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <div className="page">
      <PageHead title="Evidence" sub="The Prove step. A mentor reviews each item; when it is verified, a database trigger raises your verified level for that skill." />
      <form className="card" onSubmit={submit} noValidate>
        <h2>Submit evidence</h2>
        <div className="form-grid">
          <Field label="Skill" error={errs.skillId}>
            {form.skillId ? <div className="row"><strong>{form.skillName}</strong><button type="button" className="btn sm ghost" onClick={() => setForm({ ...form, skillId: 0, skillName: '' })}>Change</button></div>
              : <SkillPicker onPick={(s) => setForm({ ...form, skillId: s.skill_id, skillName: s.name })} />}
          </Field>
          <Field label="Type">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {['repository', 'project', 'certificate', 'assessment', 'publication'].map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Level it demonstrates" error={errs.demonstratedLevel}>
            <select value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}</select>
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Title" error={errs.title}><input id="evTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!!errs.title} /></Field>
          <Field label="Link" error={errs.url} help="Repository, certificate or report URL"><input id="evUrl" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} aria-invalid={!!errs.url} /></Field>
          <Field label="Backing project (optional)">
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">None</option>{projects.data?.map((p) => <option key={p.project_id} value={p.project_id}>{p.title}</option>)}
            </select>
          </Field>
        </div>
        <div><button className="btn primary" disabled={busy || !form.skillId}>Submit for review</button></div>
      </form>

      {list.loading ? <Loading /> : list.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Skill</th><th>Evidence</th><th>Type</th><th className="num">Level</th><th>Status</th><th>Review</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {list.data.map((e) => (
                <tr key={e.evidence_id}>
                  <td><strong>{e.skill_name}</strong></td>
                  <td>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}{e.project_title && <div className="muted small">via {e.project_title}</div>}</td>
                  <td className="small">{e.kind}</td>
                  <td className="num">{e.demonstrated_level}</td>
                  <td><Badge kind={e.status}>{e.status}</Badge></td>
                  <td className="small">{e.review_note ? <>{e.review_note}<div className="muted">{e.reviewer_name} · {fmtDate(e.reviewed_at)}</div></> : <span className="muted">—</span>}</td>
                  <td className="small muted">{fmtDate(e.submitted_at)}</td>
                  <td>{e.status === 'pending' && <button className="btn sm ghost danger" onClick={() => withdraw(e.evidence_id)}>Withdraw</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="card"><Empty title="No evidence yet">Submit a repository, certificate or project above.</Empty></div>}
      {node}
    </div>
  );
}
