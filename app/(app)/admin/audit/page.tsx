'use client';
import { useState } from 'react';
import { useApi } from '@/lib/client';
import { Badge, Field, Loading, PageHead } from '@/components/ui';

type Row = { audit_id: number; changed_at: string; table_name: string; operation: string; row_pk: string; actor: string | null;
             old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

function diff(o: Record<string, unknown> | null, n: Record<string, unknown> | null) {
  if (!o || !n) return Object.entries(n ?? o ?? {}).filter(([k]) => !['created_at', 'updated_at'].includes(k)).slice(0, 4).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && k !== 'updated_at').map((k) => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`);
}

export default function AuditPage() {
  const [table, setTable] = useState('');
  const { data, loading } = useApi<Row[]>(`/api/admin/audit${table ? `?table=${table}` : ''}`);
  return (
    <div className="page">
      <PageHead title="Audit log" sub="Written by database triggers, not by application code, so no path can skip it. The actor comes from SET LOCAL app.user_id inside each API transaction; the application role cannot update or delete these rows." />
      <div className="toolbar"><Field label="Table"><select value={table} onChange={(e) => setTable(e.target.value)}><option value="">All</option>{['users', 'evidence', 'skills', 'career_roles', 'scoring_weights'].map((t) => <option key={t}>{t}</option>)}</select></Field></div>
      {loading || !data ? <Loading /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Table</th><th>Operation</th><th>Row</th><th>Actor</th><th>Change</th></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.audit_id}>
                <td className="small mono">{new Date(r.changed_at).toLocaleString('en-IN')}</td>
                <td className="mono small">{r.table_name}</td>
                <td><Badge kind={r.operation === 'DELETE' ? 'rejected' : r.operation === 'INSERT' ? 'verified' : 'pending'}>{r.operation}</Badge></td>
                <td className="mono small">{r.row_pk.slice(0, 13)}</td>
                <td className="small">{r.actor ?? <span className="muted">system</span>}</td>
                <td className="small mono">{diff(r.old_data, r.new_data).map((d, i) => <div key={i}>{d}</div>)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
