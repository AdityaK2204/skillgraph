'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, fieldErrors } from '@/lib/client';
import { Field, Logo, Notice } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setErrs({});
    try {
      const r = await api<{ role: string }>('/api/auth/login', { method: 'POST', json: { email, password } });
      router.push(next && next.startsWith('/') ? next : r.role === 'mentor' ? '/mentor' : r.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setErrs(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <div className="brand" style={{ padding: 0 }}><Logo />SkillGraph</div>
        <div className="stack" style={{ gap: 4 }}>
          <h1>Sign in</h1>
          <p className="muted">See what to learn next, why it matters for your target role, and how to prove it.</p>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Email" error={errs.email}>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" error={errs.password}>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">New here? <Link href="/register">Create a student account</Link></p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
