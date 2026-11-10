# Data dictionary

_Generated from the PostgreSQL catalogue by `docs/tools/data_dictionary.py`. Key: PK primary key, FK foreign key, UK unique, NN not null, GEN generated column._

## app_meta

Key/value metadata (schema version, embedding model, last market refresh).

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `key` | character varying(40) | PK | NN |  |
| `value` | text |  | NN |  |

## audit_log

Append-only change history written by triggers.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `audit_id` | bigint | PK | NN | nextval('audit_log_audit_id_seq'::regclass) |
| `table_name` | character varying(40) |  | NN |  |
| `operation` | character varying(6) |  | NN |  |
| `row_pk` | text |  | NN |  |
| `actor_id` | uuid |  | yes |  |
| `old_data` | jsonb |  | yes |  |
| `new_data` | jsonb |  | yes |  |
| `changed_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `audit_log_operation_check`: `CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))`

## career_roles

Catalogue of target roles.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `role_id` | integer | PK | NN | nextval('career_roles_role_id_seq'::regclass) |
| `title` | character varying(100) | UK | NN |  |
| `domain` | character varying(60) |  | NN |  |
| `seniority` | character varying(10) |  | NN | 'junior'::character varying |
| `description` | text |  | NN |  |
| `neo4j_node_id` | character varying(64) |  | yes |  |
| `embedding` | vector(384) |  | yes |  |
| `created_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `career_roles_seniority_check`: `CHECK (((seniority)::text = ANY ((ARRAY['intern'::character varying, 'junior'::character varying, 'mid'::character varying, 'senior'::character varying])::text[])))`

## evidence

Proof of a skill, reviewed by a mentor.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `evidence_id` | uuid | PK | NN | gen_random_uuid() |
| `user_id` | uuid | FK | NN | → users.user_id |
| `skill_id` | integer | FK | NN | → skills.skill_id |
| `project_id` | uuid | FK | yes | → projects.project_id |
| `kind` | evidence_kind |  | NN |  |
| `title` | character varying(150) |  | NN |  |
| `url` | web_url |  | yes |  |
| `demonstrated_level` | proficiency |  | NN |  |
| `status` | character varying(10) |  | NN | 'pending'::character varying |
| `reviewed_by` | uuid | FK | yes | → users.user_id |
| `reviewed_at` | timestamp with time zone |  | yes |  |
| `review_note` | character varying(500) |  | yes |  |
| `submitted_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `chk_has_backing`: `CHECK (((url IS NOT NULL) OR (project_id IS NOT NULL)))`
- `chk_review_state`: `CHECK ((((status)::text = 'pending'::text) = (reviewed_at IS NULL)))`
- `evidence_demonstrated_level_check`: `CHECK (((demonstrated_level)::smallint >= 1))`
- `evidence_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'rejected'::character varying])::text[])))`
- `evidence_title_check`: `CHECK ((length(btrim((title)::text)) >= 3))`
- `evidence_project_id_fkey`: `FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL`
- `evidence_reviewed_by_fkey`: `FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL`
- `evidence_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE RESTRICT`
- `evidence_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## goals

Target career role chosen by a user (one active at a time).

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `goal_id` | uuid | PK | NN | gen_random_uuid() |
| `user_id` | uuid | FK | NN | → users.user_id |
| `role_id` | integer | FK | NN | → career_roles.role_id |
| `target_date` | date |  | yes |  |
| `status` | character varying(10) |  | NN | 'active'::character varying |
| `created_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `goals_status_check`: `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'achieved'::character varying, 'dropped'::character varying])::text[])))`
- `goals_target_date_check`: `CHECK ((target_date >= '2024-01-01'::date))`
- `goals_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES career_roles(role_id) ON DELETE RESTRICT`
- `goals_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## job_postings

