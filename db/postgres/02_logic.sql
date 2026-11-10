-- =====================================================================
-- SkillGraph · 02_logic.sql
-- Views, materialized view, functions, stored procedure, triggers, audit
-- =====================================================================

-- =====================================================================
-- 1. Helper functions
-- =====================================================================

-- Unproven claims count half: effective = verified + 0.5 * (claimed - verified)
CREATE OR REPLACE FUNCTION effective_level(p_claimed integer, p_verified integer)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT round(coalesce(p_verified,0) + 0.5 * GREATEST(coalesce(p_claimed,0) - coalesce(p_verified,0), 0), 2)
$$;

-- Actor of the current API transaction (set with SET LOCAL app.user_id = '<uuid>')
CREATE OR REPLACE FUNCTION current_actor()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- =====================================================================
-- 2. Views
-- =====================================================================

-- Each user's skills with the claims-vs-evidence split made explicit
CREATE OR REPLACE VIEW v_user_skills AS
SELECT us.user_id,
       us.skill_id,
       s.name                                         AS skill_name,
       s.category,
       us.claimed_level,
       us.verified_level,
       effective_level(us.claimed_level, us.verified_level) AS effective_level,
       (us.claimed_level > us.verified_level)         AS unproven_claim,
       us.source,
       us.updated_at
FROM user_skills us
JOIN skills s USING (skill_id);

-- Requirements of each career role, readable
CREATE OR REPLACE VIEW v_role_requirements AS
SELECT r.role_id, r.title AS role_title, r.domain,
       s.skill_id, s.name AS skill_name, s.category,
       rs.required_level, rs.importance
FROM career_roles r
JOIN role_skills rs USING (role_id)
JOIN skills s       USING (skill_id);

-- Active goal per user
CREATE OR REPLACE VIEW v_active_goals AS
SELECT g.goal_id, g.user_id, g.role_id, r.title AS role_title, g.target_date, g.created_at
FROM goals g
JOIN career_roles r USING (role_id)
WHERE g.status = 'active';

-- Gap of every user against the requirements of their active goal
CREATE OR REPLACE VIEW v_goal_gap AS
SELECT ag.user_id, ag.goal_id, ag.role_id, ag.role_title,
       rr.skill_id, rr.skill_name, rr.category, rr.required_level, rr.importance,
       coalesce(us.claimed_level, 0)  AS claimed_level,
       coalesce(us.verified_level, 0) AS verified_level,
       effective_level(us.claimed_level, us.verified_level) AS effective_level,
       GREATEST(rr.required_level - effective_level(us.claimed_level, us.verified_level), 0) AS gap,
       CASE
         WHEN us.verified_level >= rr.required_level                                   THEN 'proven'
         WHEN effective_level(us.claimed_level, us.verified_level) >= rr.required_level THEN 'met'
         WHEN us.claimed_level IS NULL                                                 THEN 'missing'
         ELSE 'partial'
       END AS gap_status
FROM v_active_goals ag
JOIN v_role_requirements rr ON rr.role_id = ag.role_id
LEFT JOIN user_skills us ON us.user_id = ag.user_id AND us.skill_id = rr.skill_id;

-- Mentor review queue
CREATE OR REPLACE VIEW v_evidence_queue AS
SELECT e.evidence_id, e.submitted_at, e.kind, e.title, e.url, e.demonstrated_level,
       e.user_id, p.full_name AS student_name, u.email AS student_email,
       s.skill_id, s.name AS skill_name,
       pr.title AS project_title, pr.repo_url AS project_repo,
       coalesce(us.claimed_level, 0) AS claimed_level,
       coalesce(us.verified_level, 0) AS verified_level
FROM evidence e
JOIN users u          ON u.user_id = e.user_id
LEFT JOIN profiles p  ON p.user_id = e.user_id
JOIN skills s         ON s.skill_id = e.skill_id
LEFT JOIN projects pr ON pr.project_id = e.project_id
LEFT JOIN user_skills us ON us.user_id = e.user_id AND us.skill_id = e.skill_id
WHERE e.status = 'pending';

