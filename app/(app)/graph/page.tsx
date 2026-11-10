'use client';
import { useMemo, useState } from 'react';
import { api, useApi } from '@/lib/client';
import { Badge, Empty, Field, Loading, Notice, PageHead } from '@/components/ui';

type Node = { id: number; name: string; category: string; required: number | null; claimed: number; verified: number; effective: number; depth: number;
              state: 'proven' | 'met' | 'partial' | 'missing' };
type Graph = { roleId: number; source: string; nodes: Node[]; edges: Array<{ from: number; to: number; strength: number }>; pivots: Array<{ title: string; shared: number }> };
type Role = { role_id: number; title: string };

const W = 158, H = 36, COL = 214, ROW = 50, PAD = 24;
const STATE: Record<Node['state'], { fill: string; stroke: string; label: string }> = {
  proven: { fill: 'var(--prove-soft)', stroke: 'var(--prove)', label: 'Proven' },
  met: { fill: 'var(--accent-soft)', stroke: 'var(--accent)', label: 'Met by claims' },
  partial: { fill: 'var(--warn-soft)', stroke: 'var(--warn)', label: 'Partial' },
  missing: { fill: 'var(--surface)', stroke: 'var(--danger)', label: 'Missing' },
};

export default function GraphPage() {
  const roles = useApi<Role[]>('/api/roles');
  const [roleId, setRoleId] = useState<number | null>(null);
  const { data, error, loading } = useApi<Graph>(`/api/graph${roleId ? `?roleId=${roleId}` : ''}`);
  const [hover, setHover] = useState<number | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [chain, setChain] = useState<{ chain: string[]; source: string } | null>(null);

  const layout = useMemo(() => {
    if (!data) return null;
    const maxDepth = Math.max(0, ...data.nodes.map((n) => n.depth));
    const cols = new Map<number, Node[]>();
    for (const n of data.nodes) cols.set(n.depth, [...(cols.get(n.depth) ?? []), n]);
    const pos = new Map<number, { x: number; y: number }>();
    let rows = 0;
    for (const [depth, list] of cols) {
      list.sort((a, b) => (b.required ?? 0) - (a.required ?? 0) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      list.forEach((n, i) => pos.set(n.id, { x: PAD + (maxDepth - depth) * COL, y: PAD + 22 + i * ROW }));
      rows = Math.max(rows, list.length);
    }
    return { pos, width: PAD * 2 + maxDepth * COL + W, height: PAD * 2 + 22 + rows * ROW, maxDepth };
  }, [data]);

  const findPath = async () => {
    if (!from || !to) return;
    setChain(await api<{ chain: string[]; source: string }>(`/api/graph?from=${from}&to=${to}`).catch(() => ({ chain: [], source: 'error' })));
  };

  const linked = (id: number) => hover !== null && (id === hover || data?.edges.some((e) => (e.from === hover && e.to === id) || (e.to === hover && e.from === id)));

  return (
    <div className="page">
      <PageHead title="Skill graph"
        sub="Required skills for the role (right) and every prerequisite reached by walking the graph (left). Arrows point from a prerequisite to the skill it unlocks."
        actions={data && <Badge kind={data.source === 'neo4j' ? 'verified' : 'pending'}>answered by {data.source === 'neo4j' ? 'Neo4j (Cypher)' : 'PostgreSQL (recursive CTE)'}</Badge>} />

      <div className="toolbar">
        <Field label="Role">
          <select value={roleId ?? data?.roleId ?? ''} onChange={(e) => { setRoleId(Number(e.target.value)); setChain(null); }}>
            {roles.data?.map((r) => <option key={r.role_id} value={r.role_id}>{r.title}</option>)}
          </select>
        </Field>
        <div className="legend" style={{ flex: '3 1 380px', alignSelf: 'center' }}>
          {Object.entries(STATE).map(([k, s]) => <span key={k}><span className="dot" style={{ background: s.fill, border: `2px solid ${s.stroke}` }} />{s.label}</span>)}
          <span><span className="dot" style={{ border: '2px solid var(--ink)' }} />thick border = required by role</span>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {loading || !data || !layout ? <Loading rows={6} /> : data.nodes.length === 0 ? <div className="card"><Empty title="No requirements for this role" /></div> : (
        <div className="graph-canvas">
          <svg width={layout.width} height={layout.height} role="img" aria-label="Prerequisite graph for the selected role">
            {Array.from({ length: layout.maxDepth + 1 }, (_, i) => (
              <text key={i} x={PAD + i * COL} y={PAD} fontSize="11" fill="var(--faint)" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {i === layout.maxDepth ? 'required' : `${layout.maxDepth - i} step${layout.maxDepth - i > 1 ? 's' : ''} before`}
              </text>
            ))}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--faint)" />
              </marker>
            </defs>
            {data.edges.map((e, i) => {
              const a = layout.pos.get(e.from), b = layout.pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x - 2, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
              const on = hover !== null && (e.from === hover || e.to === hover);
              return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" markerEnd="url(#arrow)"
                stroke={on ? 'var(--accent)' : 'var(--line)'} strokeWidth={on ? 2 : 1 + e.strength * 0.6} opacity={hover !== null && !on ? 0.35 : 1} />;
            })}
            {data.nodes.map((n) => {
              const p = layout.pos.get(n.id)!;
              const s = STATE[n.state];
              const dim = hover !== null && !linked(n.id);
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                   opacity={dim ? 0.35 : 1} style={{ cursor: 'default' }}>
                  <title>{`${n.name}: you ${n.effective.toFixed(1)} (claimed ${n.claimed}, verified ${n.verified})${n.required ? `, role needs ${n.required}` : ', prerequisite'}`}</title>
                  <rect width={W} height={H} rx={6} fill={s.fill} stroke={s.stroke} strokeWidth={n.required ? 2.2 : 1}
                        strokeDasharray={n.state === 'missing' ? '4 3' : undefined} />
                  <text x={10} y={15} fontSize="12" fontWeight={600} fill="var(--ink)">{n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name}</text>
                  <text x={10} y={29} fontSize="10.5" fill="var(--muted)">{n.effective.toFixed(1)}{n.required ? ` / ${n.required}` : ' · prereq'} · {n.category}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {data && (
        <div className="grid g2">
          <section className="card">
            <h2>Shortest prerequisite path</h2>
            <div className="toolbar">
              <Field label="From"><select value={from} onChange={(e) => setFrom(Number(e.target.value))}><option value={0}>Choose</option>{[...data.nodes].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></Field>
              <Field label="To"><select value={to} onChange={(e) => setTo(Number(e.target.value))}><option value={0}>Choose</option>{[...data.nodes].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></Field>
              <button className="btn" onClick={findPath} disabled={!from || !to}>Find path</button>
            </div>
            {chain && (chain.chain.length ? <p><strong>{chain.chain.join(' → ')}</strong> <span className="muted small">({chain.chain.length - 1} steps, {chain.source})</span></p>
              : <p className="muted">No prerequisite chain leads from the first skill to the second.</p>)}
          </section>
          <section className="card">
            <h2>Related roles</h2>
            <p className="muted small">Roles that share the most requirements with this one: realistic alternatives with the same foundation.</p>
            <div className="list">{data.pivots.map((p) => <div key={p.title} className="spread"><span>{p.title}</span><span className="num">{p.shared} shared skills</span></div>)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
