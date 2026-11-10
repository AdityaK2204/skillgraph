-- =====================================================================
-- SkillGraph · demo/02_important_queries.sql
-- The queries behind the application, runnable on their own.
-- Run after `npm run seed`:
--   psql "$DATABASE_ADMIN_URL" -f db/postgres/demo/02_important_queries.sql
-- =====================================================================
\set student '''aarav.mehta@skillgraph.dev'''
\pset pager off

\echo '\n=== Q1  JOIN (4 tables): the student''s skills with claims vs. evidence ==='
SELECT p.full_name, s.name AS skill, s.category, us.claimed_level, us.verified_level,
       effective_level(us.claimed_level, us.verified_level) AS effective
FROM users u
JOIN profiles p     ON p.user_id = u.user_id
JOIN user_skills us ON us.user_id = u.user_id
JOIN skills s       ON s.skill_id = us.skill_id
WHERE u.email = :student
ORDER BY effective DESC, s.name;

\echo '\n=== Q2  LEFT JOIN + CASE: gap against the active goal (via view v_goal_gap) ==='
SELECT role_title, skill_name, required_level, claimed_level, verified_level, effective_level, gap, gap_status
FROM v_goal_gap
WHERE user_id = (SELECT user_id FROM users WHERE email = :student)
ORDER BY gap DESC, importance DESC;

\echo '\n=== Q3  GROUP BY + HAVING + aggregates: skills demanded by at least 5 active postings ==='
SELECT s.name, s.category,
       count(*)                                     AS postings,
       count(*) FILTER (WHERE js.is_required)       AS required_in,
       round(100.0 * count(*) / (SELECT count(*) FROM job_postings WHERE is_active), 1) AS pct_of_postings
FROM job_skills js
JOIN job_postings jp ON jp.job_id = js.job_id AND jp.is_active
JOIN skills s        ON s.skill_id = js.skill_id
GROUP BY s.skill_id, s.name, s.category
HAVING count(*) >= 5
ORDER BY postings DESC, s.name;

\echo '\n=== Q4  Correlated subquery: skills a student claims but has never proven ==='
SELECT u.email, s.name AS skill, us.claimed_level
FROM user_skills us
JOIN users u  ON u.user_id = us.user_id
JOIN skills s ON s.skill_id = us.skill_id
WHERE us.claimed_level >= 3
  AND NOT EXISTS (SELECT 1 FROM evidence e
                  WHERE e.user_id = us.user_id AND e.skill_id = us.skill_id AND e.status = 'verified')
ORDER BY u.email, us.claimed_level DESC;

\echo '\n=== Q5  Subquery in WHERE (IN) + ORDER BY: roles needing a skill above the catalogue average level ==='
SELECT r.title, s.name, rs.required_level
FROM role_skills rs
JOIN career_roles r USING (role_id)
JOIN skills s       USING (skill_id)
WHERE rs.required_level > (SELECT avg(required_level) FROM role_skills)
  AND s.skill_id IN (SELECT skill_id FROM job_skills GROUP BY skill_id HAVING count(*) >= 3)
ORDER BY rs.required_level DESC, r.title;

\echo '\n=== Q6  Recursive CTE: every prerequisite (transitive) of Machine Learning, with depth ==='
WITH RECURSIVE chain(skill_id, depth, path) AS (
  SELECT sp.prereq_skill_id, 1, ARRAY[(SELECT name FROM skills WHERE name = 'Machine Learning')::text]
  FROM skill_prerequisites sp JOIN skills s ON s.skill_id = sp.skill_id WHERE s.name = 'Machine Learning'
  UNION ALL
  SELECT sp.prereq_skill_id, c.depth + 1, c.path || (SELECT name::text FROM skills WHERE skill_id = c.skill_id)
  FROM chain c JOIN skill_prerequisites sp ON sp.skill_id = c.skill_id
)
SELECT DISTINCT ON (s.name) s.name AS prerequisite, c.depth, array_to_string(c.path, ' <- ') AS reached_via
FROM chain c JOIN skills s ON s.skill_id = c.skill_id
ORDER BY s.name, c.depth;

\echo '\n=== Q7  Window functions: rank students by readiness within each target role ==='
SELECT ag.role_title, p.full_name, goal_readiness(ag.user_id) AS readiness_pct,
       rank() OVER (PARTITION BY ag.role_id ORDER BY goal_readiness(ag.user_id) DESC) AS rank_in_role
FROM v_active_goals ag
JOIN profiles p USING (user_id)
ORDER BY ag.role_title, rank_in_role;

\echo '\n=== Q8  Stored function: explainable 7-factor priorities for the student ==='
SELECT skill_name, required_level, effective_level, demand, relevance, gap, readiness, interest, evidence, ease, priority
FROM compute_skill_priorities((SELECT user_id FROM users WHERE email = :student),
                              (SELECT role_id FROM v_active_goals WHERE user_id = (SELECT user_id FROM users WHERE email = :student)))
LIMIT 10;

\echo '\n=== Q9  Full-text search (GIN + ts_rank): jobs matching "python dashboards" ==='
SELECT title, company, ts_rank(search_tsv, q) AS rank
FROM job_postings, websearch_to_tsquery('english', 'python dashboards') q
WHERE search_tsv @@ q AND is_active
ORDER BY rank DESC
LIMIT 5;

\echo '\n=== Q10 Vector similarity (pgvector, cosine, HNSW): 5 postings closest to the student profile ==='
SELECT jp.title, jp.company, round((1 - (jp.embedding <=> p.embedding))::numeric, 3) AS cosine_similarity
FROM job_postings jp, profiles p
WHERE p.user_id = (SELECT user_id FROM users WHERE email = :student) AND jp.is_active
ORDER BY jp.embedding <=> p.embedding
LIMIT 5;

\echo '\n=== Q11 Hybrid job matching (structured overlap + semantic similarity) ==='
SELECT title, company, structured_score, semantic_score, match_score, missing_required
FROM match_jobs((SELECT user_id FROM users WHERE email = :student), 5);

\echo '\n=== Q12 Trigram similarity: "did you mean" for a misspelt skill ==='
SELECT name, round(similarity(name, 'Postgress')::numeric, 2) AS sim
FROM skills WHERE name % 'Postgress' ORDER BY sim DESC LIMIT 3;

\echo '\n=== Q13 Materialized view: market demand vs. learner supply ==='
SELECT skill_name, postings, required_in, roles_requiring, learners,
       round(postings::numeric / greatest(learners, 1), 2) AS demand_per_learner
FROM mv_skill_demand
WHERE postings > 0
ORDER BY demand_per_learner DESC
LIMIT 10;

\echo '\n=== Q14 EXPLAIN: the mentor queue uses the partial index ix_evidence_pending ==='
SET enable_seqscan = off;
EXPLAIN (COSTS OFF) SELECT evidence_id FROM evidence WHERE status = 'pending' ORDER BY submitted_at;
RESET enable_seqscan;

\echo '\n=== Q15 Audit trail: who changed what ==='
SELECT a.changed_at, a.table_name, a.operation, a.row_pk, u.email AS actor,
       a.old_data ->> 'status' AS old_status, a.new_data ->> 'status' AS new_status
FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
ORDER BY a.changed_at DESC
LIMIT 10;