-- Admin overview of every student
CREATE OR REPLACE VIEW v_student_overview AS
SELECT u.user_id, u.email, u.role, u.is_active, u.created_at, u.last_login_at,
       p.full_name,
       ag.role_title AS target_role,
       (SELECT count(*) FROM user_skills us WHERE us.user_id = u.user_id)                         AS skills_claimed,
       (SELECT count(*) FROM user_skills us WHERE us.user_id = u.user_id AND us.verified_level > 0) AS skills_verified,
       (SELECT count(*) FROM evidence e WHERE e.user_id = u.user_id AND e.status = 'pending')     AS evidence_pending,
       (SELECT count(*) FROM projects pr WHERE pr.user_id = u.user_id)                             AS projects
FROM users u
LEFT JOIN profiles p      ON p.user_id = u.user_id
LEFT JOIN v_active_goals ag ON ag.user_id = u.user_id;

-- Materialized: skill demand across active job postings (refreshed by procedure)
CREATE MATERIALIZED VIEW mv_skill_demand AS
SELECT s.skill_id, s.name AS skill_name, s.category,
       count(DISTINCT js.job_id)                                     AS postings,
       count(DISTINCT js.job_id) FILTER (WHERE js.is_required)       AS required_in,
       count(DISTINCT jp.role_id)                                    AS roles_hiring,
       (SELECT count(*) FROM role_skills rs WHERE rs.skill_id = s.skill_id) AS roles_requiring,
       (SELECT count(*) FROM user_skills us WHERE us.skill_id = s.skill_id) AS learners
FROM skills s
LEFT JOIN job_skills js   ON js.skill_id = s.skill_id
LEFT JOIN job_postings jp ON jp.job_id = js.job_id AND jp.is_active
GROUP BY s.skill_id, s.name, s.category
WITH NO DATA;

CREATE UNIQUE INDEX ux_mv_skill_demand ON mv_skill_demand(skill_id);  -- enables REFRESH ... CONCURRENTLY

-- =====================================================================
-- 3. Core reasoning functions
-- =====================================================================

