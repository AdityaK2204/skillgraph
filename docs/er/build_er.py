"""Generate the SkillGraph ER diagram as Graphviz DOT (crow's-foot) and render to PDF/PNG."""
import subprocess, sys, html

OUT = sys.argv[1] if len(sys.argv) > 1 else "er_gv"

# store colours
PG, MONGO, NEO, VEC = "#2f6db5", "#2f8a57", "#b5532f", "#7a4fb0"

# entity: (header colour, [(name, type, key, note, note_store)])
E = {
 "USERS": ("#dbe6f4", [
   ("user_id","uuid","PK","",None),("email","email_address","UK","citext + regex domain",None),
   ("password_hash","text","","bcrypt only (CHECK)",None),("role","user_role","","enum: student/mentor/admin",None),
   ("is_active","boolean","","",None),("last_login_at","timestamptz","","",None),
   ("created_at","timestamptz","","",None),("updated_at","timestamptz","","trigger",None)]),
 "PROFILES": ("#dbe6f4", [
   ("profile_id","uuid","PK","",None),("user_id","uuid","FK, UK","1:1 with USERS",None),
   ("full_name","varchar(120)","","",None),("education_level","varchar(30)","","CHECK list",None),
   ("institution","varchar(150)","","",None),("graduation_year","smallint","","1980-2040",None),
   ("interests","text[]","","max 15",None),("bio","text","","",None),("weekly_hours","smallint","","1-80",None),
   ("embedding","vector(384)","","pgvector",VEC),("updated_at","timestamptz","","",None)]),
 "RESUMES": ("#dbe6f4", [
   ("resume_id","uuid","PK","",None),("user_id","uuid","FK","",None),
   ("mongo_doc_id","char(24)","UK","-> MongoDB resumes_raw",MONGO),("file_name","varchar(255)","","",None),
   ("file_size_bytes","integer","","1 B - 5 MB",None),("parse_status","varchar(10)","","pending/parsed/failed",None),
   ("skills_detected","smallint","","",None),("uploaded_at","timestamptz","","",None)]),
 "GOALS": ("#dbe6f4", [
   ("goal_id","uuid","PK","",None),("user_id","uuid","FK","",None),("role_id","integer","FK","",None),
   ("target_date","date","","",None),("status","varchar(10)","","1 active per user",None),("created_at","timestamptz","","",None)]),
 "CAREER_ROLES": ("#e3ecdf", [
   ("role_id","serial","PK","",None),("title","varchar(100)","UK","",None),("domain","varchar(60)","","",None),
   ("seniority","varchar(10)","","",None),("description","text","","",None),
   ("neo4j_node_id","varchar(64)","","-> Neo4j :Role",NEO),("embedding","vector(384)","","pgvector",VEC)]),
 "SKILLS": ("#e3ecdf", [
   ("skill_id","serial","PK","",None),("name","varchar(80)","UK","",None),("category","varchar(30)","","CHECK list",None),
   ("description","text","","",None),("aliases","text[]","","resume matching",None),("effort_hours","smallint","","1-400",None),
   ("neo4j_node_id","varchar(64)","","-> Neo4j :Skill",NEO),("embedding","vector(384)","","pgvector",VEC),
   ("search_tsv","tsvector","","generated, GIN",None)]),
 "SKILL_PREREQUISITES": ("#e3ecdf", [
   ("skill_id","integer","PK, FK","",None),("prereq_skill_id","integer","PK, FK","self-ref, no cycles",None),
   ("strength","numeric(3,2)","","0-1",None)]),
 "USER_SKILLS": ("#e3ecdf", [
   ("user_id","uuid","PK, FK","",None),("skill_id","integer","PK, FK","",None),
   ("claimed_level","proficiency","","1-5 (claim)",None),("verified_level","proficiency","","0-5, from evidence",None),
   ("source","varchar(10)","","self/resume/evidence",None),("updated_at","timestamptz","","",None)]),
 "ROLE_SKILLS": ("#e3ecdf", [
   ("role_id","integer","PK, FK","",None),("skill_id","integer","PK, FK","",None),
   ("required_level","proficiency","","1-5",None),("importance","numeric(3,2)","","0.05-1",None)]),
 "PROJECTS": ("#f2e6da", [
   ("project_id","uuid","PK","",None),("user_id","uuid","FK","",None),("title","varchar(120)","","",None),
   ("description","text","","",None),("repo_url","web_url","","http(s) domain",None),
   ("started_on","date","","",None),("completed_on","date","",">= started_on",None)]),
 "PROJECT_SKILLS": ("#f2e6da", [
   ("project_id","uuid","PK, FK","",None),("skill_id","integer","PK, FK","",None)]),
 "EVIDENCE": ("#f2e6da", [
   ("evidence_id","uuid","PK","",None),("user_id","uuid","FK","",None),("skill_id","integer","FK","",None),
   ("project_id","uuid","FK","nullable, same owner",None),("kind","evidence_kind","","enum",None),
   ("title","varchar(150)","","",None),("url","web_url","","link or project",None),
   ("demonstrated_level","proficiency","","1-5",None),("status","varchar(10)","","pending/verified/rejected",None),
   ("reviewed_by","uuid","FK","mentor/admin, not owner",None),("reviewed_at","timestamptz","","",None),
   ("review_note","varchar(500)","","",None),("submitted_at","timestamptz","","",None)]),
 "JOB_POSTINGS": ("#ece2f2", [
   ("job_id","uuid","PK","",None),("role_id","integer","FK","nullable",None),
   ("mongo_source_id","char(24)","UK","-> MongoDB job_sources",MONGO),("title","varchar(150)","","",None),
   ("company","varchar(120)","","",None),("location","varchar(120)","","",None),("work_mode","varchar(10)","","",None),
   ("description","text","","",None),("salary_min_lpa","numeric(5,1)","","",None),("salary_max_lpa","numeric(5,1)","",">= min",None),
   ("posted_at","date","","",None),("is_active","boolean","","",None),
   ("embedding","vector(384)","","pgvector",VEC),("search_tsv","tsvector","","generated, GIN",None)]),
 "JOB_SKILLS": ("#ece2f2", [
   ("job_id","uuid","PK, FK","",None),("skill_id","integer","PK, FK","",None),("is_required","boolean","","",None)]),
 "MARKET_SIGNALS": ("#ece2f2", [
   ("signal_id","bigserial","PK","",None),("skill_id","integer","FK","",None),("role_id","integer","FK","NULL = market-wide",None),
   ("demand_score","unit_score","","0-1",None),("posting_count","integer","","",None),("snapshot_date","date","","UK with skill, role",None)]),
 "ROADMAPS": ("#f4ecd0", [
   ("roadmap_id","uuid","PK","",None),("user_id","uuid","FK","",None),("goal_id","uuid","FK","",None),
   ("version","integer","","UK with goal",None),("status","varchar(10)","","1 active per goal",None),("generated_at","timestamptz","","",None)]),
 "ROADMAP_ITEMS": ("#f4ecd0", [
   ("item_id","uuid","PK","",None),("roadmap_id","uuid","FK","",None),("skill_id","integer","FK","",None),
   ("phase","varchar(5)","","learn/build/prove",None),("sequence_no","smallint","","UK with roadmap",None),
   ("priority_score","unit_score","","",None),("score_breakdown","jsonb","","7 factors + weights",None),
   ("rationale","text","","why it matters",None),("status","varchar(5)","","todo/doing/done",None),("completed_at","timestamptz","","trigger",None)]),
 "SCORING_WEIGHTS": ("#e6e8eb", [
   ("factor","varchar(20)","PK","7 factors",None),("weight","numeric(4,3)","","0-1",None),("label","varchar(80)","","",None)]),
 "AUDIT_LOG": ("#e6e8eb", [
   ("audit_id","bigserial","PK","",None),("table_name","varchar(40)","","",None),("operation","varchar(6)","","",None),
   ("row_pk","text","","",None),("actor_id","uuid","","app.user_id (logical)",None),
   ("old_data","jsonb","","",None),("new_data","jsonb","","",None),("changed_at","timestamptz","","",None)]),
 "APP_META": ("#e6e8eb", [
   ("key","varchar(40)","PK","",None),("value","text","","",None)]),
}

