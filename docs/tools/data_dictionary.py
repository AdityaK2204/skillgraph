"""Generates docs/DATA_DICTIONARY.md from the live PostgreSQL catalogue (so it never drifts from the DDL).
Usage: python3 docs/tools/data_dictionary.py "$DATABASE_ADMIN_URL"
"""
import subprocess, sys, json

url = sys.argv[1]

def q(sql):
    out = subprocess.run(['psql', url, '-At', '-c', f"SELECT coalesce(json_agg(r), '[]') FROM ({sql}) r"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

tables = q("""SELECT c.relname AS t, obj_description(c.oid) AS d
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname""")
cols = q("""SELECT c.table_name AS t, c.column_name AS col, c.ordinal_position AS pos,
                   CASE WHEN c.domain_name IS NOT NULL THEN c.domain_name
                        WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
                        WHEN c.data_type = 'ARRAY' THEN replace(c.udt_name, '_', '') || '[]'
                        WHEN c.character_maximum_length IS NOT NULL THEN c.data_type || '(' || c.character_maximum_length || ')'
                        WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                        ELSE c.data_type END AS type,
                   c.is_nullable = 'YES' AS nullable, c.column_default AS def, c.is_generated = 'ALWAYS' AS generated,
                   format_type(a.atttypid, a.atttypmod) AS fmt
            FROM information_schema.columns c
            JOIN pg_attribute a ON a.attrelid = ('public.' || c.table_name)::regclass AND a.attname = c.column_name
            WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position""")
keys = q("""SELECT tc.table_name AS t, kcu.column_name AS col, tc.constraint_type AS kind,
                   ccu.table_name AS ref_t, ccu.column_name AS ref_c
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
            LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_type = 'FOREIGN KEY' AND ccu.constraint_name = tc.constraint_name
            WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY','FOREIGN KEY','UNIQUE')""")
checks = q("""SELECT conrelid::regclass::text AS t, conname AS name, pg_get_constraintdef(oid) AS def
              FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY 1, 2""")
fks = q("""SELECT conrelid::regclass::text AS t, conname AS name, pg_get_constraintdef(oid) AS def
           FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY 1, 2""")

PURPOSE = {
 'users': 'Login identity and role (RBAC).', 'profiles': 'Personal profile, 1:1 with users; holds the profile embedding.',
 'resumes': 'Pointer to a parsed resume document in MongoDB.', 'goals': 'Target career role chosen by a user (one active at a time).',
 'career_roles': 'Catalogue of target roles.', 'skills': 'Skill catalogue with aliases, effort, FTS vector and embedding.',
 'skill_prerequisites': 'Recursive M:N: skill requires prerequisite skill (kept acyclic by trigger).',
 'role_skills': 'M:N: skills a role requires, with level and importance.',
 'user_skills': 'M:N: skills a user claims; verified level is derived from evidence.',
 'projects': 'Projects a user has built.', 'project_skills': 'M:N: skills used in a project.',
 'evidence': 'Proof of a skill, reviewed by a mentor.', 'job_postings': 'Normalised job postings (raw form in MongoDB).',
 'job_skills': 'M:N: skills a posting asks for.', 'market_signals': 'Daily demand snapshot per skill and role.',
 'roadmaps': 'Versioned Learn > Build > Prove plan for a goal.', 'roadmap_items': 'Weak entity: ordered, scored items of a roadmap.',
 'scoring_weights': 'Admin-tunable weights of the 7 priority factors.', 'audit_log': 'Append-only change history written by triggers.',
 'app_meta': 'Key/value metadata (schema version, embedding model, last market refresh).',
}

out = ['# Data dictionary', '',
       '_Generated from the PostgreSQL catalogue by `docs/tools/data_dictionary.py`. Key: PK primary key, FK foreign key, UK unique, '
       'NN not null, GEN generated column._', '']
for t in [x['t'] for x in tables]:
    out += [f'## {t}', '', PURPOSE.get(t, ''), '', '| Column | Type | Keys | Null | Default / notes |', '|---|---|---|---|---|']
    for c in [c for c in cols if c['t'] == t]:
        k = sorted({ {'PRIMARY KEY': 'PK', 'FOREIGN KEY': 'FK', 'UNIQUE': 'UK'}[x['kind']] for x in keys if x['t'] == t and x['col'] == c['col'] })
        ref = [f"→ {x['ref_t']}.{x['ref_c']}" for x in keys if x['t'] == t and x['col'] == c['col'] and x['kind'] == 'FOREIGN KEY']
        typ = c['fmt'] if c['type'] in ('USER-DEFINED',) or c['fmt'].startswith('vector') else c['type']
        note = 'GEN (tsvector)' if c['generated'] else (c['def'] or '')
        note = (note.replace('|', '\\|')[:60] + (' ' + ' '.join(ref) if ref else '')).strip()
        out.append(f"| `{c['col']}` | {typ} | {', '.join(k)} | {'yes' if c['nullable'] else 'NN'} | {note} |")
    cs = [x for x in checks if x['t'] == t]
    fs = [x for x in fks if x['t'] == t]
    if cs or fs:
        out += ['', '**Constraints**', '']
        out += [f"- `{x['name']}`: `{x['def'].replace('|', '/')}`" for x in cs]
        out += [f"- `{x['name']}`: `{x['def']}`" for x in fs]
    out.append('')

open('docs/DATA_DICTIONARY.md', 'w').write('\n'.join(out))
print(f'wrote docs/DATA_DICTIONARY.md: {len(tables)} tables, {len(cols)} columns, {len(checks)} CHECK, {len(fks)} FK')