-- 7-factor, explainable priority for every skill the user still lacks for a role.
-- Candidates = the role's required skills + all their transitive prerequisites
-- (recursive CTE over skill_prerequisites).
CREATE OR REPLACE FUNCTION compute_skill_priorities(p_user uuid, p_role integer)
RETURNS TABLE (
  skill_id        integer,
  skill_name      text,
  category        text,
  is_direct       boolean,
  required_level  integer,
  claimed_level   integer,
  verified_level  integer,
  effective_level numeric,
  demand          numeric,
  relevance       numeric,
  gap             numeric,
  readiness       numeric,
  interest        numeric,
  evidence        numeric,
  ease            numeric,
  priority        numeric,
  prereqs_total   integer,
  prereqs_met     integer,
  missing_prereqs text[],
  depth           integer
)
LANGUAGE sql STABLE AS $$
WITH RECURSIVE
req AS (
  SELECT rs.skill_id, rs.required_level::int AS required_level, rs.importance::numeric AS importance
  FROM role_skills rs WHERE rs.role_id = p_role
),
closure(skill_id, required_level, importance, path) AS (
  SELECT r.skill_id, r.required_level, r.importance, ARRAY[r.skill_id] FROM req r
  UNION ALL
  SELECT sp.prereq_skill_id, 2, (c.importance * sp.strength * 0.8)::numeric, c.path || sp.prereq_skill_id
  FROM closure c
  JOIN skill_prerequisites sp ON sp.skill_id = c.skill_id
  WHERE sp.prereq_skill_id <> ALL (c.path)
),
cand AS (
  SELECT c.skill_id,
         max(c.required_level) AS required_level,
         max(c.importance)     AS importance,
         bool_or(c.skill_id IN (SELECT r.skill_id FROM req r)) AS is_direct
  FROM closure c GROUP BY c.skill_id
),
mine AS (
  SELECT us.skill_id, us.claimed_level::int AS claimed, us.verified_level::int AS verified,
         effective_level(us.claimed_level, us.verified_level) AS eff
  FROM user_skills us WHERE us.user_id = p_user
),
role_demand AS (
  SELECT DISTINCT ON (ms.skill_id) ms.skill_id, ms.demand_score
  FROM market_signals ms WHERE ms.role_id = p_role
  ORDER BY ms.skill_id, ms.snapshot_date DESC
),
market_demand AS (
  SELECT DISTINCT ON (ms.skill_id) ms.skill_id, ms.demand_score
  FROM market_signals ms WHERE ms.role_id IS NULL
  ORDER BY ms.skill_id, ms.snapshot_date DESC
),
pre AS (
  SELECT sp.skill_id,
         count(*)::int                                              AS total,
         (count(*) FILTER (WHERE coalesce(m.eff, 0) >= 2))::int     AS met,
         array_agg(ps.name::text ORDER BY ps.name) FILTER (WHERE coalesce(m.eff, 0) < 2) AS missing
  FROM skill_prerequisites sp
  JOIN skills ps      ON ps.skill_id = sp.prereq_skill_id
  LEFT JOIN mine m    ON m.skill_id = sp.prereq_skill_id
  GROUP BY sp.skill_id
),
chain(root, node, d) AS (          -- prerequisite depth: how far down the chain a skill sits
  SELECT c.skill_id, c.skill_id, 0 FROM cand c
  UNION ALL
  SELECT ch.root, sp.prereq_skill_id, ch.d + 1
  FROM chain ch JOIN skill_prerequisites sp ON sp.skill_id = ch.node
  WHERE ch.d < 20
),
depths AS (SELECT root AS skill_id, max(d)::int AS depth FROM chain GROUP BY root),
w AS (
  SELECT max(weight) FILTER (WHERE factor = 'demand')    AS w_demand,
         max(weight) FILTER (WHERE factor = 'relevance') AS w_relevance,
         max(weight) FILTER (WHERE factor = 'gap')       AS w_gap,
         max(weight) FILTER (WHERE factor = 'readiness') AS w_readiness,
         max(weight) FILTER (WHERE factor = 'interest')  AS w_interest,
         max(weight) FILTER (WHERE factor = 'evidence')  AS w_evidence,
         max(weight) FILTER (WHERE factor = 'ease')      AS w_ease,
         nullif(sum(weight), 0)                          AS w_total
  FROM scoring_weights
),
f AS (
  SELECT c.skill_id, s.name::text AS skill_name, s.category::text AS category, c.is_direct,
         c.required_level,
         coalesce(m.claimed, 0)  AS claimed_level,
         coalesce(m.verified, 0) AS verified_level,
         coalesce(m.eff, 0)      AS effective_level,
         round(coalesce(rd.demand_score, md.demand_score, 0), 4)                        AS demand,
         round(LEAST(c.importance, 1), 4)                                               AS relevance,
         round(GREATEST(c.required_level - coalesce(m.eff, 0), 0) / c.required_level, 4) AS gap,
         round(CASE WHEN p.total IS NULL THEN 1 ELSE p.met::numeric / p.total END, 4)   AS readiness,
         round(CASE WHEN prof.embedding IS NULL OR s.embedding IS NULL THEN 0.5
                    ELSE GREATEST(0, LEAST(1, 1 - (prof.embedding <=> s.embedding)))::numeric END, 4) AS interest,
         round(CASE WHEN coalesce(m.verified, 0) >= c.required_level THEN 0
                    WHEN coalesce(m.claimed, 0) > coalesce(m.verified, 0) THEN 1.0
                    ELSE 0.6 END, 4)                                                    AS evidence,
         round(1 - ln(s.effort_hours::numeric) / ln(400::numeric), 4)                                     AS ease,
         coalesce(p.total, 0) AS prereqs_total,
         coalesce(p.met, 0)   AS prereqs_met,
         coalesce(p.missing, '{}') AS missing_prereqs,
         coalesce(dp.depth, 0) AS depth
  FROM cand c
  JOIN skills s          ON s.skill_id = c.skill_id
  LEFT JOIN mine m       ON m.skill_id = c.skill_id
  LEFT JOIN role_demand rd   ON rd.skill_id = c.skill_id
  LEFT JOIN market_demand md ON md.skill_id = c.skill_id
  LEFT JOIN pre p        ON p.skill_id = c.skill_id
  LEFT JOIN depths dp    ON dp.skill_id = c.skill_id
  LEFT JOIN profiles prof ON prof.user_id = p_user
  WHERE coalesce(m.eff, 0) < c.required_level          -- only real gaps
)
SELECT f.skill_id, f.skill_name, f.category, f.is_direct, f.required_level,
       f.claimed_level, f.verified_level, f.effective_level,
       f.demand, f.relevance, f.gap, f.readiness, f.interest, f.evidence, f.ease,
       round(( w.w_demand    * f.demand
             + w.w_relevance * f.relevance
             + w.w_gap       * f.gap
             + w.w_readiness * f.readiness
             + w.w_interest  * f.interest
             + w.w_evidence  * f.evidence
             + w.w_ease      * f.ease) / w.w_total, 4) AS priority,
       f.prereqs_total, f.prereqs_met, f.missing_prereqs, f.depth
