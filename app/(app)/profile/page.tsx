'use client';
import { useEffect, useState } from 'react';
import { api, fieldErrors, fmtDate, useApi } from '@/lib/client';
import { Badge, Field, Loading, Notice, PageHead, useToast } from '@/components/ui';

type ProfileRes = {
  profile: { full_name: string; education_level: string | null; institution: string | null; graduation_year: number | null;
             interests: string[]; bio: string | null; weekly_hours: number; email: string; has_embedding: boolean };
  goal: { role_id: number; role_title: string; target_date: string | null } | null;
};
type Role = { role_id: number; title: string; domain: string; description: string; requirements: number; postings: number;
              profile_fit: string | null; skills: Array<{ skill: string; level: number }> };

export default function ProfilePage() {
  const { data, loading, reload } = useApi<ProfileRes>('/api/profile');
  const roles = useApi<Role[]>('/api/roles');
  const { toast, node } = useToast();
  const [form, setForm] = useState({ fullName: '', educationLevel: '', institution: '', graduationYear: '', interests: '', bio: '', weeklyHours: '8' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [roleId, setRoleId] = useState<number | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    setForm({ fullName: p.full_name, educationLevel: p.education_level ?? '', institution: p.institution ?? '',
      graduationYear: p.graduation_year ? String(p.graduation_year) : '', interests: p.interests.join(', '), bio: p.bio ?? '', weeklyHours: String(p.weekly_hours) });
    setRoleId(data.goal?.role_id ?? null);
    setTargetDate(data.goal?.target_date?.slice(0, 10) ?? '');
  }, [data]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrs({});
    try {
      await api('/api/profile', { method: 'PUT', json: {
        fullName: form.fullName, educationLevel: form.educationLevel || null, institution: form.institution || null,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : null,
        interests: form.interests.split(',').map((s) => s.trim()).filter(Boolean), bio: form.bio || null, weeklyHours: Number(form.weeklyHours) } });
      toast('Profile saved. Your profile vector was updated.');
      reload(); roles.reload();
    } catch (err) {
      setErrs(fieldErrors(err)); toast((err as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const setGoal = async () => {
    if (!roleId) return;
    setBusy(true);
    try {
      await api('/api/goals', { method: 'POST', json: { roleId, targetDate: targetDate || null } });
      toast('Goal set and a first roadmap generated.');
      reload();
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };

  if (loading || !data) return <div className="page"><Loading rows={6} /></div>;
  const welcome = typeof window !== 'undefined' && window.location.search.includes('welcome');

  return (
    <div className="page">
      <PageHead title="Profile & goal" sub="Your interests and bio feed the semantic parts of SkillGraph: the interest factor of each priority and job matching." />
      {welcome && <Notice kind="ok">Account created. Fill in your profile, then choose a target role.</Notice>}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={save} noValidate>
          <h2>About you</h2>
          <div className="form-grid">
            <Field label="Full name" error={errs.fullName}><input id="fullName" value={form.fullName} onChange={set('fullName')} /></Field>
            <Field label="Education" error={errs.educationLevel}>
              <select id="educationLevel" value={form.educationLevel} onChange={set('educationLevel')}>
                <option value="">Not set</option>
                {['high_school', 'diploma', 'bachelors', 'masters', 'phd', 'other'].map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Institution" error={errs.institution}><input id="institution" value={form.institution} onChange={set('institution')} /></Field>
            <Field label="Graduation year" error={errs.graduationYear}><input id="graduationYear" inputMode="numeric" value={form.graduationYear} onChange={set('graduationYear')} /></Field>
            <Field label="Hours per week for learning" error={errs.weeklyHours} help="1 to 80; used to estimate roadmap duration"><input id="weeklyHours" type="number" min={1} max={80} value={form.weeklyHours} onChange={set('weeklyHours')} /></Field>
          </div>
          <Field label="Interests" error={errs.interests} help="Comma-separated, up to 15 (e.g. dashboards, fintech, healthcare)"><input id="interests" value={form.interests} onChange={set('interests')} /></Field>
          <Field label="Short bio" error={errs.bio}><textarea id="bio" value={form.bio} onChange={set('bio')} maxLength={1000} /></Field>
          <div className="spread">
            <span className="muted small">{data.profile.email} · profile vector {data.profile.has_embedding ? <Badge kind="verified">stored</Badge> : <Badge kind="pending">not yet</Badge>}</span>
            <button className="btn primary" disabled={busy}>Save profile</button>
          </div>
        </form>

        <section className="card">
          <div className="card-head"><h2>Target role</h2>{data.goal && <Badge kind="accent">current: {data.goal.role_title}</Badge>}</div>
          <p className="muted small">Ranked by cosine similarity between your profile vector and each role (pgvector). Changing the role retires the old goal and generates a new roadmap.</p>
          {roles.loading ? <Loading /> : (
            <div className="list" role="radiogroup" aria-label="Career roles">
              {roles.data?.map((r) => (
                <label key={r.role_id} className="row" style={{ alignItems: 'flex-start', cursor: 'pointer', flexWrap: 'nowrap' }}>
                  <input type="radio" name="role" style={{ width: 'auto', marginTop: 3 }} checked={roleId === r.role_id} onChange={() => setRoleId(r.role_id)} />
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="spread"><strong>{r.title}</strong><span className="num small muted">{r.profile_fit !== null ? `fit ${Number(r.profile_fit).toFixed(2)}` : ''}</span></span>
                    <span className="muted small">{r.description}</span>
                    <span className="small muted">{r.requirements} required skills · {r.postings} open postings · top: {r.skills.slice(0, 4).map((s) => s.skill).join(', ')}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="toolbar">
            <Field label="Target date (optional)"><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
            <button className="btn primary" disabled={!roleId || busy || (roleId === data.goal?.role_id && (targetDate || '') === (data.goal?.target_date?.slice(0, 10) ?? ''))} onClick={setGoal} type="button">
              {data.goal ? 'Change goal' : 'Set goal'}
            </button>
          </div>
          {data.goal?.target_date && <p className="small muted">Current target date: {fmtDate(data.goal.target_date)}</p>}
        </section>
      </div>
      {node}
    </div>
  );
}
