'use client';
import { useState } from 'react';
import { api, fieldErrors, fmtDate, useApi } from '@/lib/client';
import { Empty, Field, Loading, PageHead, useToast } from '@/components/ui';
import { SkillPicker } from '@/components/SkillPicker';

type Project = { project_id: string; title: string; description: string | null; repo_url: string | null; started_on: string | null;
                 completed_on: string | null; skills: Array<{ skillId: number; name: string }>; evidence_count: number };
const blank = { title: '', description: '', repoUrl: '', startedOn: '', completedOn: '', skills: [] as Array<{ skillId: number; name: string }> };

export default function ProjectsPage() {
  const { data, loading, reload } = useApi<Project[]>('/api/projects');
  const { toast, node } = useToast();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: 'title' | 'description' | 'repoUrl' | 'startedOn' | 'completedOn') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const edit = (p: Project) => {
    setEditing(p.project_id);
    setForm({ title: p.title, description: p.description ?? '', repoUrl: p.repo_url ?? '', startedOn: p.started_on?.slice(0, 10) ?? '',
              completedOn: p.completed_on?.slice(0, 10) ?? '', skills: p.skills });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrs({});
    const json = { title: form.title, description: form.description || null, repoUrl: form.repoUrl || null, startedOn: form.startedOn || null,
                   completedOn: form.completedOn || null, skillIds: form.skills.map((s) => s.skillId) };
    try {
      await api(editing ? `/api/projects/${editing}` : '/api/projects', { method: editing ? 'PUT' : 'POST', json });
      toast(editing ? 'Project updated' : 'Project added');
      setForm(blank); setEditing(null); reload();
    } catch (err) { setErrs(fieldErrors(err)); toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await api(`/api/projects/${id}`, { method: 'DELETE' }); toast('Project deleted'); reload(); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <div className="page">
      <PageHead title="Projects" sub="Projects are the Build step: they show you have applied a skill, and they can back evidence for mentor review." />
      <form className="card" onSubmit={submit} noValidate>
        <h2>{editing ? 'Edit project' : 'Add a project'}</h2>
        <div className="form-grid">
          <Field label="Title" error={errs.title}><input id="title" value={form.title} onChange={set('title')} aria-invalid={!!errs.title} /></Field>
          <Field label="Repository URL" error={errs.repoUrl}><input id="repoUrl" value={form.repoUrl} onChange={set('repoUrl')} placeholder="https://github.com/…" aria-invalid={!!errs.repoUrl} /></Field>
          <Field label="Started" error={errs.startedOn}><input type="date" value={form.startedOn} onChange={set('startedOn')} /></Field>
          <Field label="Completed" error={errs.completedOn}><input type="date" value={form.completedOn} onChange={set('completedOn')} aria-invalid={!!errs.completedOn} /></Field>
        </div>
        <Field label="What you built" error={errs.description}><textarea value={form.description} onChange={set('description')} rows={3} /></Field>
        <Field label="Skills used">
          <SkillPicker onPick={(s) => setForm({ ...form, skills: [...form.skills, { skillId: s.skill_id, name: s.name }] })} exclude={form.skills.map((s) => s.skillId)} />
        </Field>
        {form.skills.length > 0 && <div className="chips">{form.skills.map((s) => (
          <span key={s.skillId} className="chip">{s.name}
            <button type="button" className="btn sm ghost" style={{ padding: '0 4px' }} aria-label={`Remove ${s.name}`}
              onClick={() => setForm({ ...form, skills: form.skills.filter((x) => x.skillId !== s.skillId) })}>×</button></span>))}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy}>{editing ? 'Save changes' : 'Add project'}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>

      {loading ? <Loading /> : data?.length ? (
        <div className="grid g2">
          {data.map((p) => (
            <article key={p.project_id} className="card">
              <div className="card-head"><h2>{p.title}</h2><span className="hint">{fmtDate(p.started_on)} – {p.completed_on ? fmtDate(p.completed_on) : 'ongoing'}</span></div>
              {p.description && <p className="muted">{p.description}</p>}
              <div className="chips">{p.skills.map((s) => <span key={s.skillId} className="chip">{s.name}</span>)}</div>
              <div className="spread">
                <span className="small">{p.repo_url ? <a href={p.repo_url} target="_blank" rel="noreferrer">Repository</a> : <span className="muted">No repository link</span>} · {p.evidence_count} evidence</span>
                <span className="row" style={{ gap: 4 }}><button className="btn sm" onClick={() => edit(p)}>Edit</button><button className="btn sm ghost danger" onClick={() => remove(p.project_id)}>Delete</button></span>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card"><Empty title="No projects yet">Add the first thing you built above.</Empty></div>}
      {node}
    </div>
  );
}
