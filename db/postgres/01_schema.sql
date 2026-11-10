-- =====================================================================
-- SkillGraph · PostgreSQL transactional core
-- 01_schema.sql  —  extensions, domains, types, tables, constraints, indexes
-- Runs automatically on first `docker compose up` (docker-entrypoint-initdb.d)
-- or manually with: npm run db:init
-- =====================================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: embeddings + similarity search
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram fuzzy matching for skill names

-- ---------- Domains (reusable validated types) ----------
CREATE DOMAIN email_address AS citext
  CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

CREATE DOMAIN proficiency AS smallint
  CHECK (VALUE BETWEEN 0 AND 5);            -- 0 = none, 5 = expert

CREATE DOMAIN unit_score AS numeric(5,4)
  CHECK (VALUE BETWEEN 0 AND 1);            -- every score factor lives in [0,1]

CREATE DOMAIN web_url AS varchar(300)
  CHECK (VALUE ~ '^https?://[^\s]+$');

-- ---------- Enumerated types ----------
CREATE TYPE user_role     AS ENUM ('student', 'mentor', 'admin');
CREATE TYPE evidence_kind AS ENUM ('certificate', 'repository', 'project', 'assessment', 'publication');

-- =====================================================================
-- Identity & profile
-- =====================================================================
CREATE TABLE users (
  user_id        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email          email_address NOT NULL UNIQUE,
  password_hash  text          NOT NULL CHECK (password_hash ~ '^\$2[aby]\$\d{2}\$.{53}$'),  -- bcrypt only, never plain text
  role           user_role     NOT NULL DEFAULT 'student',
  is_active      boolean       NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  profile_id      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid         NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,  -- 1:1
  full_name       varchar(120) NOT NULL CHECK (length(btrim(full_name)) >= 2),
  education_level varchar(30)  CHECK (education_level IN ('high_school','diploma','bachelors','masters','phd','other')),
  institution     varchar(150),
  graduation_year smallint     CHECK (graduation_year BETWEEN 1980 AND 2040),
  interests       text[]       NOT NULL DEFAULT '{}' CHECK (cardinality(interests) <= 15),
  bio             text         CHECK (length(bio) <= 1000),
  weekly_hours    smallint     NOT NULL DEFAULT 8 CHECK (weekly_hours BETWEEN 1 AND 80),
  embedding       vector(384),                                   -- profile vector (bio + interests + skills)
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
  resume_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mongo_doc_id     char(24)     NOT NULL UNIQUE CHECK (mongo_doc_id ~ '^[0-9a-f]{24}$'),  -- -> MongoDB resumes_raw._id
  file_name        varchar(255) NOT NULL,
  file_size_bytes  integer      NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 5242880),  -- max 5 MB
  parse_status     varchar(10)  NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsed','failed')),
  skills_detected  smallint     NOT NULL DEFAULT 0 CHECK (skills_detected >= 0),
  uploaded_at      timestamptz  NOT NULL DEFAULT now()
);

-- =====================================================================
-- Skill knowledge (projected into Neo4j)
-- =====================================================================
CREATE TABLE skills (
  skill_id       serial       PRIMARY KEY,
  name           varchar(80)  NOT NULL UNIQUE,
  category       varchar(30)  NOT NULL CHECK (category IN
                   ('language','frontend','backend','data','ml','devops','cloud','database','foundation','soft')),
  description    text         NOT NULL CHECK (length(description) >= 10),
  aliases        text[]       NOT NULL DEFAULT '{}',          -- used by the resume parser
  effort_hours   smallint     NOT NULL CHECK (effort_hours BETWEEN 1 AND 400),  -- typical hours to reach working level
  neo4j_node_id  varchar(64),
  embedding      vector(384),
  search_tsv     tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('english', coalesce(name,'')), 'A') ||
                   setweight(to_tsvector('english', coalesce(description,'')), 'B')) STORED,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE career_roles (
  role_id        serial       PRIMARY KEY,
  title          varchar(100) NOT NULL UNIQUE,
  domain         varchar(60)  NOT NULL,
  seniority      varchar(10)  NOT NULL DEFAULT 'junior' CHECK (seniority IN ('intern','junior','mid','senior')),
  description    text         NOT NULL,
  neo4j_node_id  varchar(64),
  embedding      vector(384),
  created_at     timestamptz  NOT NULL DEFAULT now()
);

-- Recursive M:N  (skill requires prereq_skill)
CREATE TABLE skill_prerequisites (
  skill_id         integer      NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  prereq_skill_id  integer      NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  strength         numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (strength > 0 AND strength <= 1),
  PRIMARY KEY (skill_id, prereq_skill_id),
  CONSTRAINT chk_no_self_prereq CHECK (skill_id <> prereq_skill_id)
);

