-- =====================================================================
-- SkillGraph · demo/01_ddl_alter_drop.sql
-- Demonstrates CREATE, ALTER and DROP on a live schema without harming data.
-- Run:  psql "$DATABASE_ADMIN_URL" -f db/postgres/demo/01_ddl_alter_drop.sql
-- Everything runs in one transaction and is rolled back at the end,
-- so the script can be shown repeatedly during the demo.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- CREATE: a table for learning resources linked to skills
CREATE TABLE learning_resources (
  resource_id  serial       PRIMARY KEY,
  skill_id     integer      NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  title        varchar(150) NOT NULL,
  url          web_url      NOT NULL,
  provider     varchar(60)
);

-- ALTER: add a column with a default and a CHECK constraint
ALTER TABLE learning_resources ADD COLUMN cost_inr numeric(8,2) NOT NULL DEFAULT 0;
ALTER TABLE learning_resources ADD CONSTRAINT chk_cost_non_negative CHECK (cost_inr >= 0);

-- ALTER: add a column, then change its type
ALTER TABLE learning_resources ADD COLUMN duration_hours smallint;
ALTER TABLE learning_resources ALTER COLUMN duration_hours TYPE numeric(5,1);

-- ALTER: rename a column and add a UNIQUE constraint
ALTER TABLE learning_resources RENAME COLUMN provider TO platform;
ALTER TABLE learning_resources ADD CONSTRAINT uq_resource_url UNIQUE (url);

-- CREATE INDEX on the new table
CREATE INDEX ix_resources_skill ON learning_resources(skill_id);

INSERT INTO learning_resources (skill_id, title, url, platform, cost_inr, duration_hours)
SELECT skill_id, 'Official PostgreSQL tutorial', 'https://www.postgresql.org/docs/current/tutorial.html', 'postgresql.org', 0, 6.5
FROM skills WHERE name = 'PostgreSQL';

-- the CHECK constraint rejects bad data (inside a savepoint so the demo continues)
SAVEPOINT bad_cost;
DO $$ BEGIN
  INSERT INTO learning_resources (skill_id, title, url, cost_inr)
  SELECT skill_id, 'Bad row', 'https://example.org/x', -10 FROM skills LIMIT 1;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Rejected by chk_cost_non_negative as expected';
END $$;
ROLLBACK TO bad_cost;

-- ALTER: drop a constraint and a column
ALTER TABLE learning_resources DROP CONSTRAINT uq_resource_url;
ALTER TABLE learning_resources DROP COLUMN duration_hours;

-- CREATE VIEW on top of it, then DROP in dependency order
CREATE VIEW v_free_resources AS
SELECT r.title, r.url, s.name AS skill FROM learning_resources r JOIN skills s USING (skill_id) WHERE r.cost_inr = 0;

SELECT * FROM v_free_resources;

DROP VIEW v_free_resources;
DROP INDEX ix_resources_skill;
DROP TABLE learning_resources;

-- ALTER on a core table: a column added and removed again
ALTER TABLE career_roles ADD COLUMN typical_salary_lpa numeric(5,1) CHECK (typical_salary_lpa > 0);
ALTER TABLE career_roles DROP COLUMN typical_salary_lpa;

ROLLBACK;   -- leave the real schema untouched
