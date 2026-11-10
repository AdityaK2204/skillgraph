'use client';
import { useState } from 'react';
import { api, fmtDate, useApi } from '@/lib/client';
import { Badge, Field, Loading, PageHead, useToast } from '@/components/ui';

type U = { user_id: string; email: string; role: string; is_active: boolean; full_name: string; target_role: string | null; skills_claimed: number;
           skills_verified: number; evidence_pending: number; projects: number; readiness: string | null; last_login_at: string | null };

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { data, loading, reload } = useApi<U[]>(`/api/admin/users?q=${encodeURIComponent(q)}&role=${role}`);
  const { toast, node } = useToast();

  const patch = async (id: string, json: Record<string, unknown>) => {
    try { await api(`/api/admin/users/${id}`, { method: 'PATCH', json }); toast('Saved and audited'); reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="page">
      <PageHead title="Users" sub="Role-based access: students manage their own data, mentors review evidence, admins manage the catalogue, market data and users." />
      <div className="toolbar">
        <Field label="Search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" /></Field>
        <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All</option><option>student</option><option>mentor</option><option>admin</option></select></Field>
      </div>
      {loading || !data ? <Loading /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Target</th><th className="num">Readiness</th><th className="num">Skills (verified)</th><th className="num">Pending</th><th>Last sign-in</th><th>Active</th></tr></thead>
            <tbody>{data.map((u) => (
              <tr key={u.user_id}>
                <td><strong>{u.full_name}</strong><div className="muted small">{u.email}</div></td>
                <td><select aria-label={`Role of ${u.full_name}`} value={u.role} style={{ width: 110 }} onChange={(e) => patch(u.user_id, { role: e.target.value })}>
                  <option>student</option><option>mentor</option><option>admin</option></select></td>
                <td className="small">{u.target_role ?? '—'}</td>
                <td className="num">{u.readiness !== null ? `${Math.round(Number(u.readiness))}%` : '—'}</td>
                <td className="num">{u.skills_claimed} ({u.skills_verified})</td>
                <td className="num">{u.evidence_pending}</td>
                <td className="small muted">{fmtDate(u.last_login_at)}</td>
                <td><button className="btn sm" onClick={() => patch(u.user_id, { isActive: !u.is_active })}>{u.is_active ? <Badge kind="verified">active</Badge> : <Badge kind="rejected">disabled</Badge>}</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {node}
    </div>
  );
}