CLUSTERS = [
  ("Identity & profile", ["USERS","PROFILES","RESUMES","GOALS"]),
  ("Skill knowledge (mirrored in Neo4j)", ["CAREER_ROLES","SKILLS","SKILL_PREREQUISITES","USER_SKILLS","ROLE_SKILLS"]),
  ("Projects & evidence", ["PROJECTS","PROJECT_SKILLS","EVIDENCE"]),
  ("Job market", ["JOB_POSTINGS","JOB_SKILLS","MARKET_SIGNALS"]),
  ("Learn > Build > Prove roadmap", ["ROADMAPS","ROADMAP_ITEMS"]),
  ("Configuration & audit (no FKs by design)", ["SCORING_WEIGHTS","AUDIT_LOG","APP_META"]),
]

# crow's-foot ends: (tail end at parent, head end at child)
ONE, ZERO_ONE, MANY, ONE_MANY = "teetee", "teeodot", "crowodot", "crowtee"
R = [
 ("USERS","PROFILES",ONE,ONE,"has"),
 ("USERS","RESUMES",ONE,MANY,"uploads"),
 ("USERS","GOALS",ONE,MANY,"sets"),
 ("CAREER_ROLES","GOALS",ONE,MANY,"targeted by"),
 ("USERS","USER_SKILLS",ONE,MANY,"claims"),
 ("SKILLS","USER_SKILLS",ONE,MANY,"held as"),
 ("SKILLS","SKILL_PREREQUISITES",ONE,MANY,"requires"),
 ("SKILLS","SKILL_PREREQUISITES",ONE,MANY,"unlocks"),
 ("CAREER_ROLES","ROLE_SKILLS",ONE,MANY,"requires"),
 ("SKILLS","ROLE_SKILLS",ONE,MANY,"needed for"),
 ("USERS","PROJECTS",ONE,MANY,"builds"),
 ("PROJECTS","PROJECT_SKILLS",ONE,MANY,"uses"),
 ("SKILLS","PROJECT_SKILLS",ONE,MANY,"applied in"),
 ("USERS","EVIDENCE",ONE,MANY,"submits"),
 ("SKILLS","EVIDENCE",ONE,MANY,"proven by"),
 ("PROJECTS","EVIDENCE",ZERO_ONE,MANY,"backs"),
 ("CAREER_ROLES","JOB_POSTINGS",ONE,MANY,"classifies"),
 ("JOB_POSTINGS","JOB_SKILLS",ONE,ONE_MANY,"lists"),
 ("SKILLS","JOB_SKILLS",ONE,MANY,"demanded in"),
 ("SKILLS","MARKET_SIGNALS",ONE,MANY,"measured by"),
 ("CAREER_ROLES","MARKET_SIGNALS",ONE,MANY,"scoped to"),
 ("USERS","ROADMAPS",ONE,MANY,"receives"),
 ("GOALS","ROADMAPS",ONE,MANY,"drives"),
 ("ROADMAPS","ROADMAP_ITEMS",ONE,ONE_MANY,"contains"),
 ("SKILLS","ROADMAP_ITEMS",ONE,MANY,"recommended in"),
 ("USERS","EVIDENCE",ZERO_ONE,MANY,"reviews"),
]

