#!/bin/bash
# =====================================================================
# SkillGraph · 04_app_role.sh
# Creates the least-privilege login role the web app uses.
# The application never connects as the superuser: it can read and write
# rows, but it cannot create, alter or drop objects.
# The password comes from the APP_DB_PASSWORD environment variable.
# =====================================================================
set -euo pipefail

psql -v ON_ERROR_STOP=1 -v app_password="${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE skillgraph_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skillgraph_app') \gexec

GRANT CONNECT ON DATABASE skillgraph TO skillgraph_app;
GRANT USAGE ON SCHEMA public TO skillgraph_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO skillgraph_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO skillgraph_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO skillgraph_app;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO skillgraph_app;

-- the audit trail is append-only for the application
REVOKE UPDATE, DELETE ON audit_log FROM skillgraph_app;

-- the procedure refreshes a materialized view, which requires ownership;
-- it runs with its owner's rights instead of granting ownership to the app
ALTER PROCEDURE refresh_market_signals() SECURITY DEFINER SET search_path = public;
SQL
echo "skillgraph_app role ready"
