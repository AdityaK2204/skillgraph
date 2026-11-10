# Commits and pushes Abhay Bharadwaj's part of SkillGraph, one logical commit at a time.
# Run from the root of your clone of the repository, AFTER extracting abhay_part.zip into it.
$ErrorActionPreference = "Continue"   # git writes progress to stderr; exit codes are checked instead
if (-not (Test-Path .git)) { throw "Run this from the root of the cloned skillgraph folder" }
$name = git config user.name; $email = git config user.email
if (-not $name -or -not $email) { throw 'Set your identity first: git config user.name "Abhay Bharadwaj"  and  git config user.email "<email on your GitHub account>"' }
Write-Host "Committing as $name <$email>"
"abhay_commit.ps1`nabhay_commit.sh`nABHAY_README.txt" | Add-Content .git/info/exclude   # keep these helper files out of the repo
git pull --ff-only; if ($LASTEXITCODE) { throw "git pull failed: fix the problem above, then run the script again" }
function Commit-Part([string]$msg, [string[]]$paths) {
  git add -- $paths; if ($LASTEXITCODE) { throw "git add failed" }
  git commit -q -m $msg; if ($LASTEXITCODE) { throw "git commit failed" }
  Write-Host "  committed: $msg"
}
Commit-Part 'Authentication: bcrypt passwords, JWT sessions, role-based middleware, login and registration' @('app/api/auth/login/route.ts', 'app/api/auth/logout/route.ts', 'app/api/auth/me/route.ts', 'app/api/auth/register/route.ts', 'app/login/page.tsx', 'app/register/page.tsx', 'lib/auth.ts', 'lib/password.ts', 'lib/session.ts', 'middleware.ts')
Commit-Part 'MongoDB: collection validators, indexes, TTL and activity log' @('db/mongo/init.js', 'db/mongo/schema.json', 'lib/mongo.ts')
Commit-Part 'Resume intelligence: PDF/text parsing, MongoDB storage, atomic skill import' @('app/(app)/resume/page.tsx', 'app/api/resume/[id]/import/route.ts', 'app/api/resume/[id]/route.ts', 'app/api/resume/route.ts', 'lib/resume-parser.ts', 'samples/sample_resume_neha_joshi.pdf', 'samples/sample_resume_neha_joshi.txt')
Commit-Part 'Job ingestion pipeline and MongoDB aggregation pipelines' @('db/mongo/aggregations.js', 'lib/jobs.ts', 'lib/mongo-analytics.ts')
Commit-Part 'Neo4j skill graph: model, sync, Cypher queries and recursive-CTE fallback' @('app/(app)/graph/page.tsx', 'app/api/graph/route.ts', 'app/api/health/route.ts', 'db/neo4j/01_constraints.cypher', 'db/neo4j/02_queries.cypher', 'lib/graph.ts', 'lib/neo4j.ts', 'scripts/sync-graph.ts')
Commit-Part 'Mentor evidence review queue' @('app/(app)/mentor/page.tsx', 'app/api/mentor/evidence/[id]/route.ts', 'app/api/mentor/queue/route.ts')
Commit-Part 'Admin: analytics, users, skill catalogue, job ingestion, market signals, audit log' @('app/(app)/admin/audit/page.tsx', 'app/(app)/admin/catalog/page.tsx', 'app/(app)/admin/jobs/page.tsx', 'app/(app)/admin/page.tsx', 'app/(app)/admin/users/page.tsx', 'app/api/admin/analytics/route.ts', 'app/api/admin/audit/route.ts', 'app/api/admin/jobs/route.ts', 'app/api/admin/market/route.ts', 'app/api/admin/prerequisites/route.ts', 'app/api/admin/skills/[id]/route.ts', 'app/api/admin/skills/route.ts', 'app/api/admin/users/[id]/route.ts', 'app/api/admin/users/route.ts', 'app/api/admin/weights/route.ts')
Commit-Part 'API end-to-end test suite' @('tests/api.test.ts')
Commit-Part 'Documentation: project report, ER diagram, data dictionary, architecture, screenshots' @('docs/DATA_DICTIONARY.md', 'docs/REPORT.md', 'docs/SkillGraph_Project_Report.pdf', 'docs/architecture/architecture.dot', 'docs/architecture/architecture.png', 'docs/architecture/architecture.svg', 'docs/er/build_er.py', 'docs/er/er_diagram.dot', 'docs/er/er_diagram.pdf', 'docs/er/er_diagram.png', 'docs/er/er_diagram.svg', 'docs/screenshots/01_login.png', 'docs/screenshots/02_dashboard.png', 'docs/screenshots/03_profile.png', 'docs/screenshots/04_resume.png', 'docs/screenshots/05_skills.png', 'docs/screenshots/06_projects.png', 'docs/screenshots/07_evidence.png', 'docs/screenshots/08_gap.png', 'docs/screenshots/09_roadmap.png', 'docs/screenshots/10_graph.png', 'docs/screenshots/11_jobs_match.png', 'docs/screenshots/12_jobs_search.png', 'docs/screenshots/13_job_detail.png', 'docs/screenshots/14_mentor_queue.png', 'docs/screenshots/15_admin_analytics.png', 'docs/screenshots/16_admin_users.png', 'docs/screenshots/17_admin_catalog.png', 'docs/screenshots/18_admin_jobs.png', 'docs/screenshots/19_admin_audit.png', 'docs/screenshots/20_mobile_dark_roadmap.png', 'docs/test-results.txt', 'docs/tools/build_report.py', 'docs/tools/data_dictionary.py')
git push; if ($LASTEXITCODE) { throw "git push failed: sign in with your GitHub account and run: git push" }
$n = (git log --oneline --author="$name" | Measure-Object).Count
Write-Host "Done: $n commits by $name are on GitHub."
