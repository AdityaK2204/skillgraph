'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, fmtDate, useApi } from '@/lib/client';
import { Badge, CATEGORIES, Empty, Field, LEVELS, Loading, PageHead, Pips, useToast } from '@/components/ui';
import { SkillPicker, type PickedSkill } from '@/components/SkillPicker';

type Row = { skill_id: number; skill_name: string; category: string; claimed_level: number; verified_level: number; effective_level: string;
             unproven_claim: boolean; source: string; updated_at: string; pending_evidence: number; required_for_goal: number | null };

export default function SkillsPage() {
  const { data, loading, reload } = useApi<Row[]>('/api/me/skills');
  const { toast, node } = useToast();
  const [pick, setPick] = useState<PickedSkill | null>(null);
  const [level, setLevel] = useState(2);
  const [cat, setCat] = useState('');
  const [view, setView] = useState<'all' | 'unproven' | 'verified' | 'goal'>('all');

  const rows = useMemo(() => (data ?? []).filter((r) =>
    (!cat || r.category === cat) &&
    (view === 'all' || (view === 'unproven' && r.unproven_claim) || (view === 'verified' && r.verified_level > 0) || (view === 'goal' && r.required_for_goal))), [data, cat, view]);

  const save = async (skillId: number, claimedLevel: number) => {
    try {
      await api('/api/me/skills', { method: 'POST', json: { skillId, claimedLevel } });
      toast('Saved'); setPick(null); reload();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (skillId: number) => {
    try { await api(`/api/me/skills?skillId=${skillId}`, { method: 'DELETE' }); toast('Removed'); reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="page">
      <PageHead title="Skills" sub={<>Your claimed level is what you say; the verified level only rises when a mentor accepts <Link href="/evidence">evidence</Link>. Unproven claims count half towards readiness.</>} />

      <section className="card">
        <h2>Add or update a skill</h2>
        <div className="toolbar">
          <Field label="Skill">{pick ? <div className="row"><strong>{pick.name}</strong><button className="btn sm ghost" onClick={() => setPick(null)}>Change</button></div>
            : <SkillPicker id="skill-search" onPick={setPick} exclude={[]} />}</Field>
          <Field label="Your level"><select value={level} onChange={(e) => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}</select></Field>
          <button className="btn primary" disabled={!pick} onClick={() => pick && save(pick.skill_id, level)}>Save claim</button>
        </div>
      </section>

      <section className="stack">
        <div className="toolbar">
          <Field label="Area"><select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All areas</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Show">
            <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
              <option value="all">All skills</option><option value="goal">Required for my goal</option><option value="unproven">Claims without proof</option><option value="verified">Verified</option>
            </select>
          </Field>
          <div className="legend" style={{ flex: '2 1 300px', alignSelf: 'center' }}>
            <span><span className="pip verified" /> verified</span><span><span className="pip claimed" /> claimed, unproven</span><span><span className="pip required" /> required by goal</span>
          </div>
        </div>
        {loading ? <Loading /> : rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Skill</th><th>Area</th><th>Level</th><th className="num">Effective</th><th>Source</th><th>Evidence</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.skill_id}>
                    <td><strong>{r.skill_name}</strong>{r.required_for_goal ? <span className="muted small"> · goal needs {r.required_for_goal}</span> : null}</td>
                    <td><Badge>{r.category}</Badge></td>
                    <td><Pips claimed={r.claimed_level} verified={r.verified_level} required={r.required_for_goal} /></td>
                    <td className="num">{Number(r.effective_level).toFixed(1)}</td>
                    <td className="small">{r.source}</td>
                    <td>{r.verified_level > 0 ? <Badge kind="verified">verified {r.verified_level}</Badge> : r.pending_evidence ? <Badge kind="pending">{r.pending_evidence} pending</Badge> : <Link className="small" href={`/evidence?skill=${r.skill_id}`}>Add proof</Link>}</td>
                    <td className="small muted">{fmtDate(r.updated_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <select aria-label={`Claimed level for ${r.skill_name}`} value={r.claimed_level} style={{ width: 72 }} onChange={(e) => save(r.skill_id, Number(e.target.value))}>
                          {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l} disabled={l < r.verified_level}>{l}</option>)}
                        </select>
                        <button className="btn sm ghost danger" onClick={() => remove(r.skill_id)} disabled={r.verified_level > 0} title={r.verified_level > 0 ? 'Verified skills cannot be removed' : 'Remove'}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="card"><Empty title="No skills match">Add one above or import from your <Link href="/resume">resume</Link>.</Empty></div>}
      </section>
      {node}
    </div>
  );
}
