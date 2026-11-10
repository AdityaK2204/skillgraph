-- =====================================================================
-- SkillGraph · demo/03_transactions_dml.sql
-- INSERT / UPDATE / DELETE inside transactions, with SAVEPOINT,
-- constraint violations, triggers firing, and ROLLBACK.
-- Run after `npm run seed`:
--   psql "$DATABASE_ADMIN_URL" -f db/postgres/demo/03_transactions_dml.sql
-- Ends with ROLLBACK, so the demo data is unchanged.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off
\set student '''aarav.mehta@skillgraph.dev'''
\set mentor  '''mentor@skillgraph.dev'''

BEGIN;
-- record who is acting, exactly as the API does (read by the audit trigger)
SELECT set_config('app.user_id', (SELECT user_id::text FROM users WHERE email = :mentor), true);

\echo '\n--- INSERT: a project and the skills it used ---'
INSERT INTO projects (user_id, title, description, repo_url, started_on, completed_on)
VALUES ((SELECT user_id FROM users WHERE email = :student),
        'Retail churn dashboard', 'Power BI dashboard over a cleaned retail dataset',
        'https://github.com/example/retail-churn', DATE '2026-08-01', DATE '2026-09-10')
RETURNING project_id AS new_project \gset

INSERT INTO project_skills (project_id, skill_id)
SELECT :'new_project', skill_id FROM skills WHERE name IN ('Power BI', 'Data Cleaning');

\echo '\n--- INSERT: evidence backed by that project (status pending): no verified Power BI skill yet ---'
INSERT INTO evidence (user_id, skill_id, project_id, kind, title, demonstrated_level)
SELECT (SELECT user_id FROM users WHERE email = :student), skill_id, :'new_project', 'project', 'Churn dashboard in Power BI', 3
FROM skills WHERE name = 'Power BI'
RETURNING evidence_id AS new_evidence \gset

SELECT skill_name, claimed_level, verified_level FROM v_user_skills
WHERE user_id = (SELECT user_id FROM users WHERE email = :student) AND skill_name = 'Power BI';

\echo '\n--- UPDATE: mentor verifies -> trigger evidence_sync creates/raises the skill with verified_level ---'
UPDATE evidence SET status = 'verified', reviewed_by = (SELECT user_id FROM users WHERE email = :mentor),
                    review_note = 'Clear DAX measures and documented cleaning steps'
WHERE evidence_id = :'new_evidence';

SELECT skill_name, claimed_level, verified_level, effective_level FROM v_user_skills
WHERE user_id = (SELECT user_id FROM users WHERE email = :student) AND skill_name = 'Power BI';

\echo '\n--- SAVEPOINT: a student cannot review evidence (trigger trg_evidence_guard) ---'
SAVEPOINT self_review;
\set ON_ERROR_STOP off
UPDATE evidence SET status = 'rejected', reviewed_by = (SELECT user_id FROM users WHERE email = :student)
WHERE evidence_id = :'new_evidence';
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT self_review;

\echo '\n--- SAVEPOINT: CHECK constraint on proficiency domain (level 7) ---'
SAVEPOINT bad_level;
\set ON_ERROR_STOP off
UPDATE user_skills SET claimed_level = 7
WHERE user_id = (SELECT user_id FROM users WHERE email = :student) AND skill_id = (SELECT skill_id FROM skills WHERE name = 'SQL');
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT bad_level;

\echo '\n--- SAVEPOINT: FK RESTRICT stops deleting a skill that roles depend on ---'
SAVEPOINT fk_restrict;
\set ON_ERROR_STOP off
DELETE FROM skills WHERE name = 'SQL';
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT fk_restrict;

\echo '\n--- Stored function inside the transaction: regenerate the roadmap (new version) ---'
SELECT generate_roadmap((SELECT user_id FROM users WHERE email = :student), 8) AS roadmap_id \gset
SELECT r.version, r.status, count(i.*) AS items
FROM roadmaps r LEFT JOIN roadmap_items i USING (roadmap_id)
WHERE r.user_id = (SELECT user_id FROM users WHERE email = :student)
GROUP BY r.roadmap_id ORDER BY r.version;

\echo '\n--- UPDATE: complete roadmap items -> trigger stamps completed_at ---'
UPDATE roadmap_items SET status = 'done' WHERE roadmap_id = :'roadmap_id' AND sequence_no <= 2;
SELECT sequence_no, status, completed_at IS NOT NULL AS stamped FROM roadmap_items
WHERE roadmap_id = :'roadmap_id' ORDER BY sequence_no LIMIT 3;

\echo '\n--- DELETE: removing the project sets evidence.project_id to NULL (ON DELETE SET NULL) ---'
SAVEPOINT del_project;
\set ON_ERROR_STOP off
DELETE FROM projects WHERE project_id = :'new_project';
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT del_project;
\echo '(fails: chk_has_backing requires a URL or a project, so evidence must be updated first)'
UPDATE evidence SET url = 'https://github.com/example/retail-churn' WHERE evidence_id = :'new_evidence';
DELETE FROM projects WHERE project_id = :'new_project';
SELECT evidence_id, project_id, url FROM evidence WHERE evidence_id = :'new_evidence';

\echo '\n--- Audit rows written by triggers in this transaction ---'
SELECT table_name, operation, new_data ->> 'status' AS status, actor_id IS NOT NULL AS has_actor
FROM audit_log WHERE changed_at = now() ORDER BY audit_id;   -- now() = this transaction's start time

ROLLBACK;
\echo '\nRolled back: database unchanged.'
