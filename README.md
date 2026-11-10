# SkillGraph

**Personal career intelligence and skill-development engine** · DBMS Experiential Learning, Level 3

Aditya Kalloli (PES1UG24AM015) · Abhay Bharadwaj (PES1UG24AM007)

SkillGraph answers a question resume checkers don't: *what should this particular person learn next, why does it matter for their target role, and how can they prove it?* It combines a user's resume, goal, claimed skills, projects and verified evidence with role requirements and job-market data. From that it ranks every missing skill with an explainable 7-factor score and produces a versioned **Learn → Build → Prove** roadmap.

| Layer | Technology | Holds |
|---|---|---|
| Transactional core | PostgreSQL 16 | users, profiles, goals, skills, roles, evidence, projects, jobs, roadmaps (20 tables) |
| Vector search | pgvector (HNSW, cosine) | 384-d embeddings of profiles, skills, roles, job postings |
| Documents | MongoDB 7 | parsed resumes, raw job-source records, activity log |
| Graph | Neo4j 5 | skill prerequisite graph, role requirements, evidence paths |
| Application | Next.js 15 (App Router, route handlers) | UI and API layer, JWT auth, three roles |

The full project report is in [`docs/SkillGraph_Project_Report.pdf`](docs/SkillGraph_Project_Report.pdf) (source: [`docs/REPORT.md`](docs/REPORT.md)).

---

## Quick start (Docker)

Requirements: **Node.js 20.9+**, **Docker Desktop** (or Docker Engine with Compose v2).

```bash
# 1. configuration (never commit .env)
cp .env.example .env
#    edit .env: set every password, and a JWT_SECRET of 32+ random characters:
#    node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    DATABASE_URL / DATABASE_ADMIN_URL / MONGODB_URI must use the same passwords.

# 2. databases (PostgreSQL schema, MongoDB collections and app users are created on first start)
docker compose up -d
docker compose ps          # wait until all three are "healthy" (Neo4j takes ~30 s)

# 3. app dependencies, demo data, graph projection
npm install
npm run setup              # = db:init (checks schema) + seed + graph:sync

# 4. run
npm run dev                # http://localhost:3000
```

The first `npm run seed` downloads the MiniLM embedding model (~23 MB) from Hugging Face into `./models`. To work fully offline, set `EMBEDDING_PROVIDER=hash` in `.env`. After switching providers, run `npm run embed` to recompute every vector.

### Demo accounts

All use the password in `SEED_DEMO_PASSWORD` (default `Demo@12345`). All people and companies in the demo data are fictional.

| Role | Email | Try |
|---|---|---|
| Student | `aarav.mehta@skillgraph.dev` | Data Analyst goal, partly completed roadmap |
| Student | `riya.nair@skillgraph.dev`, `kabir.singh@…`, `ananya.rao@…`, `dev.patel@…`, `sneha.kulkarni@…`, `arjun.das@…` | other roles |
| Mentor | `mentor@skillgraph.dev` | review queue: verify / reject evidence |
| Admin | `admin@skillgraph.dev` | analytics, users, skill catalogue, job ingestion, audit log |

Sample resumes to upload are in [`samples/`](samples) (PDF and TXT).

### Without Docker

Install PostgreSQL 16 with the pgvector extension, MongoDB 7 and (optionally) Neo4j 5. Point the URLs in `.env` at them, then run:

```bash
npm install
npm run db:init            # applies db/postgres/01-03 + app role, and db/mongo/schema.json
npm run seed
npm run graph:sync         # optional: skipped with a warning if Neo4j is not running
npm run dev
```

