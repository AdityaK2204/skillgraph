'use client';
import { useMemo, useState } from 'react';
import { api, fieldErrors, useApi } from '@/lib/client';
import { Badge, CATEGORIES, Field, Loading, PageHead, useToast } from '@/components/ui';

type S = { skill_id: number; name: string; category: string; description: string; aliases: string[]; effort_hours: number;
           postings: number | null; roles_requiring: number | null; learners: number | null; prerequisites: Array<{ id: number; name: string; strength: string }> };
type W = { factor: string; weight: string; label: string };
const blank = { name: '', category: 'data', description: '', aliases: '', effortHours: '30' };

export default function CatalogPage() {
  const { data, loading, reload } = useApi<S[]>('/api/admin/skills');
  const weights = useApi<W[]>('/api/admin/weights');
  const { toast, node } = useToast();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pre, setPre] = useState({ skillId: 0, prereqSkillId: 0, strength: '1' });
  const [filter, setFilter] = useState('');
  const [w, setW] = useState<Record<string, string>>({});

  const rows = useMemo(() => (data ?? []).filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.category === filter), [data, filter]);
  const sorted = useMemo(() => [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErrs({});
    const json = { ...form, aliases: form.aliases.split(',').map((a) => a.trim()).filter(Boolean), effortHours: Number(form.effortHours) };
    try {
      await api(editing ? `/api/admin/skills/${editing}` : '/api/admin/skills', { method: editing ? 'PUT' : 'POST', json });
      toast(editing ? 'Skill updated and re-embedded' : 'Skill added and embedded'); setForm(blank); setEditing(null); reload();
    } catch (err) { setErrs(fieldErrors(err)); toast((err as Error).message, 'error'); }
  };
  const del = async (id: number) => {
    try { await api(`/api/admin/skills/${id}`, { method: 'DELETE' }); toast('Skill deleted'); reload(); } catch (err) { toast((err as Error).message, 'error'); }
  };
  const addPre = async () => {
    try { await api('/api/admin/prerequisites', { method: 'POST', json: { ...pre, strength: Number(pre.strength) } }); toast('Prerequisite saved'); reload(); }
    catch (err) { toast((err as Error).message, 'error'); }
  };
  const delPre = async (skillId: number, prereqSkillId: number) => {
    try { await api(`/api/admin/prerequisites?skillId=${skillId}&prereqSkillId=${prereqSkillId}`, { method: 'DELETE' }); reload(); } catch (err) { toast((err as Error).message, 'error'); }
  };
  const saveWeights = async () => {
    try { await api('/api/admin/weights', { method: 'PUT', json: { weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) } }); toast('Weights saved; priorities use them immediately'); weights.reload(); setW({}); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <div className="page">
      <PageHead title="Skill catalogue" sub="Skills, the prerequisite graph and the scoring weights. Changes are audited and re-projected into Neo4j." />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={save} noValidate>
          <h2>{editing ? 'Edit skill' : 'Add a skill'}</h2>
          <div className="form-grid">
            <Field label="Name" error={errs.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Area"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Typical hours to working level" error={errs.effortHours}><input type="number" min={1} max={400} value={form.effortHours} onChange={(e) => setForm({ ...form, effortHours: e.target.value })} /></Field>
          </div>
          <Field label="Description" error={errs.description}><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Aliases" help="Comma-separated; the resume parser matches these"><input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></Field>
          <div className="row"><button className="btn primary">{editing ? 'Save' : 'Add skill'}</button>{editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}</div>
        </form>

        <div className="stack">
          <section className="card">
            <h2>Add a prerequisite</h2>
            <p className="muted small">A trigger rejects any edge that would create a cycle.</p>
            <div className="toolbar">
              <Field label="Skill"><select value={pre.skillId} onChange={(e) => setPre({ ...pre, skillId: Number(e.target.value) })}><option value={0}>Choose</option>{sorted.map((s) => <option key={s.skill_id} value={s.skill_id}>{s.name}</option>)}</select></Field>
              <Field label="requires"><select value={pre.prereqSkillId} onChange={(e) => setPre({ ...pre, prereqSkillId: Number(e.target.value) })}><option value={0}>Choose</option>{sorted.map((s) => <option key={s.skill_id} value={s.skill_id}>{s.name}</option>)}</select></Field>
              <Field label="Strength"><input type="number" step="0.1" min="0.1" max="1" value={pre.strength} onChange={(e) => setPre({ ...pre, strength: e.target.value })} /></Field>
              <button className="btn" onClick={addPre} disabled={!pre.skillId || !pre.prereqSkillId}>Save</button>
            </div>
          </section>
          <section className="card">
            <h2>Priority weights</h2>
            {weights.data?.map((x) => (
              <div key={x.factor} className="spread">
                <span><strong>{x.factor}</strong> <span className="muted small">{x.label}</span></span>
                <input type="number" step="0.05" min="0" max="1" style={{ width: 80 }} aria-label={`${x.factor} weight`} value={w[x.factor] ?? x.weight} onChange={(e) => setW({ ...w, [x.factor]: e.target.value })} />
              </div>))}
            <div><button className="btn" onClick={saveWeights} disabled={!Object.keys(w).length}>Save weights</button></div>
          </section>
        </div>
      </div>

      <div className="toolbar"><Field label="Filter"><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name or area" /></Field></div>
      {loading ? <Loading /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Skill</th><th>Area</th><th>Prerequisites</th><th className="num">Hours</th><th className="num">Postings</th><th className="num">Roles</th><th className="num">Learners</th><th></th></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.skill_id}>
                <td><strong>{s.name}</strong><div className="muted small">{s.aliases.slice(0, 4).join(', ')}</div></td>
                <td><Badge>{s.category}</Badge></td>
                <td><div className="chips">{s.prerequisites.map((p) => <span key={p.id} className="chip">{p.name} <span className="muted num">{Number(p.strength).toFixed(1)}</span>
                  <button className="btn sm ghost" style={{ padding: '0 3px' }} aria-label={`Remove ${p.name}`} onClick={() => delPre(s.skill_id, p.id)}>×</button></span>)}</div></td>
                <td className="num">{s.effort_hours}</td><td className="num">{s.postings ?? 0}</td><td className="num">{s.roles_requiring ?? 0}</td><td className="num">{s.learners ?? 0}</td>
                <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => { setEditing(s.skill_id); setForm({ name: s.name, category: s.category, description: s.description, aliases: s.aliases.join(', '), effortHours: String(s.effort_hours) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                  <button className="btn sm ghost danger" onClick={() => del(s.skill_id)}>Delete</button></div></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {node}
    </div>
  );
}
