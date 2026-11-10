'use client';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useApi } from '@/lib/client';
import { Badge, Bar, Empty, Loading, Notice, PageHead, Pips, Stat } from '@/components/ui';

type Req = { skill_id: number; skill_name: string; category: string; required_level: number; importance: string; claimed_level: number;
             verified_level: number; effective_level: string; gap: string; gap_status: string };
type Pri = { skill_id: number; skill_name: string; is_direct: boolean; required_level: number; effective_level: string; claimed_level: number; verified_level: number;
             demand: string; relevance: string; gap: string; readiness: string; interest: string; evidence: string; ease: string; priority: string;
             prereqs_total: number; prereqs_met: number; missing_prereqs: string[] };
type Gap = { goal: { role_title: string } | null; summary: { readiness: string; proven: number; met: number; partial: number; missing: number };
             requirements: Req[]; priorities: Pri[]; weights: Array<{ factor: string; weight: string; label: string }> };

const FACTORS: Array<[keyof Pri, string]> = [['demand', 'Demand'], ['relevance', 'Relevance'], ['gap', 'Gap'], ['readiness', 'Readiness'], ['interest', 'Interest'], ['evidence', 'Evidence'], ['ease', 'Ease']];

export default function GapPage() {
  const { data, error, loading } = useApi<Gap>('/api/gap');
  const [open, setOpen] = useState<number | null>(null);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (loading || !data) return <div className="page"><Loading rows={8} /></div>;
  if (!data.goal) return <div className="page"><PageHead title="Gap analysis" /><div className="card"><Empty title="No target role yet"><Link className="btn primary" href="/profile">Choose a target role</Link></Empty></div></div>;
  const w = Object.fromEntries(data.weights.map((x) => [x.factor, Number(x.weight)]));

  return (
    <div className="page">
      <PageHead title={`Gap analysis · ${data.goal.role_title}`}
        sub="Every requirement of your target role compared with your levels, then every missing skill (including prerequisites found by walking the skill graph) ranked by seven explainable factors." />

      <div className="card">
        <div className="grid g4">
          <Stat label="Readiness" value={`${Math.round(Number(data.summary.readiness))}%`} />
          <Stat label="Proven" value={data.summary.proven} sub="verified at required level" />
          <Stat label="Met by claims" value={data.summary.met} />
          <Stat label="Partial" value={data.summary.partial} />
          <Stat label="Missing" value={data.summary.missing} />
        </div>
      </div>

      <section className="stack">
        <div className="spread"><h2>Ranked priorities</h2><span className="muted small">priority = Σ weight × factor ÷ Σ weights · click a row for the breakdown</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="num">#</th><th>Skill</th><th>Level now → needed</th>{FACTORS.map(([, l]) => <th key={l} className="num">{l}</th>)}<th>Priority</th></tr></thead>
            <tbody>
              {data.priorities.map((p, i) => (
                <Fragment key={p.skill_id}>
                  <tr onClick={() => setOpen(open === p.skill_id ? null : p.skill_id)} style={{ cursor: 'pointer' }} aria-expanded={open === p.skill_id}>
                    <td className="num muted">{i + 1}</td>
                    <td><strong>{p.skill_name}</strong> {!p.is_direct && <Badge>prerequisite</Badge>}</td>
                    <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Pips claimed={p.claimed_level} verified={p.verified_level} required={p.required_level} /><span className="num small">{Number(p.effective_level).toFixed(1)} → {p.required_level}</span></span></td>
                    {FACTORS.map(([k]) => <td key={k} className="num small">{Number(p[k]).toFixed(2)}</td>)}
                    <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Bar value={Number(p.priority)} /><strong className="num">{Number(p.priority).toFixed(3)}</strong></span></td>
                  </tr>
                  {open === p.skill_id && (
                    <tr><td colSpan={FACTORS.length + 4} style={{ background: 'var(--surface-2)' }}>
                      <div className="grid g2">
                        <div className="factor-grid">
                          {FACTORS.map(([k, l]) => (
                            <Fragment key={k}><span>{l} <span className="muted">×{w[k as string]?.toFixed(2)}</span></span><Bar value={Number(p[k])} /><span className="num">{Number(p[k]).toFixed(2)}</span></Fragment>
                          ))}
                        </div>
                        <div className="stack small">
                          <span><strong>Prerequisites:</strong> {p.prereqs_total ? `${p.prereqs_met} of ${p.prereqs_total} in place` : 'none'}{p.missing_prereqs.length ? ` · missing ${p.missing_prereqs.join(', ')}` : ''}</span>
                          <span><strong>Evidence factor:</strong> {Number(p.evidence) === 1 ? 'you claim this skill but have not proven it, so evidence would add the most'
                            : p.verified_level > 0 ? `verified at ${p.verified_level}; evidence at level ${p.required_level} would close the gap`
                            : 'no claim yet; learn it first, then prove it'}</span>
                          <span className="muted">{data.weights.map((x) => `${x.factor}: ${x.label}`).join(' · ')}</span>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>Role requirements</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Skill</th><th>Area</th><th className="num">Importance</th><th>You</th><th className="num">Needed</th><th className="num">Gap</th><th>Status</th></tr></thead>
            <tbody>
              {data.requirements.map((r) => (
                <tr key={r.skill_id}>
                  <td><strong>{r.skill_name}</strong></td><td><Badge>{r.category}</Badge></td>
                  <td className="num">{Number(r.importance).toFixed(2)}</td>
                  <td><Pips claimed={r.claimed_level} verified={r.verified_level} required={r.required_level} /></td>
                  <td className="num">{r.required_level}</td><td className="num">{Number(r.gap).toFixed(1)}</td>
                  <td><Badge kind={r.gap_status}>{r.gap_status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