FROM f CROSS JOIN w
ORDER BY priority DESC, f.skill_name;
$$;

COMMENT ON FUNCTION compute_skill_priorities(uuid, integer) IS
  'Explainable 7-factor priority (demand, relevance, gap, readiness, interest, evidence, ease) for each missing skill';

-- Generates a new, versioned Learn > Build > Prove roadmap for the user's active goal.
-- Runs inside the caller's transaction; an advisory lock serialises concurrent requests per user.
CREATE OR REPLACE FUNCTION generate_roadmap(p_user uuid, p_max_items integer DEFAULT 12)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_goal     uuid;
  v_role     integer;
  v_title    text;
  v_version  integer;
  v_roadmap  uuid;
  v_weights  jsonb;
BEGIN
  IF p_max_items NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'p_max_items must be between 1 and 30' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roadmap:' || p_user::text));

  SELECT g.goal_id, g.role_id, r.title INTO v_goal, v_role, v_title
  FROM goals g JOIN career_roles r USING (role_id)
  WHERE g.user_id = p_user AND g.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User has no active career goal' USING ERRCODE = 'P0002';
  END IF;

  UPDATE roadmaps SET status = 'archived'
  WHERE goal_id = v_goal AND status IN ('active', 'completed');

  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM roadmaps WHERE goal_id = v_goal;

  INSERT INTO roadmaps (user_id, goal_id, version)
  VALUES (p_user, v_goal, v_version)
  RETURNING roadmap_id INTO v_roadmap;

  SELECT jsonb_object_agg(factor, weight) INTO v_weights FROM scoring_weights;

  INSERT INTO roadmap_items (roadmap_id, skill_id, phase, sequence_no, priority_score, score_breakdown, rationale)
  SELECT v_roadmap,
         t.skill_id,
         t.phase,
         row_number() OVER (ORDER BY t.depth, t.priority DESC, t.skill_name)::smallint,
         t.priority,
         jsonb_build_object(
           'demand', t.demand, 'relevance', t.relevance, 'gap', t.gap, 'readiness', t.readiness,
           'interest', t.interest, 'evidence', t.evidence, 'ease', t.ease,
           'required_level', t.required_level, 'effective_level', t.effective_level,
           'claimed_level', t.claimed_level, 'verified_level', t.verified_level,
           'missing_prereqs', to_jsonb(t.missing_prereqs), 'weights', v_weights),
         format('%s at level %s is %s for %s; you are at %s (claimed %s, verified %s). %s%s',
                t.skill_name, t.required_level,
                CASE WHEN t.is_direct THEN 'required' ELSE 'a prerequisite' END,
                v_title, trim_scale(t.effective_level),
                t.claimed_level, t.verified_level,
                CASE WHEN t.demand >= 0.5 THEN format('High market demand (%s%% of postings). ', round(t.demand * 100))
                     WHEN t.demand > 0    THEN format('Appears in %s%% of postings. ', round(t.demand * 100))
                     ELSE '' END,
                CASE t.phase
                  WHEN 'learn' THEN CASE WHEN cardinality(t.missing_prereqs) > 0
                                         THEN 'Cover first: ' || array_to_string(t.missing_prereqs, ', ') || '. Then learn the fundamentals.'
                                         ELSE 'All prerequisites met: learn the fundamentals.' END
                  WHEN 'build' THEN 'You know the basics: apply it in a project.'
                  ELSE 'Already used in a project: submit evidence for mentor review.'
                END)
  FROM (
    SELECT cp.*,
           CASE
             WHEN cp.claimed_level < 2 THEN 'learn'
             WHEN NOT EXISTS (SELECT 1 FROM project_skills ps JOIN projects pj USING (project_id)
                              WHERE pj.user_id = p_user AND ps.skill_id = cp.skill_id) THEN 'build'
             ELSE 'prove'
           END AS phase
    FROM compute_skill_priorities(p_user, v_role) cp
    ORDER BY cp.priority DESC
    LIMIT p_max_items
  ) t;

  RETURN v_roadmap;
