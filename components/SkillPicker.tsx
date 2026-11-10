'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

export type PickedSkill = { skill_id: number; name: string; category: string };

/** Catalogue search box: full-text first, trigram "did you mean" when nothing matches. */
export function SkillPicker({ onPick, placeholder = 'Search skills, e.g. postgres or k8s', exclude = [], id }: {
  onPick: (s: PickedSkill) => void; placeholder?: string; exclude?: number[]; id?: string;
}) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ mode: string; skills: PickedSkill[] }>({ mode: 'all', skills: [] });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setRes({ mode: 'all', skills: [] }); return; }
    const t = setTimeout(() => {
      api<{ mode: string; skills: PickedSkill[] }>(`/api/skills?q=${encodeURIComponent(q)}`).then(setRes).catch(() => undefined);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const items = res.skills.filter((s) => !exclude.includes(s.skill_id));
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input id={id} value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off" />
      {open && q.trim() && (
        <div role="listbox" style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)',
          border: '1px solid var(--line)', borderRadius: 6, maxHeight: 260, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.08)' }}>
          {res.mode === 'did-you-mean' && items.length > 0 && <div className="small muted" style={{ padding: '6px 10px' }}>No exact match. Did you mean:</div>}
          {items.length ? items.map((s) => (
            <button key={s.skill_id} type="button" role="option" aria-selected={false}
              onClick={() => { onPick(s); setQ(''); setOpen(false); }}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '7px 10px', background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink)', font: 'inherit', textAlign: 'left' }}>
              <span>{s.name}</span><span className="badge">{s.category}</span>
            </button>
          )) : <div className="small muted" style={{ padding: '8px 10px' }}>No skills found</div>}
        </div>
      )}
    </div>
  );
}