If Neo4j is unavailable, every graph feature falls back to PostgreSQL recursive CTEs. The UI shows which engine answered.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build && npm start` | development / production server on port 3000 |
| `npm run db:init [-- --reset]` | create (or rebuild) the PostgreSQL schema and app role; apply MongoDB validators and indexes |
| `npm run seed` | load demo users, 35 job postings, resumes, evidence and roadmaps (replaces earlier demo data) |
| `npm run graph:sync` | apply Neo4j constraints and project the catalogue and users into the graph |
| `npm run embed` | recompute all embeddings with the current `EMBEDDING_PROVIDER` |
| `npm test` | 25 database tests + 25 API end-to-end tests (the API tests need the app running) |
| `npm run typecheck` | TypeScript check |

Database demonstrations for the viva (each runs in a transaction and is rolled back unless noted):

```bash
psql "$DATABASE_ADMIN_URL" -f db/postgres/demo/01_ddl_alter_drop.sql     # CREATE / ALTER / DROP
psql "$DATABASE_ADMIN_URL" -f db/postgres/demo/02_important_queries.sql  # 15 queries: joins, GROUP BY/HAVING, subqueries, CTE, window, FTS, vector
psql "$DATABASE_ADMIN_URL" -f db/postgres/demo/03_transactions_dml.sql   # INSERT/UPDATE/DELETE, SAVEPOINT, triggers, ROLLBACK
docker exec skillgraph-mongo mongosh -u root -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin skillgraph /scripts/aggregations.js
# Neo4j Browser: http://localhost:7474 , paste queries from db/neo4j/02_queries.cypher
```

---

## Project structure

```
app/                     Next.js App Router
  (app)/…                pages: dashboard, profile, resume, skills, projects, evidence,
                         gap, roadmap, graph, jobs, mentor, admin/*
  api/…                  route handlers (the only code that talks to the databases)
  login/, register/
components/              Shell (navigation), UI primitives, SkillPicker
lib/                     db (pg pool, transactions), mongo, neo4j, graph, auth/session,
                         embeddings, resume-parser, jobs (ingestion), validation (zod)
middleware.ts            session + role gates for pages and APIs
db/postgres/             01_schema.sql · 02_logic.sql · 03_seed_catalog.sql · 04_app_role.sh
db/postgres/demo/        DDL, queries and transaction demonstrations
db/mongo/                schema.json (validators + indexes) · init.js · aggregations.js
db/neo4j/                01_constraints.cypher · 02_queries.cypher
scripts/                 db-init, seed, sync-graph, reembed (+ demo data)
tests/                   db.test.ts · api.test.ts
docs/                    report, ER diagram, data dictionary, architecture, screenshots
samples/                 sample resumes
```

---

## Security notes

- Passwords are hashed with bcrypt (cost 12). A CHECK constraint rejects anything that is not a bcrypt hash.
- Sessions are HS256 JWTs in `httpOnly`, `SameSite=Lax` cookies (`Secure` in production). The role is re-read from the database on every API call, so role changes and deactivations take effect immediately.
- Three roles (student, mentor, admin) are enforced in the middleware, in every route handler, and inside the database: triggers decide who may review evidence.
- The app connects as `skillgraph_app`, which has DML rights only (no DDL) and cannot modify `audit_log`.
- All SQL is parameterised. Inputs are validated with zod in the API and again by database constraints.
- All credentials come from environment variables. `.env` is git-ignored. Databases bind to `127.0.0.1` only.

## Team

| Member | SRN | Responsibilities |
|---|---|---|
| Aditya Kalloli | PES1UG24AM015 | PostgreSQL schema, constraints, functions, triggers, procedure, pgvector; embeddings; gap, roadmap, jobs, skills, projects, evidence, profile and dashboard (APIs and pages); seed data; database tests; SQL demo scripts |
| Abhay Bharadwaj | PES1UG24AM007 | MongoDB (validators, resume storage, job ingestion, aggregations); Neo4j model, sync and Cypher with recursive-CTE fallback; authentication, RBAC and middleware; resume parsing and upload; mentor and admin (APIs and pages); skill-graph page; API end-to-end tests; documentation and report |

Each member committed their own work from their own Git identity, so the commit history shows the split.