-- M:N  role requires skill
CREATE TABLE role_skills (
  role_id         integer      NOT NULL REFERENCES career_roles(role_id) ON DELETE CASCADE,
  skill_id        integer      NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
  required_level  proficiency  NOT NULL CHECK (required_level >= 1),
  importance      numeric(3,2) NOT NULL CHECK (importance BETWEEN 0.05 AND 1),
  PRIMARY KEY (role_id, skill_id)
);

-- M:N  user holds skill  (claims vs. evidence)
CREATE TABLE user_skills (
  user_id         uuid         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_id        integer      NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
  claimed_level   proficiency  NOT NULL CHECK (claimed_level >= 1),
  verified_level  proficiency  NOT NULL DEFAULT 0,            -- maintained by trigger from verified evidence
  source          varchar(10)  NOT NULL DEFAULT 'self' CHECK (source IN ('self','resume','evidence')),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);

-- One user may hold many goals over time, but only ONE active goal (partial unique index below)
CREATE TABLE goals (
  goal_id      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role_id      integer      NOT NULL REFERENCES career_roles(role_id) ON DELETE RESTRICT,
  target_date  date         CHECK (target_date >= DATE '2024-01-01'),
  status       varchar(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','dropped')),
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- =====================================================================
-- Projects & evidence
-- =====================================================================
CREATE TABLE projects (
  project_id    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title         varchar(120) NOT NULL CHECK (length(btrim(title)) >= 3),
  description   text         CHECK (length(description) <= 2000),
  repo_url      web_url,
  started_on    date,
  completed_on  date,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT chk_project_dates CHECK (completed_on IS NULL OR started_on IS NULL OR completed_on >= started_on)
);

CREATE TABLE project_skills (
  project_id  uuid     NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  skill_id    integer  NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
  PRIMARY KEY (project_id, skill_id)
);

CREATE TABLE evidence (
  evidence_id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid           NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_id            integer        NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
  project_id          uuid           REFERENCES projects(project_id) ON DELETE SET NULL,  -- optional backing project
  kind                evidence_kind  NOT NULL,
  title               varchar(150)   NOT NULL CHECK (length(btrim(title)) >= 3),
  url                 web_url,
  demonstrated_level  proficiency    NOT NULL CHECK (demonstrated_level >= 1),
  status              varchar(10)    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  reviewed_by         uuid           REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  review_note         varchar(500),
  submitted_at        timestamptz    NOT NULL DEFAULT now(),
  -- a reviewed item must carry a review timestamp; a pending one must not
  CONSTRAINT chk_review_state CHECK ((status = 'pending') = (reviewed_at IS NULL)),
  -- something must back the claim: a link or a project
  CONSTRAINT chk_has_backing  CHECK (url IS NOT NULL OR project_id IS NOT NULL)
);

-- =====================================================================
-- Job market
-- =====================================================================
CREATE TABLE job_postings (
  job_id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id          integer      REFERENCES career_roles(role_id) ON DELETE SET NULL,
  mongo_source_id  char(24)     UNIQUE CHECK (mongo_source_id ~ '^[0-9a-f]{24}$'),  -- -> MongoDB job_sources._id
  title            varchar(150) NOT NULL,
  company          varchar(120) NOT NULL,
  location         varchar(120) NOT NULL,
  work_mode        varchar(10)  NOT NULL DEFAULT 'onsite' CHECK (work_mode IN ('onsite','remote','hybrid')),
  description      text         NOT NULL CHECK (length(description) >= 30),
  salary_min_lpa   numeric(5,1) CHECK (salary_min_lpa > 0),
  salary_max_lpa   numeric(5,1),
  posted_at        date         NOT NULL DEFAULT current_date,
  is_active        boolean      NOT NULL DEFAULT true,
  embedding        vector(384),
  search_tsv       tsvector GENERATED ALWAYS AS (
                     setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                     setweight(to_tsvector('english', coalesce(company,'')), 'B') ||
                     setweight(to_tsvector('english', coalesce(description,'')), 'C')) STORED,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT chk_salary_range CHECK (salary_max_lpa IS NULL OR salary_min_lpa IS NULL OR salary_max_lpa >= salary_min_lpa)
);

CREATE TABLE job_skills (
  job_id       uuid     NOT NULL REFERENCES job_postings(job_id) ON DELETE CASCADE,
  skill_id     integer  NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
  is_required  boolean  NOT NULL DEFAULT true,
  PRIMARY KEY (job_id, skill_id)
);

-- One snapshot row per (skill, role) per day; role_id NULL = market-wide
CREATE TABLE market_signals (
  signal_id      bigserial   PRIMARY KEY,
  skill_id       integer     NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  role_id        integer     REFERENCES career_roles(role_id) ON DELETE CASCADE,
  demand_score   unit_score  NOT NULL,
  posting_count  integer     NOT NULL CHECK (posting_count >= 0),
  snapshot_date  date        NOT NULL DEFAULT current_date,
  CONSTRAINT uq_signal UNIQUE NULLS NOT DISTINCT (skill_id, role_id, snapshot_date)
);

-- =====================================================================
-- Learn > Build > Prove roadmap
-- =====================================================================
CREATE TABLE roadmaps (
  roadmap_id    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  goal_id       uuid         NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
  version       integer      NOT NULL CHECK (version > 0),
  status        varchar(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','completed')),
  generated_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_roadmap_version UNIQUE (goal_id, version)
);

-- Weak entity: exists only inside a roadmap
CREATE TABLE roadmap_items (
  item_id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id       uuid         NOT NULL REFERENCES roadmaps(roadmap_id) ON DELETE CASCADE,
  skill_id         integer      NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
  phase            varchar(5)   NOT NULL CHECK (phase IN ('learn','build','prove')),
  sequence_no      smallint     NOT NULL CHECK (sequence_no > 0),
  priority_score   unit_score   NOT NULL,
  score_breakdown  jsonb        NOT NULL CHECK (jsonb_typeof(score_breakdown) = 'object'),
  rationale        text         NOT NULL,
  status           varchar(5)   NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  completed_at     timestamptz,
  CONSTRAINT uq_item_sequence UNIQUE (roadmap_id, sequence_no),
  CONSTRAINT uq_item_skill    UNIQUE (roadmap_id, skill_id),
  CONSTRAINT chk_done_time    CHECK ((status = 'done') = (completed_at IS NOT NULL))
);

-- =====================================================================
-- Configuration & audit
-- =====================================================================
-- Tunable weights of the 7-factor priority score (admin-editable)
CREATE TABLE scoring_weights (
  factor  varchar(20)   PRIMARY KEY CHECK (factor IN ('demand','relevance','gap','readiness','interest','evidence','ease')),
  weight  numeric(4,3)  NOT NULL CHECK (weight BETWEEN 0 AND 1),
  label   varchar(80)   NOT NULL
);

CREATE TABLE app_meta (
  key    varchar(40) PRIMARY KEY,
  value  text        NOT NULL
);

CREATE TABLE audit_log (
  audit_id    bigserial    PRIMARY KEY,
  table_name  varchar(40)  NOT NULL,
  operation   varchar(6)   NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  row_pk      text         NOT NULL,
  actor_id    uuid,                         -- taken from SET LOCAL app.user_id inside the API transaction
  old_data    jsonb,
  new_data    jsonb,
  changed_at  timestamptz  NOT NULL DEFAULT now()
);

-- =====================================================================
-- Indexes
-- =====================================================================
-- Business rules expressed as partial unique indexes
CREATE UNIQUE INDEX ux_goals_one_active    ON goals(user_id)    WHERE status = 'active';
CREATE UNIQUE INDEX ux_roadmaps_one_active ON roadmaps(goal_id) WHERE status = 'active';

-- Foreign-key / join indexes (PostgreSQL does not create these automatically)
CREATE INDEX ix_resumes_user         ON resumes(user_id, uploaded_at DESC);
CREATE INDEX ix_user_skills_skill    ON user_skills(skill_id);
CREATE INDEX ix_role_skills_skill    ON role_skills(skill_id);
CREATE INDEX ix_prereq_prereq        ON skill_prerequisites(prereq_skill_id);
CREATE INDEX ix_projects_user        ON projects(user_id);
CREATE INDEX ix_project_skills_skill ON project_skills(skill_id);
CREATE INDEX ix_evidence_user_skill  ON evidence(user_id, skill_id);
CREATE INDEX ix_job_postings_role    ON job_postings(role_id) WHERE is_active;
CREATE INDEX ix_job_skills_skill     ON job_skills(skill_id);
CREATE INDEX ix_signals_lookup       ON market_signals(skill_id, role_id, snapshot_date DESC);
CREATE INDEX ix_roadmap_items_road   ON roadmap_items(roadmap_id, sequence_no);
CREATE INDEX ix_audit_table_time     ON audit_log(table_name, changed_at DESC);

-- Partial index: the mentor review queue only ever scans pending rows
CREATE INDEX ix_evidence_pending ON evidence(submitted_at) WHERE status = 'pending';

-- Full-text search (GIN over generated tsvector columns)
CREATE INDEX ix_skills_fts ON skills       USING gin(search_tsv);
CREATE INDEX ix_jobs_fts   ON job_postings USING gin(search_tsv);

-- Trigram index: fuzzy "did you mean" skill lookup
CREATE INDEX ix_skills_name_trgm ON skills USING gin(name gin_trgm_ops);

-- Approximate nearest-neighbour indexes (HNSW, cosine distance)
CREATE INDEX ix_jobs_embedding     ON job_postings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ix_skills_embedding   ON skills       USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ix_profiles_embedding ON profiles     USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ix_roles_embedding    ON career_roles USING hnsw (embedding vector_cosine_ops);
