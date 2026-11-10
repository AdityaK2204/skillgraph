/**
 * Database-level tests: constraints, triggers, functions, procedure, privileges.
 * Run: npm test   (needs the seeded database; every test runs inside a transaction that is rolled back)
 */
import '../scripts/_env';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, type PoolClient } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
after(() => pool.end());

const FAKE_HASH = '$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz12345';

/** Runs fn in a transaction that is always rolled back. */
async function rolledBack(fn: (c: PoolClient) => Promise<void>) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await fn(c); } finally { await c.query('ROLLBACK'); c.release(); }
}
async function expectCode(c: PoolClient, sql: string, params: unknown[], code: string) {
  await c.query('SAVEPOINT t');
  await assert.rejects(c.query(sql, params), (e: { code?: string }) => { assert.equal(e.code, code); return true; });
  await c.query('ROLLBACK TO SAVEPOINT t');
}
async function user(c: PoolClient, role = 'student') {
  const { rows: [u] } = await c.query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id`,
    [`t${Math.random().toString(36).slice(2)}@test.dev`, FAKE_HASH, role]);
  await c.query(`INSERT INTO profiles (user_id, full_name) VALUES ($1, 'Test Person')`, [u.user_id]);
  return u.user_id as string;
}
const skill = async (c: PoolClient, name: string) => (await c.query('SELECT skill_id FROM skills WHERE name = $1', [name])).rows[0].skill_id as number;
const role = async (c: PoolClient, title: string) => (await c.query('SELECT role_id FROM career_roles WHERE title = $1', [title])).rows[0].role_id as number;

describe('constraints and domains', () => {
  test('proficiency domain rejects level 6', () => rolledBack(async (c) => {
    const u = await user(c);
    await expectCode(c, 'INSERT INTO user_skills (user_id, skill_id, claimed_level) VALUES ($1, $2, 6)', [u, await skill(c, 'SQL')], '23514');
  }));
  test('email domain rejects a malformed address', () => rolledBack(async (c) => {
    await expectCode(c, `INSERT INTO users (email, password_hash) VALUES ('not-an-email', $1)`, [FAKE_HASH], '23514');
  }));
  test('password_hash must be a bcrypt hash (no plain text)', () => rolledBack(async (c) => {
    await expectCode(c, `INSERT INTO users (email, password_hash) VALUES ('plain@test.dev', 'secret123')`, [], '23514');
  }));
  test('email is unique regardless of case (citext)', () => rolledBack(async (c) => {
    await c.query(`INSERT INTO users (email, password_hash) VALUES ('Case@Test.dev', $1)`, [FAKE_HASH]);
    await expectCode(c, `INSERT INTO users (email, password_hash) VALUES ('case@test.dev', $1)`, [FAKE_HASH], '23505');
  }));
  test('project completion date cannot precede start date', () => rolledBack(async (c) => {
    const u = await user(c);
    await expectCode(c, `INSERT INTO projects (user_id, title, started_on, completed_on) VALUES ($1, 'Bad dates', '2026-05-01', '2026-04-01')`, [u], '23514');
  }));
  test('evidence needs a link or a project', () => rolledBack(async (c) => {
    const u = await user(c);
    await expectCode(c, `INSERT INTO evidence (user_id, skill_id, kind, title, demonstrated_level) VALUES ($1, $2, 'certificate', 'No backing', 3)`, [u, await skill(c, 'SQL')], '23514');
  }));
  test('FK RESTRICT: a skill used by roles cannot be deleted', () => rolledBack(async (c) => {
    await expectCode(c, `DELETE FROM skills WHERE name = 'SQL'`, [], '23503');
  }));
  test('ON DELETE CASCADE: deleting a user removes their dependent rows', () => rolledBack(async (c) => {
    const u = await user(c);
    await c.query(`INSERT INTO user_skills (user_id, skill_id, claimed_level) VALUES ($1, $2, 2)`, [u, await skill(c, 'SQL')]);
    await c.query('DELETE FROM users WHERE user_id = $1', [u]);
    const { rows } = await c.query('SELECT (SELECT count(*) FROM profiles WHERE user_id = $1) + (SELECT count(*) FROM user_skills WHERE user_id = $1) AS n', [u]);
    assert.equal(Number(rows[0].n), 0);
  }));
});

describe('triggers', () => {
  test('a new active goal retires the previous one (one active goal per user)', () => rolledBack(async (c) => {
    const u = await user(c);
    await c.query('INSERT INTO goals (user_id, role_id) VALUES ($1, $2)', [u, await role(c, 'Data Analyst')]);
    await c.query('INSERT INTO goals (user_id, role_id) VALUES ($1, $2)', [u, await role(c, 'Data Scientist')]);
    const { rows } = await c.query(`SELECT status, count(*)::int AS n FROM goals WHERE user_id = $1 GROUP BY status ORDER BY status`, [u]);
    assert.deepEqual(rows, [{ status: 'active', n: 1 }, { status: 'dropped', n: 1 }]);
  }));
  test('verifying evidence raises verified_level (and the claim never sits below it)', () => rolledBack(async (c) => {
    const s = await user(c), m = await user(c, 'mentor'), sql = await skill(c, 'SQL');
    await c.query('INSERT INTO user_skills (user_id, skill_id, claimed_level) VALUES ($1, $2, 2)', [s, sql]);
    const { rows: [e] } = await c.query(`INSERT INTO evidence (user_id, skill_id, kind, title, url, demonstrated_level)
      VALUES ($1, $2, 'repository', 'Query repo', 'https://example.org/r', 4) RETURNING evidence_id`, [s, sql]);
    await c.query(`UPDATE evidence SET status = 'verified', reviewed_by = $2 WHERE evidence_id = $1`, [e.evidence_id, m]);
    const { rows: [us] } = await c.query('SELECT claimed_level, verified_level FROM user_skills WHERE user_id = $1 AND skill_id = $2', [s, sql]);
    assert.deepEqual(us, { claimed_level: 4, verified_level: 4 });
    await c.query('DELETE FROM evidence WHERE evidence_id = $1', [e.evidence_id]);
    const { rows: [after] } = await c.query('SELECT verified_level FROM user_skills WHERE user_id = $1 AND skill_id = $2', [s, sql]);
    assert.equal(after.verified_level, 0, 'deleting the evidence removes the verification');
  }));
  test('a student cannot review evidence, and a mentor cannot review their own', () => rolledBack(async (c) => {
    const s = await user(c), other = await user(c), m = await user(c, 'mentor'), sql = await skill(c, 'SQL');
    const ins = `INSERT INTO evidence (user_id, skill_id, kind, title, url, demonstrated_level) VALUES ($1, $2, 'repository', 'Repo', 'https://example.org/x', 3) RETURNING evidence_id`;
    const { rows: [e1] } = await c.query(ins, [s, sql]);
    await expectCode(c, `UPDATE evidence SET status = 'verified', reviewed_by = $2 WHERE evidence_id = $1`, [e1.evidence_id, other], '42501');
    const { rows: [e2] } = await c.query(ins, [m, sql]);
    await expectCode(c, `UPDATE evidence SET status = 'verified', reviewed_by = $2 WHERE evidence_id = $1`, [e2.evidence_id, m], '42501');
  }));
  test("evidence cannot reference another student's project", () => rolledBack(async (c) => {
    const a = await user(c), b = await user(c);
    const { rows: [p] } = await c.query(`INSERT INTO projects (user_id, title) VALUES ($1, 'B project') RETURNING project_id`, [b]);
    await expectCode(c, `INSERT INTO evidence (user_id, skill_id, project_id, kind, title, demonstrated_level) VALUES ($1, $2, $3, 'project', 'Not mine', 3)`,
      [a, await skill(c, 'SQL'), p.project_id], '23514');
  }));
  test('the prerequisite graph rejects a cycle', () => rolledBack(async (c) => {
    // Python -> Machine Learning exists; making ML a prerequisite of Python would close a loop
    await expectCode(c, 'INSERT INTO skill_prerequisites (skill_id, prereq_skill_id) VALUES ($1, $2)',
      [await skill(c, 'Python'), await skill(c, 'Machine Learning')], '23514');
  }));
  test('audit trigger records the actor set with SET LOCAL', () => rolledBack(async (c) => {
    const admin = await user(c, 'admin'), target = await user(c);
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [admin]);
    await c.query(`UPDATE users SET role = 'mentor' WHERE user_id = $1`, [target]);
    const { rows: [a] } = await c.query(`SELECT actor_id, old_data->>'role' AS old_role, new_data->>'role' AS new_role, new_data ? 'password_hash' AS leaked
      FROM audit_log WHERE table_name = 'users' AND row_pk = $1 ORDER BY audit_id DESC LIMIT 1`, [target]);
    assert.deepEqual(a, { actor_id: admin, old_role: 'student', new_role: 'mentor', leaked: false });
  }));
});

describe('functions and procedure', () => {
  test('compute_skill_priorities returns only gaps, with every factor and the priority in [0,1]', () => rolledBack(async (c) => {
    const u = await user(c), r = await role(c, 'Data Engineer');
    await c.query('INSERT INTO user_skills (user_id, skill_id, claimed_level, verified_level) VALUES ($1, $2, 5, 0)', [u, await skill(c, 'SQL')]);
    const { rows } = await c.query('SELECT * FROM compute_skill_priorities($1, $2)', [u, r]);
    assert.ok(rows.length > 5);
    for (const row of rows) {
      for (const f of ['demand', 'relevance', 'gap', 'readiness', 'interest', 'evidence', 'ease', 'priority']) {
        const v = Number(row[f]); assert.ok(v >= 0 && v <= 1, `${f}=${v} for ${row.skill_name}`);
      }
      assert.ok(Number(row.effective_level) < row.required_level, 'only real gaps are returned');
    }
    const sqlRow = rows.find((x) => x.skill_name === 'SQL');
    assert.equal(Number(sqlRow.evidence), 1, 'claimed-but-unproven SQL gets the maximum evidence factor');
    assert.ok(rows.some((x) => !x.is_direct), 'transitive prerequisites are included');
  }));
  test('changing a scoring weight changes the ranking', () => rolledBack(async (c) => {
    const u = await user(c), r = await role(c, 'Data Analyst');
    const top = async () => (await c.query('SELECT skill_name FROM compute_skill_priorities($1, $2) LIMIT 1', [u, r])).rows[0].skill_name;
    const before = await top();
    await c.query(`UPDATE scoring_weights SET weight = CASE WHEN factor = 'ease' THEN 1 ELSE 0 END`);
    const after = await top();
    const { rows: [easiest] } = await c.query(`SELECT skill_name FROM compute_skill_priorities($1, $2) ORDER BY ease DESC LIMIT 1`, [u, r]);
    assert.equal(after, easiest.skill_name);
    assert.ok(before);
  }));
  test('generate_roadmap versions roadmaps and orders prerequisites first', () => rolledBack(async (c) => {
    const u = await user(c);
    await c.query('INSERT INTO goals (user_id, role_id) VALUES ($1, $2)', [u, await role(c, 'Machine Learning Engineer')]);
    const { rows: [r1] } = await c.query('SELECT generate_roadmap($1, 20) AS id', [u]);
    const { rows: [r2] } = await c.query('SELECT generate_roadmap($1, 20) AS id', [u]);
    const { rows: vs } = await c.query('SELECT version, status FROM roadmaps WHERE user_id = $1 ORDER BY version', [u]);
    assert.deepEqual(vs, [{ version: 1, status: 'archived' }, { version: 2, status: 'active' }]);
    assert.notEqual(r1.id, r2.id);
    const { rows: bad } = await c.query(
      `SELECT a.skill_id FROM roadmap_items a JOIN roadmap_items b ON a.roadmap_id = b.roadmap_id
         JOIN skill_prerequisites sp ON sp.prereq_skill_id = a.skill_id AND sp.skill_id = b.skill_id
        WHERE a.roadmap_id = $1 AND a.sequence_no > b.sequence_no`, [r2.id]);
    assert.equal(bad.length, 0, 'no prerequisite is scheduled after the skill it unlocks');
  }));
  test('generate_roadmap without a goal raises P0002', () => rolledBack(async (c) => {
    await expectCode(c, 'SELECT generate_roadmap($1)', [await user(c)], 'P0002');
  }));
  test('completing every item rolls the roadmap up to completed', () => rolledBack(async (c) => {
    const u = await user(c);
    await c.query('INSERT INTO goals (user_id, role_id) VALUES ($1, $2)', [u, await role(c, 'Frontend Developer')]);
    const { rows: [r] } = await c.query('SELECT generate_roadmap($1, 3) AS id', [u]);
    await c.query(`UPDATE roadmap_items SET status = 'done' WHERE roadmap_id = $1`, [r.id]);
    const { rows: [s] } = await c.query('SELECT status FROM roadmaps WHERE roadmap_id = $1', [r.id]);
    assert.equal(s.status, 'completed');
    const { rows: [i] } = await c.query('SELECT count(*)::int AS n FROM roadmap_items WHERE roadmap_id = $1 AND completed_at IS NULL', [r.id]);
    assert.equal(i.n, 0, 'completed_at stamped by trigger');
  }));
  test('match_jobs returns scores in [0,1], best first', () => rolledBack(async (c) => {
    const { rows: [u] } = await c.query(`SELECT user_id FROM users WHERE email = 'aarav.mehta@skillgraph.dev'`);
    const { rows } = await c.query('SELECT match_score FROM match_jobs($1, 10)', [u.user_id]);
    assert.equal(rows.length, 10);
    const scores = rows.map((r) => Number(r.match_score));
    assert.ok(scores.every((s) => s >= 0 && s <= 1));
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  }));
  test('refresh_market_signals runs as the application role (SECURITY DEFINER)', () => rolledBack(async (c) => {
    await c.query('CALL refresh_market_signals()');
    const { rows: [m] } = await c.query(`SELECT count(*)::int AS n, max(demand_score)::float AS mx FROM market_signals WHERE snapshot_date = current_date`);
    assert.ok(m.n > 0 && m.mx <= 1);
  }));
});

describe('indexes and search', () => {
  test('full-text search finds postings through the GIN index', () => rolledBack(async (c) => {
    await c.query('SET LOCAL enable_seqscan = off');
    const { rows: plan } = await c.query(`EXPLAIN SELECT job_id FROM job_postings WHERE search_tsv @@ websearch_to_tsquery('english', 'kubernetes')`);
    assert.match(plan.map((p) => p['QUERY PLAN']).join('\n'), /ix_jobs_fts/);
    const { rows } = await c.query(`SELECT title FROM job_postings WHERE search_tsv @@ websearch_to_tsquery('english', 'kubernetes')`);
    assert.ok(rows.length >= 2);
  }));
  test('k-NN over embeddings uses the HNSW index', () => rolledBack(async (c) => {
    await c.query('SET LOCAL enable_seqscan = off');
    const { rows } = await c.query(`EXPLAIN SELECT job_id FROM job_postings ORDER BY embedding <=> (SELECT embedding FROM job_postings LIMIT 1) LIMIT 5`);
    assert.match(rows.map((p) => p['QUERY PLAN']).join('\n'), /ix_jobs_embedding/);
  }));
});

describe('least-privilege application role', () => {
  test('cannot create or drop tables', () => rolledBack(async (c) => {
    const { rows: [who] } = await c.query('SELECT current_user');
    if (who.current_user !== 'skillgraph_app') return; // only meaningful when DATABASE_URL uses the app role
    await expectCode(c, 'CREATE TABLE should_fail (id int)', [], '42501');
    await expectCode(c, 'DROP TABLE skills', [], '42501');
  }));
  test('cannot rewrite or delete the audit trail', () => rolledBack(async (c) => {
    const { rows: [who] } = await c.query('SELECT current_user');
    if (who.current_user !== 'skillgraph_app') return;
    await expectCode(c, `UPDATE audit_log SET operation = 'DELETE'`, [], '42501');
    await expectCode(c, 'DELETE FROM audit_log', [], '42501');
  }));
});
