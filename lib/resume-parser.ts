/**
 * Rule-based resume intelligence.
 * 1. extract text (PDF via unpdf, or plain text)
 * 2. split into sections by recognised headings
 * 3. match the skill catalogue (names + aliases) with word-boundary rules
 * 4. suggest a starting level from where and how often a skill appears
 * 5. collect unknown terms from the skills section (catalogue gaps, aggregated in MongoDB)
 * Every suggestion is a CLAIM; it only becomes verified through reviewed evidence.
 */
export const PARSER = { name: 'skillgraph-rules', version: '1.2.0' };

export interface CatalogSkill { skillId: number; name: string; aliases: string[] }
export interface ExtractedSkill {
  skillId: number; name: string; matchedTerm: string; mentions: number; sections: string[]; suggestedLevel: number;
}
export interface ParsedResume {
  text: string;
  sections: Record<string, string[]>;
  extracted: {
    skills: ExtractedSkill[];
    unknownTerms: string[];
    education: Array<{ line: string; level: string | null; year: number | null }>;
    projects: Array<{ title: string }>;
    links: string[];
  };
}

export async function extractText(buf: Buffer, mime: string): Promise<string> {
  if (mime === 'application/pdf') {
    // Rebuild lines from text positions: headings must stay on their own line for section detection
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const out: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, Array<{ x: number; s: string }>>();
      for (const it of content.items as Array<{ str?: string; transform?: number[] }>) {
        if (!it.str || !it.transform) continue;
        const y = Math.round(it.transform[5] / 2) * 2;          // tolerate tiny baseline differences
        (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
      }
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        out.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((r) => r.s).join(' ').replace(/\s+/g, ' ').trim());
      }
      out.push('');
    }
    return out.join('\n');
  }
  return buf.toString('utf8');
}

const HEADINGS: Array<[string, RegExp]> = [
  ['summary', /^(professional\s+)?(summary|objective|profile|about me)\b/i],
  ['education', /^(education|academic(s| background| qualifications)?|qualifications)\b/i],
  ['experience', /^(work\s+|professional\s+)?(experience|employment|internships?|work history)\b/i],
  ['projects', /^(academic\s+|personal\s+|key\s+)?projects?\b/i],
  ['skills', /^(technical\s+|core\s+|key\s+)?(skills|technologies|tech stack|tools|competencies)\b/i],
  ['certifications', /^(certifications?|certificates|courses|achievements|awards)\b/i],
];

export function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = 'header';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const bare = line.replace(/[:\-–|•]+$/g, '').trim();
    const heading = bare.length <= 40 ? HEADINGS.find(([, re]) => re.test(bare)) : undefined;
    if (heading) {
      current = heading[0];
      sections[current] ??= [];
      const rest = line.slice(line.search(/[:\-–]/) + 1).trim();
      if (/[:\-–]/.test(line) && rest && !heading[1].test(rest)) sections[current].push(rest);
      continue;
    }
    (sections[current] ??= []).push(line);
  }
  return sections;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRegex = (term: string) => new RegExp(`(?<![a-z0-9+#.])${escape(term.toLowerCase())}(?![a-z0-9+#])`, 'g');
// names that are also common English words: only trusted inside the skills section
const AMBIGUOUS = new Set(['go', 'testing', 'communication', 'excel', 'statistics', 'tableau', 'spark']);

export function matchSkills(sections: Record<string, string[]>, catalog: CatalogSkill[]): ExtractedSkill[] {
  const sectionText = Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n').toLowerCase()]));
  const found: ExtractedSkill[] = [];
  for (const skill of catalog) {
    const terms = [skill.name, ...skill.aliases].filter((t) => t && t.length >= 2);
    let best: ExtractedSkill | null = null;
    for (const term of terms) {
      const re = termRegex(term);
      let mentions = 0;
      const where: string[] = [];
      for (const [sec, txt] of Object.entries(sectionText)) {
        if (sec === 'header') continue;   // name and contact links (github.com, …) are not skills
        if (AMBIGUOUS.has(term.toLowerCase()) && sec !== 'skills') continue;
        const n = (txt.match(re) ?? []).length;
        if (n) { mentions += n; where.push(sec); }
      }
      if (mentions && (!best || mentions > best.mentions)) {
        best = { skillId: skill.skillId, name: skill.name, matchedTerm: term, mentions, sections: where, suggestedLevel: 0 };
      }
    }
    if (best) {
      const applied = best.sections.some((s) => s === 'experience' || s === 'projects');
      best.suggestedLevel = Math.min(4, (applied ? 3 : 2) + (best.mentions >= 4 ? 1 : 0));
      found.push(best);
    }
  }
  return found.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}

const NOISE = new Set(['and', 'or', 'with', 'etc', 'basic', 'basics', 'advanced', 'intermediate', 'familiar', 'tools', 'languages',
  'frameworks', 'libraries', 'others', 'other', 'technologies', 'skills', 'databases', 'cloud', 'soft', 'technical']);

function unknownTerms(sections: Record<string, string[]>, catalog: CatalogSkill[]): string[] {
  const known = catalog.flatMap((s) => [s.name, ...s.aliases]).map((t) => t.toLowerCase());
  const out = new Set<string>();
  for (const line of sections.skills ?? []) {
    const body = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    for (const piece of body.split(/[,|•;·]+| and /)) {
      const term = piece.replace(/[()]/g, '').trim();
      const low = term.toLowerCase();
      if (term.length < 2 || term.length > 30 || NOISE.has(low) || /^\d+$/.test(term)) continue;
      if (known.some((k) => low === k || termRegex(k).test(low))) continue;
      out.add(low);   // stored lower-case so aggregations group variants together
    }
  }
  return [...out].slice(0, 30);
}

function education(lines: string[] = []) {
  const level = (l: string) =>
    /\b(ph\.?d|doctorate)\b/i.test(l) ? 'phd'
    : /\b(m\.?tech|m\.?e\b|m\.?sc|mca|mba|master)/i.test(l) ? 'masters'
    : /\b(b\.?tech|b\.?e\b|b\.?sc|bca|bachelor|b\.?com)/i.test(l) ? 'bachelors'
    : /\b(diploma)\b/i.test(l) ? 'diploma'
    : /\b(12th|hsc|higher secondary|class xii)\b/i.test(l) ? 'high_school' : null;
  return lines
    .map((line) => ({ line, level: level(line), year: Number(line.match(/\b(19[89]\d|20[0-4]\d)\b/g)?.pop()) || null }))
    .filter((e) => e.level || e.year)
    .slice(0, 8);
}

function projects(lines: string[] = []) {
  return lines
    .filter((l) => !/^[-•*▪◦]/.test(l) && l.length <= 90 && /[a-z]/i.test(l))
    .map((l) => ({ title: l.split(/\s[|–-]\s/)[0].trim() }))
    .slice(0, 10);
}

export function parseResume(text: string, catalog: CatalogSkill[]): ParsedResume {
  const sections = splitSections(text);
  const links = [...new Set(text.match(/https?:\/\/[^\s)>,]+|(?:github|linkedin)\.com\/[^\s)>,]+/gi) ?? [])].slice(0, 10);
  return {
    text,
    sections,
    extracted: {
      skills: matchSkills(sections, catalog),
      unknownTerms: unknownTerms(sections, catalog),
      education: education(sections.education),
      projects: projects(sections.projects),
      links,
    },
  };
}
