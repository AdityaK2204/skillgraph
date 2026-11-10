'use client';
import { useEffect, useState } from 'react';
import { api, fmtDate, useApi } from '@/lib/client';
import { Badge, Empty, Field, Loading, Notice, PageHead, Pips, useToast, LEVELS } from '@/components/ui';

type ResumeRow = { resume_id: string; file_name: string; file_size_bytes: number; parse_status: string; skills_detected: number; uploaded_at: string };
type Detail = {
  fileName: string; uploadedAt: string; mongoId: string; parser: { name: string; version: string }; sections: Record<string, number>;
  extracted: {
    skills: Array<{ skillId: number; name: string; matchedTerm: string; mentions: number; sections: string[]; suggestedLevel: number; currentClaimed: number; currentVerified: number }>;
    unknownTerms: string[]; education: Array<{ line: string; level: string | null; year: number | null }>; projects: Array<{ title: string }>; links: string[];
  };
};

export default function ResumePage() {
  const list = useApi<ResumeRow[]>('/api/resume');
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useApi<Detail>(selected ? `/api/resume/${selected}` : null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const { toast, node } = useToast();

  useEffect(() => { if (!selected && list.data?.length) setSelected(list.data[0].resume_id); }, [list.data, selected]);
  useEffect(() => {
    if (!detail.data) return;
    // pre-select skills where the resume suggests more than the user currently claims
    setPicks(Object.fromEntries(detail.data.extracted.skills
      .filter((s) => s.suggestedLevel > s.currentClaimed).map((s) => [s.skillId, s.suggestedLevel])));
  }, [detail.data]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    if (file) fd.append('file', file); else fd.append('text', text);
    setBusy(true);
    try {
      const r = await api<{ resumeId: string; skillsDetected: number }>('/api/resume', { method: 'POST', body: fd });
      toast(`Parsed: ${r.skillsDetected} skills detected. Review them below.`);
      setFile(null); setText('');
      await list.reload();
      setSelected(r.resumeId);
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };

  const importSkills = async () => {
    const skills = Object.entries(picks).map(([skillId, claimedLevel]) => ({ skillId: Number(skillId), claimedLevel }));
    if (!skills.length) return;
    setBusy(true);
    try {
      const edu = detail.data?.extracted.education.find((e) => e.level)?.level ?? null;
      const r = await api<{ imported: number }>(`/api/resume/${selected}/import`, { method: 'POST', json: { skills, applyProfile: { educationLevel: edu } } });
      toast(`${r.imported} skills saved as claims in one transaction.`);
      detail.reload();
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  };

  const d = detail.data;
  return (
    <div className="page">
      <PageHead title="Resume" sub="The full parsed document is stored in MongoDB (its structure differs from resume to resume); PostgreSQL keeps a pointer row. Everything found here is a claim until evidence is verified." />

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={upload}>
          <h2>Upload</h2>
          <Field label="PDF or .txt file (max 5 MB)">
            <input id="file" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="…or paste the text" help="Used only when no file is chosen">
            <textarea id="resumeText" value={text} onChange={(e) => setText(e.target.value)} rows={5} disabled={!!file} />
          </Field>
          <button className="btn primary" disabled={busy || (!file && text.trim().length < 50)}>{busy ? 'Parsing…' : 'Upload and parse'}</button>
        </form>

        <section className="card">
          <h2>Uploaded resumes</h2>
          {list.loading ? <Loading /> : list.data?.length ? (
            <div className="list">
              {list.data.map((r) => (
                <button key={r.resume_id} className="spread" onClick={() => setSelected(r.resume_id)}
                  style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
                  <span><strong style={{ color: selected === r.resume_id ? 'var(--accent)' : undefined }}>{r.file_name}</strong><br /><span className="muted small">{fmtDate(r.uploaded_at)} · {(r.file_size_bytes / 1024).toFixed(1)} KB</span></span>
                  <span className="row"><Badge kind={r.parse_status === 'parsed' ? 'verified' : 'pending'}>{r.parse_status}</Badge><span className="small">{r.skills_detected} skills</span></span>
                </button>
              ))}
            </div>
          ) : <Empty title="No resume yet">A sample is in <span className="kbd">samples/</span> in the project folder.</Empty>}
        </section>
      </div>

      {selected && (
        <section className="card">
          <div className="card-head">
            <h2>Detected skills {d ? `· ${d.fileName}` : ''}</h2>
            {d && <span className="hint mono">MongoDB _id {d.mongoId} · {d.parser.name} v{d.parser.version}</span>}
          </div>
          {detail.loading || !d ? <Loading /> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Import</th><th>Skill</th><th>Found as</th><th className="num">Mentions</th><th>Sections</th><th>You now</th><th>Level to claim</th></tr></thead>
                  <tbody>
                    {d.extracted.skills.map((s) => (
                      <tr key={s.skillId}>
                        <td><input type="checkbox" style={{ width: 'auto' }} checked={s.skillId in picks} aria-label={`Import ${s.name}`}
                          onChange={(e) => setPicks((p) => { const n = { ...p }; if (e.target.checked) n[s.skillId] = s.suggestedLevel; else delete n[s.skillId]; return n; })} /></td>
                        <td><strong>{s.name}</strong></td>
                        <td className="mono small">{s.matchedTerm}</td>
                        <td className="num">{s.mentions}</td>
                        <td className="small muted">{s.sections.join(', ')}</td>
                        <td><Pips claimed={s.currentClaimed} verified={s.currentVerified} /></td>
                        <td>
                          <select value={picks[s.skillId] ?? s.suggestedLevel} disabled={!(s.skillId in picks)} style={{ width: 140 }}
                            onChange={(e) => setPicks({ ...picks, [s.skillId]: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="spread">
                <span className="muted small">Levels never go down: an existing higher claim or a verified level is kept.</span>
                <button className="btn primary" onClick={importSkills} disabled={busy || !Object.keys(picks).length}>Import {Object.keys(picks).length} skills</button>
              </div>
              <div className="grid g3">
                <div className="stack"><h3>Sections found</h3><div className="chips">{Object.entries(d.sections).map(([k, v]) => <span key={k} className="chip">{k} <span className="muted">{v}</span></span>)}</div></div>
                <div className="stack"><h3>Education</h3>{d.extracted.education.length ? d.extracted.education.map((e, i) => <span key={i} className="small">{e.line} {e.level && <Badge>{e.level}</Badge>}</span>) : <span className="muted small">None detected</span>}</div>
                <div className="stack"><h3>Not in the catalogue</h3>{d.extracted.unknownTerms.length ? <div className="chips">{d.extracted.unknownTerms.map((t) => <span key={t} className="chip">{t}</span>)}</div> : <span className="muted small">Every term matched</span>}<span className="muted small">Admins see these across all resumes (MongoDB aggregation).</span></div>
              </div>
            </>
          )}
          {detail.error && <Notice kind="error">{detail.error}</Notice>}
        </section>
      )}
      {node}
    </div>
  );
}
