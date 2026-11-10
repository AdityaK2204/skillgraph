/**
 * End-to-end API tests against a running app (npm run build && npm start, or npm run dev).
 * Run: npm test           BASE_URL defaults to http://localhost:3000
 * Creates a throw-away student (removed again at the end through the admin connection).
 */
import '../scripts/_env';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo@12345';
const email = `e2e-${Date.now()}@example.test`;
let up = false;

class Session {
  cookie = '';
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const { json, ...rest } = init;
    const res = await fetch(BASE + path, {
      ...rest,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
  login(e: string, p = PASSWORD) { return this.req('/api/auth/login', { method: 'POST', json: { email: e, password: p } }); }
}

const student = new Session(), mentor = new Session(), admin = new Session(), anon = new Session();

before(async () => {
  up = await fetch(BASE + '/api/health').then((r) => r.ok).catch(() => false);
  if (!up) console.warn(`App not reachable at ${BASE}; API tests are skipped. Start it with npm run dev.`);
});
after(async () => {
  if (!process.env.DATABASE_ADMIN_URL) return;
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await c.connect();
  const ids = (await c.query(`SELECT user_id FROM users WHERE email LIKE 'e2e-%@example.test'`)).rows.map((r) => r.user_id);
  const m = new MongoClient(process.env.MONGODB_URI!);
  await m.connect();
  const mdb = m.db(process.env.MONGODB_DB ?? 'skillgraph');
  await mdb.collection('resumes_raw').deleteMany({ userId: { $in: ids } });
  await mdb.collection('activity_log').deleteMany({ userId: { $in: ids } });
  await mdb.collection('job_sources').deleteMany({ 'payload.company': 'E2E Test Corp' });
  await m.close();
  await c.query(`DELETE FROM users WHERE email LIKE 'e2e-%@example.test'`);
  await c.query(`DELETE FROM job_postings WHERE company = 'E2E Test Corp'`);
  await c.query(`DELETE FROM skill_prerequisites WHERE skill_id = (SELECT skill_id FROM skills WHERE name = 'Airflow') AND prereq_skill_id = (SELECT skill_id FROM skills WHERE name = 'Git')`);
  await c.end();
});

describe('authentication', () => {
  test('protected API without a session returns 401', async (t) => {
    if (!up) return t.skip();
    assert.equal((await anon.req('/api/dashboard')).status, 401);
  });
  test('registration validates fields', async (t) => {
    if (!up) return t.skip();
    const r = await anon.req('/api/auth/register', { method: 'POST', json: { fullName: 'A', email: 'bad', password: 'short' } });
    assert.equal(r.status, 422);
    const fields = [...new Set(r.body.details.map((d: { field: string }) => d.field))].sort();
    assert.deepEqual(fields, ['email', 'fullName', 'password']);
  });
  test('registration creates a student and signs them in', async (t) => {
    if (!up) return t.skip();
    const r = await student.req('/api/auth/register', { method: 'POST', json: { fullName: 'E2E Student', email, password: 'Testing123' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.role, 'student');
    assert.equal((await student.req('/api/auth/me')).body.email, email);
  });
  test('duplicate email is rejected with 409', async (t) => {
    if (!up) return t.skip();
    const r = await anon.req('/api/auth/register', { method: 'POST', json: { fullName: 'Again', email: email.toUpperCase(), password: 'Testing123' } });
    assert.equal(r.status, 409);
  });
  test('wrong password is rejected without revealing which part was wrong', async (t) => {
    if (!up) return t.skip();
    const a = await anon.login(email, 'Wrong12345');
    const b = await anon.login('nobody@example.test', 'Wrong12345');
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });
  test('demo mentor and admin can sign in', async (t) => {
    if (!up) return t.skip();
    assert.equal((await mentor.login('mentor@skillgraph.dev')).status, 200);
    assert.equal((await admin.login('admin@skillgraph.dev')).status, 200);
  });
});

describe('role-based access', () => {
  test('a student cannot reach mentor or admin APIs', async (t) => {
    if (!up) return t.skip();
    assert.equal((await student.req('/api/mentor/queue')).status, 403);
    assert.equal((await student.req('/api/admin/users')).status, 403);
  });
  test('a mentor can review but cannot administer', async (t) => {
    if (!up) return t.skip();
    assert.equal((await mentor.req('/api/mentor/queue')).status, 200);
    assert.equal((await mentor.req('/api/admin/analytics')).status, 403);
  });
});

describe('student journey', () => {
  let resumeId = '', evidenceId = '', skillSql = 0;

  test('choosing a goal generates a roadmap in the same transaction', async (t) => {
    if (!up) return t.skip();
    const roles = (await student.req('/api/roles')).body as Array<{ role_id: number; title: string }>;
    const backend = roles.find((r) => r.title === 'Backend Developer')!;
    const r = await student.req('/api/goals', { method: 'POST', json: { roleId: backend.role_id, targetDate: '2027-06-30' } });
    assert.equal(r.status, 201);
    const rm = (await student.req('/api/roadmap')).body;
    assert.equal(rm.current.version, 1);
    assert.ok(rm.items.length > 0);
    assert.ok(rm.items.every((i: { phase: string }) => i.phase === 'learn'), 'a new user with no skills starts with Learn items');
  });
  test('PDF resume upload is parsed into MongoDB and skills are detected', async (t) => {
    if (!up) return t.skip();
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync('samples/sample_resume_neha_joshi.pdf')], { type: 'application/pdf' }), 'neha.pdf');
    const r = await student.req('/api/resume', { method: 'POST', body: fd });
    assert.equal(r.status, 201);
    assert.ok(r.body.skillsDetected >= 10, `detected ${r.body.skillsDetected}`);
    resumeId = r.body.resumeId;
    const d = (await student.req(`/api/resume/${resumeId}`)).body;
    assert.match(d.mongoId, /^[0-9a-f]{24}$/);
    const names = d.extracted.skills.map((s: { name: string }) => s.name);
    for (const n of ['Node.js', 'PostgreSQL', 'Docker', 'Redis', 'REST API Design']) assert.ok(names.includes(n), `missing ${n}`);
    assert.ok(d.extracted.unknownTerms.some((u: string) => /kafka|swagger/i.test(u)), 'terms outside the catalogue are reported');
  });
  test('a non-PDF file pretending to be a PDF is rejected', async (t) => {
    if (!up) return t.skip();
    const fd = new FormData();
    fd.append('file', new Blob(['not really a pdf'], { type: 'application/pdf' }), 'fake.pdf');
    assert.equal((await student.req('/api/resume', { method: 'POST', body: fd })).status, 415);
  });
  test('importing resume skills is atomic and creates claims (not verified levels)', async (t) => {
    if (!up) return t.skip();
    const d = (await student.req(`/api/resume/${resumeId}`)).body;
    const skills = d.extracted.skills.map((s: { skillId: number; suggestedLevel: number }) => ({ skillId: s.skillId, claimedLevel: s.suggestedLevel }));
    const bad = await student.req(`/api/resume/${resumeId}/import`, { method: 'POST', json: { skills: [...skills, { skillId: 999999, claimedLevel: 3 }] } });
    assert.equal(bad.status, 409, 'unknown skill id breaks the FK');
    assert.equal((await student.req('/api/me/skills')).body.length, 0, 'nothing was saved: the transaction rolled back');
    const ok = await student.req(`/api/resume/${resumeId}/import`, { method: 'POST', json: { skills } });
    assert.equal(ok.status, 200);
    const mine = (await student.req('/api/me/skills')).body as Array<{ skill_name: string; skill_id: number; verified_level: number; source: string }>;
    assert.equal(mine.length, skills.length);
    assert.ok(mine.every((s) => s.verified_level === 0 && s.source === 'resume'));
    skillSql = mine.find((s) => s.skill_name === 'SQL')!.skill_id;
  });
  test('regenerating the roadmap after import moves skills to Build/Prove', async (t) => {
    if (!up) return t.skip();
    assert.equal((await student.req('/api/roadmap', { method: 'POST' })).status, 201);
    const rm = (await student.req('/api/roadmap')).body;
    assert.equal(rm.current.version, 2);
    assert.ok(rm.items.some((i: { phase: string }) => i.phase !== 'learn'));
    assert.equal(rm.history.filter((h: { status: string }) => h.status === 'archived').length, 1);
  });
  test('evidence validation: a link or a project is required', async (t) => {
    if (!up) return t.skip();
    const r = await student.req('/api/evidence', { method: 'POST', json: { skillId: skillSql, kind: 'certificate', title: 'SQL cert', demonstratedLevel: 3 } });
    assert.equal(r.status, 422);
  });
  test('mentor verification raises the verified level through the trigger', async (t) => {
    if (!up) return t.skip();
    const r = await student.req('/api/evidence', { method: 'POST', json: { skillId: skillSql, kind: 'certificate', title: 'SQL certificate', url: 'https://example.org/cert/sql', demonstratedLevel: 3 } });
    assert.equal(r.status, 201);
    evidenceId = r.body.evidenceId;
    assert.equal((await mentor.req(`/api/mentor/evidence/${evidenceId}`, { method: 'POST', json: { decision: 'rejected' } })).status, 422, 'rejection needs a note');
    const v = await mentor.req(`/api/mentor/evidence/${evidenceId}`, { method: 'POST', json: { decision: 'verified', note: 'Certificate checked' } });
    assert.equal(v.status, 200);
    assert.equal(v.body.skill.verified_level, 3);
    assert.equal((await mentor.req(`/api/mentor/evidence/${evidenceId}`, { method: 'POST', json: { decision: 'verified' } })).status, 409, 'cannot review twice');
    assert.equal((await student.req(`/api/evidence/${evidenceId}`, { method: 'DELETE' })).status, 409, 'verified evidence cannot be withdrawn');
  });
  test('the verification is in the audit log with the mentor as actor', async (t) => {
    if (!up) return t.skip();
    const rows = (await admin.req('/api/admin/audit?table=evidence')).body as Array<{ row_pk: string; actor: string }>;
    const row = rows.find((r) => r.row_pk === evidenceId);
    assert.equal(row?.actor, 'mentor@skillgraph.dev');
  });
  test('gap analysis, graph and job matching respond for the new student', async (t) => {
    if (!up) return t.skip();
    const gap = (await student.req('/api/gap')).body;
    assert.equal(gap.goal.role_title, 'Backend Developer');
    assert.ok(gap.priorities.length > 0);
    const graph = (await student.req('/api/graph')).body;
    assert.ok(['neo4j', 'postgres-cte'].includes(graph.source));
    assert.ok(graph.edges.length > 0);
    const jobs = (await student.req('/api/jobs/match?limit=5')).body;
    assert.equal(jobs.length, 5);
  });
  test('SQL injection in search input is treated as plain text', async (t) => {
    if (!up) return t.skip();
    const r = await student.req(`/api/jobs/search?q=${encodeURIComponent("x'; DROP TABLE users; --")}&location=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
    assert.equal((await student.req('/api/auth/me')).status, 200, 'users table still there');
  });
  test('job search filters and paginates', async (t) => {
    if (!up) return t.skip();
    const r = (await student.req('/api/jobs/search?mode=remote&sort=salary')).body;
    assert.ok(r.total > 0);
    assert.ok(r.jobs.every((j: { work_mode: string }) => j.work_mode === 'remote'));
    const sal = r.jobs.map((j: { salary_max_lpa: string }) => Number(j.salary_max_lpa));
    assert.deepEqual(sal, [...sal].sort((a, b) => b - a));
  });
});

describe('admin', () => {
  test('job ingestion: unknown-only skills are rejected, a valid posting is normalised', async (t) => {
    if (!up) return t.skip();
    const base = { title: 'Junior API Developer', company: 'E2E Test Corp', location: 'Remote', workMode: 'remote',
                   description: 'Build and test REST endpoints for an internal platform with a small team.' };
    const bad = await admin.req('/api/admin/jobs', { method: 'POST', json: { ...base, requiredSkills: ['COBOL', 'Fortran'] } });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.status, 'rejected');
    const good = await admin.req('/api/admin/jobs', { method: 'POST', json: { ...base, requiredSkills: ['node', 'postgres', 'rest api', 'Kafka'] } });
    assert.equal(good.status, 201);
    assert.deepEqual(good.body.unresolved, ['Kafka']);
  });
  test('market refresh runs the stored procedure', async (t) => {
    if (!up) return t.skip();
    const r = await admin.req('/api/admin/market', { method: 'POST' });
    assert.equal(r.status, 200);
    assert.ok(r.body.signals > 0);
  });
  test('a prerequisite that would create a cycle is rejected (422)', async (t) => {
    if (!up) return t.skip();
    const skills = (await admin.req('/api/admin/skills')).body as Array<{ skill_id: number; name: string }>;
    const id = (n: string) => skills.find((s) => s.name === n)!.skill_id;
    const r = await admin.req('/api/admin/prerequisites', { method: 'POST', json: { skillId: id('Python'), prereqSkillId: id('Machine Learning') } });
    assert.equal(r.status, 422);
    assert.match(r.body.error, /cycle/);
    const ok = await admin.req('/api/admin/prerequisites', { method: 'POST', json: { skillId: id('Airflow'), prereqSkillId: id('Git'), strength: 0.3 } });
    assert.equal(ok.status, 201);
  });
  test('an admin cannot remove their own admin role', async (t) => {
    if (!up) return t.skip();
    const me = (await admin.req('/api/auth/me')).body;
    assert.equal((await admin.req(`/api/admin/users/${me.userId}`, { method: 'PATCH', json: { role: 'student' } })).status, 409);
  });
  test('analytics combines PostgreSQL and MongoDB aggregates', async (t) => {
    if (!up) return t.skip();
    const a = (await admin.req('/api/admin/analytics')).body;
    assert.ok(a.totals.students >= 7);
    assert.ok(a.mongo.topResumeSkills.length > 0);
    assert.ok(a.mongo.jobSources.some((s: { status: string }) => s.status === 'rejected'));
  });
  test('deactivating a user ends their access immediately', async (t) => {
    if (!up) return t.skip();
    const me = (await student.req('/api/auth/me')).body;
    assert.equal((await admin.req(`/api/admin/users/${me.userId}`, { method: 'PATCH', json: { isActive: false } })).status, 200);
    assert.equal((await student.req('/api/dashboard')).status, 401);
  });
});
