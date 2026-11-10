'use client';
import { useState } from 'react';
import { api, fieldErrors, fmtDate, useApi } from '@/lib/client';
import { Badge, Field, Loading, PageHead, useToast } from '@/components/ui';

type Src = { _id: string; source: string; externalId: string; status: string; error?: string; ingestedAt: string; normalized?: { title: string; company: string };
             unresolvedSkills?: string[]; payloadFields: string[] };
type Market = { refreshedAt: string | null; signals: Array<{ skill_name: string; demand_score: string; posting_count: number }> };
const blank = { title: '', company: '', location: '', workMode: 'hybrid', description: '', requiredSkills: '', optionalSkills: '', roleTitle: '', salaryMin: '', salaryMax: '' };

export default function AdminJobs() {
  const sources = useApi<Src[]>('/api/admin/jobs');
  const market = useApi<Market>('/api/admin/market');
  const { toast, node } = useToast();
  const [form, setForm] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const ingest = async (e: React.FormEvent) => {
    e.preventDefault(); setErrs({}); setBusy(true);
    try {
      const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
      const r = await api<{ status: string; unresolved?: string[] }>('/api/admin/jobs', { method: 'POST', json: {
        ...form, requiredSkills: list(form.requiredSkills), optionalSkills: list(form.optionalSkills), roleTitle: form.roleTitle || null,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null, salaryMax: form.salaryMax ? Number(form.salaryMax) : null } });
      toast(`Ingested${r.unresolved?.length ? `; not in catalogue: ${r.unresolved.join(', ')}` : ''}. Refresh market signals to include it.`);
      setForm(blank); sources.reload();
    } catch (err) { setErrs(fieldErrors(err)); toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true);
    try { const r = await api<{ signals: number; ms: number }>('/api/admin/market', { method: 'POST' }); toast(`refresh_market_signals(): ${r.signals} signals in ${r.ms} ms`); market.reload(); }
    catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHead title="Jobs & market" sub="Raw postings are stored in MongoDB exactly as each source sends them, then normalised into PostgreSQL with resolved skills and an embedding."
        actions={<button className="btn primary" onClick={refresh} disabled={busy}>Refresh market signals</button>} />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={ingest} noValidate>
          <h2>Add a posting</h2>
          <div className="form-grid">
            <Field label="Title" error={errs.title}><input value={form.title} onChange={set('title')} /></Field>
            <Field label="Company" error={errs.company}><input value={form.company} onChange={set('company')} /></Field>
            <Field label="Location" error={errs.location}><input value={form.location} onChange={set('location')} /></Field>
            <Field label="Work mode"><select value={form.workMode} onChange={set('workMode')}><option>onsite</option><option>hybrid</option><option>remote</option></select></Field>
            <Field label="Salary min (LPA)" error={errs.salaryMin}><input type="number" value={form.salaryMin} onChange={set('salaryMin')} /></Field>
            <Field label="Salary max (LPA)" error={errs.salaryMax}><input type="number" value={form.salaryMax} onChange={set('salaryMax')} /></Field>
          </div>
          <Field label="Description" error={errs.description} help="At least 30 characters"><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
          <Field label="Required skills" error={errs.requiredSkills} help="Comma-separated names or aliases, e.g. SQL, postgres, power bi"><input value={form.requiredSkills} onChange={set('requiredSkills')} /></Field>
          <Field label="Nice-to-have skills"><input value={form.optionalSkills} onChange={set('optionalSkills')} /></Field>
          <Field label="Role (optional)" help="Left empty, the role with the largest requirement overlap is chosen"><input value={form.roleTitle} onChange={set('roleTitle')} /></Field>
          <div><button className="btn primary" disabled={busy}>Ingest posting</button></div>
        </form>

        <section className="card">
          <div className="card-head"><h2>Market signals</h2><span className="hint">{market.data?.refreshedAt ? `refreshed ${fmtDate(market.data.refreshedAt)}` : 'never refreshed'}</span></div>
          <p className="muted small">Share of active postings asking for each skill (required = 1, optional = 0.5, postings older than 90 days count half).</p>
          {market.loading ? <Loading /> : (
            <div className="list">{market.data?.signals.map((s) => (
              <div key={s.skill_name} className="spread"><span>{s.skill_name}</span><span className="num small">{Math.round(Number(s.demand_score) * 100)}% · {s.posting_count} postings</span></div>))}</div>
          )}
        </section>
      </div>

      <section className="stack">
        <h2>Recent ingestions (MongoDB job_sources)</h2>
        {sources.loading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Source</th><th>Posting</th><th>Raw fields</th><th>Status</th><th>Notes</th><th>Ingested</th></tr></thead>
              <tbody>{sources.data?.map((s) => (
                <tr key={s._id}>
                  <td className="mono small">{s.source}<div className="muted">{s.externalId}</div></td>
                  <td>{s.normalized ? <><strong>{s.normalized.title}</strong><div className="muted small">{s.normalized.company}</div></> : <span className="muted">—</span>}</td>
                  <td className="small mono muted" style={{ maxWidth: 260 }}>{s.payloadFields.join(', ')}</td>
                  <td><Badge kind={s.status === 'normalized' ? 'verified' : s.status === 'rejected' ? 'rejected' : 'pending'}>{s.status}</Badge></td>
                  <td className="small">{s.error ?? (s.unresolvedSkills?.length ? `unresolved: ${s.unresolvedSkills.join(', ')}` : '')}</td>
                  <td className="small muted">{fmtDate(s.ingestedAt)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
      {node}
    </div>
  );
}
