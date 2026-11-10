SkillGraph: Abhay Bharadwaj's part (PES1UG24AM007)
===================================================

Aditya has already pushed his part (PostgreSQL, pgvector, student features,
database tests). Your part is MongoDB, Neo4j, authentication, resume parsing,
mentor and admin features, the API tests and the documentation. The project
only builds and runs once both parts are pushed.

You need: Git, and to have accepted Aditya's collaborator invite on GitHub.

1. Clone the repository:
     git clone https://github.com/AdityaK2204/skillgraph.git
     cd skillgraph

2. Set your Git identity for this repository (use the email on your GitHub
   account, otherwise the commits will not show on your profile):
     git config user.name "Abhay Bharadwaj"
     git config user.email "you@example.com"

3. Extract abhay_part.zip INTO the skillgraph folder (files land in app/, lib/,
   db/, docs/ ...; nothing of Aditya's is overwritten).

4. Run the script, which makes 9 separate commits in your name and pushes them:
     Windows (PowerShell):  powershell -ExecutionPolicy Bypass -File .\abhay_commit.ps1
     macOS / Linux:         ./abhay_commit.sh

   The commits it makes:
  1. Authentication: bcrypt passwords, JWT sessions, role-based middleware, login and registration (10 files)
  2. MongoDB: collection validators, indexes, TTL and activity log (3 files)
  3. Resume intelligence: PDF/text parsing, MongoDB storage, atomic skill import (7 files)
  4. Job ingestion pipeline and MongoDB aggregation pipelines (3 files)
  5. Neo4j skill graph: model, sync, Cypher queries and recursive-CTE fallback (8 files)
  6. Mentor evidence review queue (3 files)
  7. Admin: analytics, users, skill catalogue, job ingestion, market signals, audit log (15 files)
  8. API end-to-end test suite (1 files)
  9. Documentation: project report, ER diagram, data dictionary, architecture, screenshots (34 files)

5. Check on GitHub that the commits appear under your name. You can then delete
   abhay_commit.ps1, abhay_commit.sh and this file; they are not part of the repo.

If git asks you to sign in, sign in with your own GitHub account.
If "git pull" reports a conflict, someone pushed in between: run "git pull" again, then re-run the script.
