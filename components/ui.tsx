'use client';
import { useEffect, useState, type ReactNode } from 'react';

/** Level meter: solid = verified, hollow = claimed but unproven, ring = the level the goal requires. */
export function Pips({ claimed = 0, verified = 0, required }: { claimed?: number; verified?: number; required?: number | null }) {
  return (
    <span className="pips" role="img" aria-label={`claimed ${claimed} of 5, verified ${verified}${required ? `, required ${required}` : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`pip ${i <= verified ? 'verified' : i <= claimed ? 'claimed' : ''} ${required === i ? 'required' : ''}`} />
      ))}
    </span>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return <div className="bar" aria-hidden><span style={{ width: `${v * 100}%`, background: color }} /></div>;
}

export function Badge({ kind, children }: { kind?: string; children: ReactNode }) {
  return <span className={`badge ${kind ?? ''}`}>{children}</span>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok' | 'plain'; children: ReactNode }) {
  return <div className={`notice ${kind === 'plain' ? '' : kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong style={{ color: 'var(--ink)' }}>{title}</strong>{children}</div>;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="stack" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 22, width: `${90 - i * 12}%` }} />)}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="stat"><span className="label">{label}</span><span className="value">{value}{sub ? <small> {sub}</small> : null}</span></div>;
}

export function Field({ label, error, help, children }: { label: string; error?: string; help?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub ? <p className="sub">{sub}</p> : null}</div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

/** Small transient confirmation in the corner. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;
  return { toast: (text: string, kind: 'ok' | 'error' = 'ok') => setMsg({ text, kind }), node };
}

export const CATEGORIES = ['language', 'frontend', 'backend', 'data', 'ml', 'devops', 'cloud', 'database', 'foundation', 'soft'];
export const LEVELS = ['', '1 · Aware', '2 · Beginner', '3 · Working', '4 · Strong', '5 · Expert'];

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 18 L12 6 L19 14" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="5" cy="18" r="3" fill="var(--learn)" />
      <circle cx="12" cy="6" r="3" fill="var(--build)" />
      <circle cx="19" cy="14" r="3" fill="var(--prove)" />
    </svg>
  );
}