Normalised job postings (raw form in MongoDB).

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `job_id` | uuid | PK | NN | gen_random_uuid() |
| `role_id` | integer | FK | yes | → career_roles.role_id |
| `mongo_source_id` | character(24) | UK | yes |  |
| `title` | character varying(150) |  | NN |  |
| `company` | character varying(120) |  | NN |  |
| `location` | character varying(120) |  | NN |  |
| `work_mode` | character varying(10) |  | NN | 'onsite'::character varying |
| `description` | text |  | NN |  |
| `salary_min_lpa` | numeric(5,1) |  | yes |  |
| `salary_max_lpa` | numeric(5,1) |  | yes |  |
| `posted_at` | date |  | NN | CURRENT_DATE |
| `is_active` | boolean |  | NN | true |
| `embedding` | vector(384) |  | yes |  |
| `search_tsv` | tsvector |  | yes | GEN (tsvector) |
| `created_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `chk_salary_range`: `CHECK (((salary_max_lpa IS NULL) OR (salary_min_lpa IS NULL) OR (salary_max_lpa >= salary_min_lpa)))`
- `job_postings_description_check`: `CHECK ((length(description) >= 30))`
- `job_postings_mongo_source_id_check`: `CHECK ((mongo_source_id ~ '^[0-9a-f]{24}$'::text))`
- `job_postings_salary_min_lpa_check`: `CHECK ((salary_min_lpa > (0)::numeric))`
- `job_postings_work_mode_check`: `CHECK (((work_mode)::text = ANY ((ARRAY['onsite'::character varying, 'remote'::character varying, 'hybrid'::character varying])::text[])))`
- `job_postings_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES career_roles(role_id) ON DELETE SET NULL`

## job_skills

M:N: skills a posting asks for.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `job_id` | uuid | FK, PK | NN | → job_postings.job_id |
| `skill_id` | integer | FK, PK | NN | → skills.skill_id |
| `is_required` | boolean |  | NN | true |

**Constraints**

- `job_skills_job_id_fkey`: `FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE`
- `job_skills_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE RESTRICT`

## market_signals

Daily demand snapshot per skill and role.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `signal_id` | bigint | PK | NN | nextval('market_signals_signal_id_seq'::regclass) |
| `skill_id` | integer | FK, UK | NN | → skills.skill_id |
| `role_id` | integer | FK, UK | yes | → career_roles.role_id |
| `demand_score` | unit_score |  | NN |  |
| `posting_count` | integer |  | NN |  |
| `snapshot_date` | date | UK | NN | CURRENT_DATE |

**Constraints**

- `market_signals_posting_count_check`: `CHECK ((posting_count >= 0))`
- `market_signals_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES career_roles(role_id) ON DELETE CASCADE`
- `market_signals_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE`

## profiles

Personal profile, 1:1 with users; holds the profile embedding.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `profile_id` | uuid | PK | NN | gen_random_uuid() |
| `user_id` | uuid | FK, UK | NN | → users.user_id |
| `full_name` | character varying(120) |  | NN |  |
| `education_level` | character varying(30) |  | yes |  |
| `institution` | character varying(150) |  | yes |  |
| `graduation_year` | smallint |  | yes |  |
| `interests` | text[] |  | NN | '{}'::text[] |
| `bio` | text |  | yes |  |
| `weekly_hours` | smallint |  | NN | 8 |
| `embedding` | vector(384) |  | yes |  |
| `updated_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `profiles_bio_check`: `CHECK ((length(bio) <= 1000))`
- `profiles_education_level_check`: `CHECK (((education_level)::text = ANY ((ARRAY['high_school'::character varying, 'diploma'::character varying, 'bachelors'::character varying, 'masters'::character varying, 'phd'::character varying, 'other'::character varying])::text[])))`
- `profiles_full_name_check`: `CHECK ((length(btrim((full_name)::text)) >= 2))`
- `profiles_graduation_year_check`: `CHECK (((graduation_year >= 1980) AND (graduation_year <= 2040)))`
- `profiles_interests_check`: `CHECK ((cardinality(interests) <= 15))`
- `profiles_weekly_hours_check`: `CHECK (((weekly_hours >= 1) AND (weekly_hours <= 80)))`
- `profiles_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## project_skills

M:N: skills used in a project.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `project_id` | uuid | FK, PK | NN | → projects.project_id |
| `skill_id` | integer | FK, PK | NN | → skills.skill_id |

**Constraints**

- `project_skills_project_id_fkey`: `FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE`
- `project_skills_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE RESTRICT`

## projects

Projects a user has built.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `project_id` | uuid | PK | NN | gen_random_uuid() |
| `user_id` | uuid | FK | NN | → users.user_id |
| `title` | character varying(120) |  | NN |  |
| `description` | text |  | yes |  |
| `repo_url` | web_url |  | yes |  |
| `started_on` | date |  | yes |  |
| `completed_on` | date |  | yes |  |
| `created_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `chk_project_dates`: `CHECK (((completed_on IS NULL) OR (started_on IS NULL) OR (completed_on >= started_on)))`
- `projects_description_check`: `CHECK ((length(description) <= 2000))`
- `projects_title_check`: `CHECK ((length(btrim((title)::text)) >= 3))`
- `projects_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## resumes

Pointer to a parsed resume document in MongoDB.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `resume_id` | uuid | PK | NN | gen_random_uuid() |
| `user_id` | uuid | FK | NN | → users.user_id |
| `mongo_doc_id` | character(24) | UK | NN |  |
| `file_name` | character varying(255) |  | NN |  |
| `file_size_bytes` | integer |  | NN |  |
| `parse_status` | character varying(10) |  | NN | 'pending'::character varying |
| `skills_detected` | smallint |  | NN | 0 |
| `uploaded_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `resumes_file_size_bytes_check`: `CHECK (((file_size_bytes >= 1) AND (file_size_bytes <= 5242880)))`
- `resumes_mongo_doc_id_check`: `CHECK ((mongo_doc_id ~ '^[0-9a-f]{24}$'::text))`
- `resumes_parse_status_check`: `CHECK (((parse_status)::text = ANY ((ARRAY['pending'::character varying, 'parsed'::character varying, 'failed'::character varying])::text[])))`
- `resumes_skills_detected_check`: `CHECK ((skills_detected >= 0))`
- `resumes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## roadmap_items

Weak entity: ordered, scored items of a roadmap.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `item_id` | uuid | PK | NN | gen_random_uuid() |
| `roadmap_id` | uuid | FK, UK | NN | → roadmaps.roadmap_id |
| `skill_id` | integer | FK, UK | NN | → skills.skill_id |
| `phase` | character varying(5) |  | NN |  |
| `sequence_no` | smallint | UK | NN |  |
| `priority_score` | unit_score |  | NN |  |
| `score_breakdown` | jsonb |  | NN |  |
| `rationale` | text |  | NN |  |
| `status` | character varying(5) |  | NN | 'todo'::character varying |
| `completed_at` | timestamp with time zone |  | yes |  |

**Constraints**

- `chk_done_time`: `CHECK ((((status)::text = 'done'::text) = (completed_at IS NOT NULL)))`
- `roadmap_items_phase_check`: `CHECK (((phase)::text = ANY ((ARRAY['learn'::character varying, 'build'::character varying, 'prove'::character varying])::text[])))`
- `roadmap_items_score_breakdown_check`: `CHECK ((jsonb_typeof(score_breakdown) = 'object'::text))`
- `roadmap_items_sequence_no_check`: `CHECK ((sequence_no > 0))`
- `roadmap_items_status_check`: `CHECK (((status)::text = ANY ((ARRAY['todo'::character varying, 'doing'::character varying, 'done'::character varying])::text[])))`
- `roadmap_items_roadmap_id_fkey`: `FOREIGN KEY (roadmap_id) REFERENCES roadmaps(roadmap_id) ON DELETE CASCADE`
- `roadmap_items_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE RESTRICT`

## roadmaps

Versioned Learn > Build > Prove plan for a goal.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `roadmap_id` | uuid | PK | NN | gen_random_uuid() |
| `user_id` | uuid | FK | NN | → users.user_id |
| `goal_id` | uuid | FK, UK | NN | → goals.goal_id |
| `version` | integer | UK | NN |  |
| `status` | character varying(10) |  | NN | 'active'::character varying |
| `generated_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `roadmaps_status_check`: `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying, 'completed'::character varying])::text[])))`
- `roadmaps_version_check`: `CHECK ((version > 0))`
- `roadmaps_goal_id_fkey`: `FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE CASCADE`
- `roadmaps_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## role_skills

M:N: skills a role requires, with level and importance.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `role_id` | integer | FK, PK | NN | → career_roles.role_id |
| `skill_id` | integer | FK, PK | NN | → skills.skill_id |
| `required_level` | proficiency |  | NN |  |
| `importance` | numeric(3,2) |  | NN |  |

**Constraints**

- `role_skills_importance_check`: `CHECK (((importance >= 0.05) AND (importance <= (1)::numeric)))`
- `role_skills_required_level_check`: `CHECK (((required_level)::smallint >= 1))`
- `role_skills_role_id_fkey`: `FOREIGN KEY (role_id) REFERENCES career_roles(role_id) ON DELETE CASCADE`
- `role_skills_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE RESTRICT`

## scoring_weights

Admin-tunable weights of the 7 priority factors.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `factor` | character varying(20) | PK | NN |  |
| `weight` | numeric(4,3) |  | NN |  |
| `label` | character varying(80) |  | NN |  |

**Constraints**

- `scoring_weights_factor_check`: `CHECK (((factor)::text = ANY ((ARRAY['demand'::character varying, 'relevance'::character varying, 'gap'::character varying, 'readiness'::character varying, 'interest'::character varying, 'evidence'::character varying, 'ease'::character varying])::text[])))`
- `scoring_weights_weight_check`: `CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)))`

## skill_prerequisites

Recursive M:N: skill requires prerequisite skill (kept acyclic by trigger).

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `skill_id` | integer | FK, PK | NN | → skills.skill_id |
| `prereq_skill_id` | integer | FK, PK | NN | → skills.skill_id |
| `strength` | numeric(3,2) |  | NN | 1.00 |

**Constraints**

- `chk_no_self_prereq`: `CHECK ((skill_id <> prereq_skill_id))`
- `skill_prerequisites_strength_check`: `CHECK (((strength > (0)::numeric) AND (strength <= (1)::numeric)))`
- `skill_prerequisites_prereq_skill_id_fkey`: `FOREIGN KEY (prereq_skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE`
- `skill_prerequisites_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE`

## skills

Skill catalogue with aliases, effort, FTS vector and embedding.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `skill_id` | integer | PK | NN | nextval('skills_skill_id_seq'::regclass) |
| `name` | character varying(80) | UK | NN |  |
| `category` | character varying(30) |  | NN |  |
| `description` | text |  | NN |  |
| `aliases` | text[] |  | NN | '{}'::text[] |
| `effort_hours` | smallint |  | NN |  |
| `neo4j_node_id` | character varying(64) |  | yes |  |
| `embedding` | vector(384) |  | yes |  |
| `search_tsv` | tsvector |  | yes | GEN (tsvector) |
| `created_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `skills_category_check`: `CHECK (((category)::text = ANY ((ARRAY['language'::character varying, 'frontend'::character varying, 'backend'::character varying, 'data'::character varying, 'ml'::character varying, 'devops'::character varying, 'cloud'::character varying, 'database'::character varying, 'foundation'::character varying, 'soft'::character varying])::text[])))`
- `skills_description_check`: `CHECK ((length(description) >= 10))`
- `skills_effort_hours_check`: `CHECK (((effort_hours >= 1) AND (effort_hours <= 400)))`

## user_skills

M:N: skills a user claims; verified level is derived from evidence.

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `user_id` | uuid | FK, PK | NN | → users.user_id |
| `skill_id` | integer | FK, PK | NN | → skills.skill_id |
| `claimed_level` | proficiency |  | NN |  |
| `verified_level` | proficiency |  | NN | 0 |
| `source` | character varying(10) |  | NN | 'self'::character varying |
| `updated_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `user_skills_claimed_level_check`: `CHECK (((claimed_level)::smallint >= 1))`
- `user_skills_source_check`: `CHECK (((source)::text = ANY ((ARRAY['self'::character varying, 'resume'::character varying, 'evidence'::character varying])::text[])))`
- `user_skills_skill_id_fkey`: `FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE RESTRICT`
- `user_skills_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE`

## users

Login identity and role (RBAC).

| Column | Type | Keys | Null | Default / notes |
|---|---|---|---|---|
| `user_id` | uuid | PK | NN | gen_random_uuid() |
| `email` | email_address | UK | NN |  |
| `password_hash` | text |  | NN |  |
| `role` | user_role |  | NN | 'student'::user_role |
| `is_active` | boolean |  | NN | true |
| `last_login_at` | timestamp with time zone |  | yes |  |
| `created_at` | timestamp with time zone |  | NN | now() |
| `updated_at` | timestamp with time zone |  | NN | now() |

**Constraints**

- `users_password_hash_check`: `CHECK ((password_hash ~ '^\$2[aby]\$\d{2}\$.{53}$'::text))`
