'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, useApi } from '@/lib/client';
import { Logo } from './ui';

type Me = { userId: string; email: string; role: 'student' | 'mentor' | 'admin'; fullName: string };

const NAV: Array<{ label: string; roles?: Me['role'][]; links: Array<[string, string]> }> = [
  { label: 'You', links: [['/dashboard', 'Dashboard'], ['/profile', 'Profile & goal'], ['/resume', 'Resume'], ['/skills', 'Skills'], ['/projects', 'Projects'], ['/evidence', 'Evidence']] },
  { label: 'Plan', links: [['/gap', 'Gap analysis'], ['/roadmap', 'Roadmap'], ['/graph', 'Skill graph'], ['/jobs', 'Jobs']] },
  { label: 'Mentor', roles: ['mentor', 'admin'], links: [['/mentor', 'Review queue']] },
  { label: 'Admin', roles: ['admin'], links: [['/admin', 'Analytics'], ['/admin/users', 'Users'], ['/admin/catalog', 'Skill catalogue'], ['/admin/jobs', 'Jobs & market'], ['/admin/audit', 'Audit log']] },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: me } = useApi<Me>('/api/auth/me');
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const signOut = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <Link href="/dashboard" className="brand"><Logo />SkillGraph</Link>
        {NAV.filter((g) => !g.roles || (me && g.roles.includes(me.role))).map((g) => (
          <nav key={g.label} className="nav-group">
            <span className="nav-label">{g.label}</span>
            {g.links.map(([href, label]) => {
              const active = href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/');
              return <Link key={href} href={href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>{label}</Link>;
            })}
          </nav>
        ))}
        <div className="whoami">
          {me ? <>
            <span className="name">{me.fullName}</span>
            <span className="muted small">{me.email}</span>
            <span><span className="badge accent">{me.role}</span></span>
          </> : <span className="skeleton" style={{ height: 40 }} />}
          <button className="btn sm" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="mobile-bar">
          <button className="btn sm" onClick={() => setOpen(true)} aria-label="Open navigation">Menu</button>
          <span className="brand" style={{ padding: 0 }}><Logo size={18} />SkillGraph</span>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
