/**
 * npm run graph:sync
 * Applies the Neo4j constraints and projects the PostgreSQL catalogue and every user into Neo4j.
 */
import './_env';
import { readFileSync } from 'node:fs';
import { pool, query } from '../lib/db';
import { cypher, closeNeo4j, neo4jAvailable } from '../lib/neo4j';
import { syncCatalog, syncUser } from '../lib/graph';

async function main() {
  if (!(await neo4jAvailable())) {
    console.warn('Neo4j is not reachable (check NEO4J_URI / NEO4J_PASSWORD and docker compose). The app will use PostgreSQL recursive queries instead.');
    process.exitCode = 1;
    return;
  }
  const statements = readFileSync('db/neo4j/01_constraints.cypher', 'utf8')
    .split(';').map((s) => s.replace(/\/\/.*$/gm, '').trim()).filter(Boolean);
  for (const s of statements) await cypher(s);
  console.log(`Applied ${statements.length} constraints/indexes`);

  const c = await syncCatalog();
  console.log(`Catalogue: ${c.skills} skills, ${c.roles} roles, ${c.prereqs} PREREQ_OF, ${c.requires} REQUIRES, ${c.related} RELATED_TO`);

  const users = await query<{ user_id: string }>(`SELECT user_id FROM users WHERE role = 'student'`);
  for (const u of users) await syncUser(u.user_id);
  console.log(`Users: ${users.length} projected`);
}

main()
  .catch((e) => { console.error('Graph sync failed:', e.message); process.exitCode = 1; })
  .finally(async () => { await closeNeo4j(); await pool().end(); });
