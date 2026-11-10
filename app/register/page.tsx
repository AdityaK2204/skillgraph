'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, fieldErrors } from '@/lib/client';
import { Field, Logo, Notice } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setErrs({});
    try {
      await api('/api/auth/register', { method: 'POST', json: form });
      router.push('/profile?welcome=1');
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
        <h1>Create your account</h1>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Full name" error={errs.fullName}>
          <input id="fullName" autoComplete="name" value={form.fullName} onChange={set('fullName')} aria-invalid={!!errs.fullName} />
        </Field>
        <Field label="Email" error={errs.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errs.email} />
        </Field>
        <Field label="Password" error={errs.password} help="At least 8 characters, with a letter and a number">
          <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-invalid={!!errs.password} />
        </Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="muted small">Already registered? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
