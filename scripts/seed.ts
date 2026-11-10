/**
 * npm run seed
 * Loads fictional demo data through the same code paths the app uses:
 * embeddings, resume parsing (MongoDB), job ingestion (MongoDB -> PostgreSQL),
 * evidence review (triggers), market-signal procedure and roadmap generation.
 * Re-running replaces the previous demo data.
 */
import './_env';
import { ObjectId } from 'mongodb';
import { pool, query, tx, toVector, one } from '../lib/db';
import { mongo, closeMongo } from '../lib/mongo';
import { activeProvider, embed, modelName } from '../lib/embeddings';
import { hashPassword } from '../lib/password';
import { ingestJob } from '../lib/jobs';
import { parseResume, PARSER, type CatalogSkill } from '../lib/resume-parser';
import { refreshProfileEmbedding } from '../lib/profile';
import { STUDENTS, JOBS, jobDescription, SAMPLE_RESUME, type DemoJob } from './data/demo';

const DEMO_DOMAIN = '@skillgraph.dev';
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function main() {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set SEED_DEMO_PASSWORD (8+ characters) in .env');
  const provider = await activeProvider();
  console.log(`Embedding provider: ${modelName(provider)}`);
  const db = await mongo();

  // ---------------------------------------------------------------- reset demo data
  const oldIds = (await query<{ user_id: string }>(`SELECT user_id FROM users WHERE email LIKE $1`, ['%' + DEMO_DOMAIN])).map((r) => r.user_id);
  await db.collection('resumes_raw').deleteMany({ userId: { $in: oldIds } });
  await db.collection('activity_log').deleteMany({ userId: { $in: oldIds } });
  await db.collection('job_sources').deleteMany({ source: { $in: ['portal-a', 'portal-b', 'manual'] } });
  await query('DELETE FROM users WHERE email LIKE $1', ['%' + DEMO_DOMAIN]);
  await query('DELETE FROM job_postings');
  await query('DELETE FROM market_signals');
  console.log(`Cleared previous demo data (${oldIds.length} users)`);

  // ---------------------------------------------------------------- catalogue embeddings
  const skills = await query<{ skill_id: number; name: string; description: string; aliases: string[] }>('SELECT skill_id, name, description, aliases FROM skills');
  for (const s of skills) {
    const v = await embed(`${s.name}. ${s.description} Also known as: ${s.aliases.join(', ')}.`);
    await query('UPDATE skills SET embedding = $2 WHERE skill_id = $1', [s.skill_id, toVector(v)]);
  }
  const roles = await query<{ role_id: number; title: string; description: string; reqs: string }>(
    `SELECT r.role_id, r.title, r.description, string_agg(s.name, ', ' ORDER BY rs.importance DESC) AS reqs
       FROM career_roles r JOIN role_skills rs USING (role_id) JOIN skills s USING (skill_id) GROUP BY r.role_id`);
  for (const r of roles) {
    await query('UPDATE career_roles SET embedding = $2 WHERE role_id = $1', [r.role_id, toVector(await embed(`${r.title}. ${r.description} Requires ${r.reqs}.`))]);
  }
  console.log(`Embedded ${skills.length} skills and ${roles.length} roles`);

  // ---------------------------------------------------------------- staff accounts
  const hash = await hashPassword(password);
  const mkUser = async (email: string, role: string, name: string) => {
    const u = await one<{ user_id: string }>(`INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING user_id`, [email, hash, role]);
    await query(`INSERT INTO profiles (user_id, full_name) VALUES ($1,$2)`, [u!.user_id, name]);
    return u!.user_id;
  };
  const adminId = await mkUser('admin' + DEMO_DOMAIN, 'admin', 'Platform Admin');
  const mentorId = await mkUser('mentor' + DEMO_DOMAIN, 'mentor', 'Meera Iyer');
  await query(`UPDATE profiles SET bio = 'Data and backend mentor; reviews student evidence.' WHERE user_id = $1`, [mentorId]);

  // ---------------------------------------------------------------- jobs (MongoDB -> PostgreSQL)
  const toRaw = (j: DemoJob, i: number): [string, Record<string, unknown>] => {
    const description = jobDescription(j);
    if (i % 3 === 0) return ['portal-a', { jobTitle: j.title, org: j.company, city: j.location, mode: j.workMode, desc: description,
      skillsCsv: j.required.join(', '), optional: j.optional.join(', '), category: j.role, salary: { min: j.salary[0], max: j.salary[1] }, postedOn: day(j.daysAgo) }];
    if (i % 3 === 1) return ['portal-b', { position: { name: j.title, family: j.role }, employer: { name: j.company, size: '200-500' },
      location: { city: j.location, remote: j.workMode === 'remote', hybrid: j.workMode === 'hybrid' }, tags: j.required, niceToHave: j.optional,
      body: description, pay: `${j.salary[0]}-${j.salary[1]} LPA`, published: `${day(j.daysAgo)}T09:00:00Z`, applyVia: 'portal' }];
    return ['manual', { title: j.title, company: j.company, location: j.location, workMode: j.workMode, description,
      requiredSkills: j.required, optionalSkills: j.optional, roleTitle: j.role, salaryMin: j.salary[0], salaryMax: j.salary[1], postedAt: day(j.daysAgo) }];
  };
  let ingested = 0;
  for (const [i, j] of JOBS.entries()) {
    const [source, raw] = toRaw(j, i);
    const r = await ingestJob(source, `seed-${i + 1}`, raw, adminId);
    if (r.status !== 'normalized') console.warn(`  job ${j.title}: ${r.status} ${r.error ?? ''}`);
    else ingested++;
  }
  // one malformed record to show the rejected path in MongoDB
  await ingestJob('portal-b', 'seed-bad-1', { position: { name: 'Intern' }, employer: { name: 'Unknown Co' }, tags: ['Cobol'] }, adminId);
  await query('CALL refresh_market_signals()');
  console.log(`Ingested ${ingested} job postings and refreshed market signals`);

  // ---------------------------------------------------------------- students
  const catalog: CatalogSkill[] = skills.map((s) => ({ skillId: s.skill_id, name: s.name, aliases: s.aliases }));
  const skillId = new Map(skills.map((s) => [s.name, s.skill_id]));
  const sid = (name: string) => {
    const id = skillId.get(name);
    if (!id) throw new Error(`Unknown skill in demo data: ${name}`);
    return id;
  };

  for (const st of STUDENTS) {
    const userId = await tx(null, async (c) => {
      const { rows: [u] } = await c.query(`INSERT INTO users (email, password_hash, role, last_login_at) VALUES ($1,$2,'student', now() - interval '1 day') RETURNING user_id`, [st.email, hash]);
      await c.query(
        `INSERT INTO profiles (user_id, full_name, education_level, institution, graduation_year, interests, bio, weekly_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [u.user_id, st.name, st.education, st.institution, st.gradYear, st.interests, st.bio, st.hours]);
      await c.query(`INSERT INTO goals (user_id, role_id, target_date) SELECT $1, role_id, $3::date FROM career_roles WHERE title = $2`,
        [u.user_id, st.role, day(-180)]);
      for (const [name, lvl] of st.skills) {
        await c.query(`INSERT INTO user_skills (user_id, skill_id, claimed_level, source) VALUES ($1,$2,$3,'self')`, [u.user_id, sid(name), lvl]);
      }
      return u.user_id as string;
    });

    const projectIds = new Map<string, string>();
    for (const p of st.projects) {
      const pid = await tx(userId, async (c) => {
        const { rows: [row] } = await c.query(
          `INSERT INTO projects (user_id, title, description, repo_url, started_on, completed_on) VALUES ($1,$2,$3,$4,$5,$6) RETURNING project_id`,
          [userId, p.title, p.description, p.repo, p.months[0], p.months[1]]);
        for (const s of p.skills) await c.query('INSERT INTO project_skills VALUES ($1,$2)', [row.project_id, sid(s)]);
        return row.project_id as string;
      });
      projectIds.set(p.title, pid);
    }

    for (const e of st.evidence) {
      const evId = await one<{ evidence_id: string }>(
        `INSERT INTO evidence (user_id, skill_id, project_id, kind, title, url, demonstrated_level, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now() - interval '5 days') RETURNING evidence_id`,
        [userId, sid(e.skill), e.project ? projectIds.get(e.project) : null, e.kind, e.title, e.url ?? null, e.level]);
      if (e.status !== 'pending') {
        await tx(mentorId, (c) => c.query(`UPDATE evidence SET status = $2, reviewed_by = $3, review_note = $4 WHERE evidence_id = $1`,
          [evId!.evidence_id, e.status, mentorId, e.note ?? null]));
      }
    }

    // resume document in MongoDB + pointer row in PostgreSQL
    const resumeText = st.email.startsWith('aarav') ? SAMPLE_RESUME :
      `${st.name.toUpperCase()}\n${st.institution}\n\nSUMMARY\n${st.bio}\n\nEDUCATION\n${st.education === 'masters' ? 'M.Tech' : 'B.Tech'}, ${st.institution} - ${st.gradYear}\n\n` +
      `PROJECTS\n${st.projects.map((p) => `${p.title} | ${p.skills.join(', ')}\n- ${p.description}`).join('\n')}\n\n` +
      `TECHNICAL SKILLS\n${st.skills.map(([n]) => n).join(', ')}, Jira, Postman, VS Code\n`;
    const parsed = parseResume(resumeText, catalog);
    const _id = new ObjectId();
    await db.collection('resumes_raw').insertOne({
      _id, userId, fileName: `${st.name.toLowerCase().replace(/\s+/g, '_')}_resume.txt`, mimeType: 'text/plain',
      text: parsed.text, sections: parsed.sections, extracted: parsed.extracted, parser: PARSER, createdAt: new Date(Date.now() - 6 * 864e5),
    });
    await query(`INSERT INTO resumes (user_id, mongo_doc_id, file_name, file_size_bytes, parse_status, skills_detected, uploaded_at)
                 VALUES ($1,$2,$3,$4,'parsed',$5, now() - interval '6 days')`,
      [userId, _id.toHexString(), `${st.name.toLowerCase().replace(/\s+/g, '_')}_resume.txt`, Buffer.byteLength(resumeText), parsed.extracted.skills.length]);

    await refreshProfileEmbedding(userId);
    await tx(userId, (c) => c.query('SELECT generate_roadmap($1, 12)', [userId]));

    // activity history (MongoDB)
    const events = ['login', 'resume_uploaded', 'goal_set', 'roadmap_generated', 'evidence_submitted', 'login', 'job_viewed'];
    await db.collection('activity_log').insertMany(events.map((type, k) => {
      const at = new Date(Date.now() - (12 - k * 1.7) * 864e5);
      return { userId, type, meta: { seeded: true }, at, day: at.toISOString().slice(0, 10) };
    }));
    console.log(`  ${st.name}: ${st.skills.length} skills, ${st.projects.length} projects, ${st.evidence.length} evidence, resume parsed (${parsed.extracted.skills.length} skills found)`);
  }

  // progress on Aarav's roadmap so the demo shows a partly completed plan
  await query(`UPDATE roadmap_items SET status = 'done'
               WHERE roadmap_id = (SELECT r.roadmap_id FROM roadmaps r JOIN users u USING (user_id)
                                   WHERE u.email = 'aarav.mehta@skillgraph.dev' AND r.status = 'active')
                 AND sequence_no <= 2`);
  await query(`UPDATE roadmap_items SET status = 'doing'
               WHERE roadmap_id = (SELECT r.roadmap_id FROM roadmaps r JOIN users u USING (user_id)
                                   WHERE u.email = 'aarav.mehta@skillgraph.dev' AND r.status = 'active')
                 AND sequence_no = 3`);

  await query('CALL refresh_market_signals()');   // again, so learner counts include the students
  await query(`INSERT INTO app_meta (key, value) VALUES ('embedding_model', $1)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [modelName(provider)]);
  console.log(`\nDone. Sign in with any @skillgraph.dev account (e.g. aarav.mehta${DEMO_DOMAIN}, mentor${DEMO_DOMAIN}, admin${DEMO_DOMAIN}) using SEED_DEMO_PASSWORD.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool().end();
    await closeMongo();
  });