def esc(s): return html.escape(s, quote=True)

def node(name, hdr, cols):
    rows = [f'<TR><TD COLSPAN="4" BGCOLOR="{hdr}" ALIGN="LEFT"><B>{esc(name)}</B></TD></TR>']
    for n, t, k, note, store in cols:
        kc = "#9a3412" if "PK" in k else ("#1d4ed8" if "FK" in k else "#555555")
        nm = f"<U>{esc(n)}</U>" if "PK" in k else esc(n)
        notecol = store or "#6b7280"
        keyc = f'<FONT COLOR="{kc}"><B>{esc(k)}</B></FONT>' if k else " "
        notec = f'<FONT COLOR="{notecol}" POINT-SIZE="8"><I>{esc(note)}</I></FONT>' if note else " "
        rows.append(
          f'<TR><TD ALIGN="LEFT">{keyc}</TD>'
          f'<TD ALIGN="LEFT">{nm}</TD>'
          f'<TD ALIGN="LEFT"><FONT COLOR="#6b7280">{esc(t)}</FONT></TD>'
          f'<TD ALIGN="LEFT">{notec}</TD></TR>')
    tbl = ('<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#8a94a3" BGCOLOR="white">'
           + "".join(rows) + "</TABLE>>")
    return f'  {name} [label={tbl}];'

lines = ['digraph ER {',
 '  graph [rankdir=LR, splines=spline, nodesep=0.35, ranksep=0.9, fontname="DejaVu Sans", '
 'pad=0.3, newrank=true, compound=true];',
 '  node [shape=plain, fontname="DejaVu Sans", fontsize=9];',
 '  edge [fontname="DejaVu Sans", fontsize=8, fontcolor="#4b5563", color="#6b7280", dir=both, arrowsize=0.8, penwidth=1.0];']
for i, (label, members) in enumerate(CLUSTERS):
    lines.append(f'  subgraph cluster_{i} {{ label="{label}"; labeljust=l; fontsize=11; fontcolor="#374151"; '
                 'style="rounded,dashed"; color="#b8c0cc";')
    for m in members:
        hdr, cols = E[m]
        lines.append(node(m, hdr, cols))
    lines.append('  }')
for a, b, t, h, lab in R:
    lines.append(f'  {a} -> {b} [arrowtail={t}, arrowhead={h}, label="{lab}"];')
# audit actor is a logical reference only (no FK, so audit rows survive user deletion)
lines.append('  USERS -> AUDIT_LOG [arrowtail=none, arrowhead=crowodot, style=dashed, label="acts (logical)"];')
lines.append('}')
open(OUT + ".dot", "w").write("\n".join(lines))
for fmt in ("pdf", "png", "svg"):
    extra = ["-Gdpi=110"] if fmt == "png" else []
    subprocess.run(["dot", f"-T{fmt}", *extra, OUT + ".dot", "-o", f"{OUT}.{fmt}"], check=True)
print("ok")