END;
$$;

-- Hybrid job matching: 60% structured skill overlap + 40% semantic (pgvector cosine) similarity
CREATE OR REPLACE FUNCTION match_jobs(p_user uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (
  job_id            uuid,
  title             text,
  company           text,
  location          text,
  work_mode         text,
  role_title        text,
  structured_score  numeric,
  semantic_score    numeric,
  match_score       numeric,
  matched_skills    text[],
  missing_required  text[]
)
LANGUAGE sql STABLE AS $$
WITH mine AS (
  SELECT us.skill_id, effective_level(us.claimed_level, us.verified_level) AS eff
  FROM user_skills us WHERE us.user_id = p_user
),
prof AS (SELECT embedding FROM profiles WHERE user_id = p_user),
overlap AS (
  SELECT js.job_id,
         sum(CASE WHEN js.is_required THEN 1.0 ELSE 0.5 END * LEAST(coalesce(m.eff, 0) / 3.0, 1))
           / sum(CASE WHEN js.is_required THEN 1.0 ELSE 0.5 END)                                AS structured,
         array_agg(s.name::text ORDER BY s.name) FILTER (WHERE coalesce(m.eff, 0) >= 2)          AS matched,
         array_agg(s.name::text ORDER BY s.name) FILTER (WHERE js.is_required AND coalesce(m.eff, 0) < 2) AS missing
  FROM job_skills js
  JOIN skills s   ON s.skill_id = js.skill_id
  LEFT JOIN mine m ON m.skill_id = js.skill_id
  GROUP BY js.job_id
)
SELECT jp.job_id, jp.title::text, jp.company::text, jp.location::text, jp.work_mode::text, cr.title::text,
       round(coalesce(o.structured, 0), 4),
       round(CASE WHEN prof.embedding IS NULL OR jp.embedding IS NULL THEN 0
                  ELSE GREATEST(0, LEAST(1, 1 - (jp.embedding <=> prof.embedding)))::numeric END, 4) AS sem,
       round(0.6 * coalesce(o.structured, 0)
           + 0.4 * CASE WHEN prof.embedding IS NULL OR jp.embedding IS NULL THEN 0
                        ELSE GREATEST(0, LEAST(1, 1 - (jp.embedding <=> prof.embedding)))::numeric END, 4) AS score,
       coalesce(o.matched, '{}'), coalesce(o.missing, '{}')
FROM job_postings jp
LEFT JOIN career_roles cr ON cr.role_id = jp.role_id
LEFT JOIN overlap o       ON o.job_id = jp.job_id
LEFT JOIN prof ON true
WHERE jp.is_active
ORDER BY score DESC, jp.posted_at DESC
LIMIT p_limit;
$$;

-- Readiness for the active goal as a single percentage (used on the dashboard)
CREATE OR REPLACE FUNCTION goal_readiness(p_user uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT round(100 * sum(rr.importance * LEAST(effective_level(us.claimed_level, us.verified_level) / rr.required_level, 1))
                   / nullif(sum(rr.importance), 0), 1)
  FROM v_active_goals ag
  JOIN role_skills rr ON rr.role_id = ag.role_id
  LEFT JOIN user_skills us ON us.user_id = ag.user_id AND us.skill_id = rr.skill_id
  WHERE ag.user_id = p_user
$$;

-- =====================================================================
-- 4. Stored procedure
-- =====================================================================

-- Rebuilds today's market-signal snapshot from active postings.
-- demand_score = weighted share of postings (per role and market-wide) that ask for the skill;
-- required = 1.0, optional = 0.5; postings older than 90 days count half.
CREATE OR REPLACE PROCEDURE refresh_market_signals()
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM market_signals WHERE snapshot_date = current_date;

  WITH jp AS (
    SELECT job_id, role_id,
           CASE WHEN posted_at >= current_date - 90 THEN 1.0 ELSE 0.5 END AS recency
    FROM job_postings WHERE is_active
  ),
  role_totals AS (SELECT role_id, sum(recency) AS total FROM jp WHERE role_id IS NOT NULL GROUP BY role_id),
  per_role AS (
    SELECT js.skill_id, jp.role_id,
           sum(jp.recency * CASE WHEN js.is_required THEN 1.0 ELSE 0.5 END) AS weighted,
           count(*) AS n
    FROM job_skills js JOIN jp USING (job_id)
    WHERE jp.role_id IS NOT NULL
    GROUP BY js.skill_id, jp.role_id
  )
  INSERT INTO market_signals (skill_id, role_id, demand_score, posting_count)
  SELECT pr.skill_id, pr.role_id, round(LEAST(pr.weighted / rt.total, 1), 4), pr.n
  FROM per_role pr JOIN role_totals rt USING (role_id);

  WITH jp AS (
    SELECT job_id, CASE WHEN posted_at >= current_date - 90 THEN 1.0 ELSE 0.5 END AS recency
    FROM job_postings WHERE is_active
  ),
  total AS (SELECT nullif(sum(recency), 0) AS t FROM jp)
  INSERT INTO market_signals (skill_id, role_id, demand_score, posting_count)
  SELECT js.skill_id, NULL,
         round(LEAST(sum(jp.recency * CASE WHEN js.is_required THEN 1.0 ELSE 0.5 END) / (SELECT t FROM total), 1), 4),
         count(*)
  FROM job_skills js JOIN jp USING (job_id)
  GROUP BY js.skill_id;

  REFRESH MATERIALIZED VIEW mv_skill_demand;

  INSERT INTO app_meta (key, value) VALUES ('market_refreshed_at', now()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$$;

-- =====================================================================
-- 5. Triggers
-- =====================================================================

-- 5a. updated_at maintenance
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER profiles_updated_at    BEFORE UPDATE ON profiles    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER user_skills_updated_at BEFORE UPDATE ON user_skills FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 5b. Evidence integrity rules that span tables
--     * a backing project must belong to the same user
--     * only a mentor/admin may review, and never their own evidence
CREATE OR REPLACE FUNCTION trg_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_reviewer_role user_role;
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM projects WHERE project_id = NEW.project_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Evidence can only reference the student''s own project' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'pending' THEN
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  ELSE
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.reviewed_at IS NOT NULL THEN
      RETURN NEW;  -- already reviewed, unrelated change
    END IF;
    SELECT role INTO v_reviewer_role FROM users WHERE user_id = NEW.reviewed_by;
    IF v_reviewer_role IS NULL OR v_reviewer_role NOT IN ('mentor', 'admin') THEN
      RAISE EXCEPTION 'Evidence must be reviewed by a mentor or admin' USING ERRCODE = '42501';
    END IF;
    IF NEW.reviewed_by = NEW.user_id THEN
      RAISE EXCEPTION 'Users cannot review their own evidence' USING ERRCODE = '42501';
    END IF;
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_guard
BEFORE INSERT OR UPDATE ON evidence
FOR EACH ROW EXECUTE FUNCTION trg_evidence_guard();

-- 5c. verified_level is DERIVED: max demonstrated level of verified evidence.
CREATE OR REPLACE FUNCTION sync_verified_level(p_user uuid, p_skill integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_level smallint;
BEGIN
  SELECT coalesce(max(demonstrated_level), 0) INTO v_level
  FROM evidence WHERE user_id = p_user AND skill_id = p_skill AND status = 'verified';

  UPDATE user_skills
     SET verified_level = v_level,
         claimed_level  = GREATEST(claimed_level, v_level)    -- a proven level is never above the claim
   WHERE user_id = p_user AND skill_id = p_skill;

  IF NOT FOUND AND v_level > 0 THEN
    INSERT INTO user_skills (user_id, skill_id, claimed_level, verified_level, source)
    VALUES (p_user, p_skill, v_level, v_level, 'evidence');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_evidence_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM sync_verified_level(OLD.user_id, OLD.skill_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM sync_verified_level(NEW.user_id, NEW.skill_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER evidence_sync
AFTER INSERT OR UPDATE OF status, demonstrated_level, skill_id OR DELETE ON evidence
FOR EACH ROW EXECUTE FUNCTION trg_evidence_sync();

-- 5d. The prerequisite graph must stay acyclic (a DAG)
CREATE OR REPLACE FUNCTION trg_prereq_no_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE down(node) AS (
      SELECT NEW.prereq_skill_id
      UNION
      SELECT sp.prereq_skill_id FROM skill_prerequisites sp JOIN down d ON sp.skill_id = d.node
    )
    SELECT 1 FROM down WHERE node = NEW.skill_id
  ) THEN
    RAISE EXCEPTION 'Prerequisite % -> % would create a cycle', NEW.prereq_skill_id, NEW.skill_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prereq_no_cycle
BEFORE INSERT OR UPDATE ON skill_prerequisites
FOR EACH ROW EXECUTE FUNCTION trg_prereq_no_cycle();

-- 5e. Setting a new active goal retires the previous one (works with ux_goals_one_active)
CREATE OR REPLACE FUNCTION trg_goal_single_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE goals SET status = 'dropped'
    WHERE user_id = NEW.user_id AND status = 'active' AND goal_id <> NEW.goal_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER goal_single_active
BEFORE INSERT OR UPDATE OF status ON goals
FOR EACH ROW EXECUTE FUNCTION trg_goal_single_active();

-- 5f. Roadmap item progress: timestamp + roll-up to the roadmap
CREATE OR REPLACE FUNCTION trg_item_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.completed_at := CASE WHEN NEW.status = 'done' THEN coalesce(OLD.completed_at, now()) ELSE NULL END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER item_status
BEFORE UPDATE OF status ON roadmap_items
FOR EACH ROW EXECUTE FUNCTION trg_item_status();

CREATE OR REPLACE FUNCTION trg_roadmap_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE roadmaps r
     SET status = CASE WHEN NOT EXISTS (SELECT 1 FROM roadmap_items i
                                        WHERE i.roadmap_id = r.roadmap_id AND i.status <> 'done')
                       THEN 'completed' ELSE 'active' END
   WHERE r.roadmap_id = NEW.roadmap_id AND r.status IN ('active', 'completed');
  RETURN NULL;
END;
$$;

CREATE TRIGGER roadmap_rollup
AFTER UPDATE OF status ON roadmap_items
FOR EACH ROW EXECUTE FUNCTION trg_roadmap_rollup();

-- 5g. Generic audit trail (TG_ARGV[0] = primary-key column)
CREATE OR REPLACE FUNCTION trg_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'password_hash' - 'embedding' - 'search_tsv' END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'password_hash' - 'embedding' - 'search_tsv' END;
BEGIN
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN
    RETURN NULL;   -- nothing auditable changed (e.g. only the embedding)
  END IF;
  INSERT INTO audit_log (table_name, operation, row_pk, actor_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, TG_OP, coalesce(v_new, v_old) ->> TG_ARGV[0], current_actor(), v_old, v_new);
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_users   AFTER UPDATE OF role, is_active OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_audit('user_id');
CREATE TRIGGER audit_evidence AFTER UPDATE OF status ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_audit('evidence_id');
CREATE TRIGGER audit_skills  AFTER INSERT OR UPDATE OR DELETE ON skills
  FOR EACH ROW EXECUTE FUNCTION trg_audit('skill_id');
CREATE TRIGGER audit_roles   AFTER INSERT OR UPDATE OR DELETE ON career_roles
  FOR EACH ROW EXECUTE FUNCTION trg_audit('role_id');
CREATE TRIGGER audit_weights AFTER UPDATE ON scoring_weights
  FOR EACH ROW EXECUTE FUNCTION trg_audit('factor');
