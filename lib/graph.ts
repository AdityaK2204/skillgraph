/**
 * Skill knowledge graph.
 * PostgreSQL is the system of record; Neo4j holds a projection used for traversal.
 * Every read has a PostgreSQL recursive-CTE fallback, so the app keeps working
 * (and the response says which engine answered) if Neo4j is down.
 */
import { query } from './db';
import { cypher, neo4jAvailable } from './neo4j';

export type GraphSource = 'neo4j' | 'postgres-cte';

// ------------------------------------------------------------------ sync
export async function syncCatalog(): Promise<{ skills: number; roles: number; prereqs: number; requires: number; related: number }> {
  const skills = await query<{ skill_id: number; name: string; category: string; effort_hours: number }>(
    'SELECT skill_id, name, category, effort_hours FROM skills');
  const roles = await query<{ role_id: number; title: string; domain: string }>('SELECT role_id, title, domain FROM career_roles');
  const prereqs = await query<{ skill_id: number; prereq_skill_id: number; strength: string }>('SELECT * FROM skill_prerequisites');
  const requires = await query<{ role_id: number; skill_id: number; required_level: number; importance: string }>(
    'SELECT role_id, skill_id, required_level, importance FROM role_skills');
  // related = skills that co-occur in at least 2 active postings
  const related = await query<{ a: number; b: number; n: number }>(
    `SELECT x.skill_id AS a, y.skill_id AS b, count(*)::int AS n
       FROM job_skills x JOIN job_skills y ON x.job_id = y.job_id AND x.skill_id < y.skill_id
       JOIN job_postings jp ON jp.job_id = x.job_id AND jp.is_active
      GROUP BY 1, 2 HAVING count(*) >= 2`);

  await cypher('MATCH (s:Skill) WHERE NOT s.skillId IN $ids DETACH DELETE s', { ids: skills.map((s) => s.skill_id) });
  await cypher('MATCH (r:Role)  WHERE NOT r.roleId IN $ids DETACH DELETE r', { ids: roles.map((r) => r.role_id) });
  await cypher(
    `UNWIND $rows AS row
     MERGE (s:Skill {skillId: row.skill_id})
     SET s.name = row.name, s.category = row.category, s.effortHours = row.effort_hours`, { rows: skills });
  await cypher(
    `UNWIND $rows AS row
     MERGE (r:Role {roleId: row.role_id}) SET r.title = row.title, r.domain = row.domain`, { rows: roles });
  await cypher('MATCH ()-[e:PREREQ_OF|REQUIRES|RELATED_TO]->() DELETE e');
  await cypher(
    `UNWIND $rows AS row
     MATCH (p:Skill {skillId: row.prereq_skill_id}), (s:Skill {skillId: row.skill_id})
     CREATE (p)-[:PREREQ_OF {strength: toFloat(row.strength)}]->(s)`, { rows: prereqs });
  await cypher(
    `UNWIND $rows AS row
     MATCH (r:Role {roleId: row.role_id}), (s:Skill {skillId: row.skill_id})
     CREATE (r)-[:REQUIRES {level: row.required_level, importance: toFloat(row.importance)}]->(s)`, { rows: requires });
  await cypher(
    `UNWIND $rows AS row
     MATCH (a:Skill {skillId: row.a}), (b:Skill {skillId: row.b})
     CREATE (a)-[:RELATED_TO {weight: row.n}]->(b)`, { rows: related });
  // keep PostgreSQL's pointer to the graph node in step
  await query(`UPDATE skills SET neo4j_node_id = 'Skill:' || skill_id WHERE neo4j_node_id IS DISTINCT FROM 'Skill:' || skill_id`);
  await query(`UPDATE career_roles SET neo4j_node_id = 'Role:' || role_id WHERE neo4j_node_id IS DISTINCT FROM 'Role:' || role_id`);
  return { skills: skills.length, roles: roles.length, prereqs: prereqs.length, requires: requires.length, related: related.length };
}

/** Projects one user's skills, goal, projects and evidence into the graph. */
export async function syncUser(userId: string): Promise<void> {
  const [u] = await query<{ email: string; role_id: number | null }>(
    `SELECT u.email, ag.role_id FROM users u LEFT JOIN v_active_goals ag USING (user_id) WHERE u.user_id = $1`, [userId]);
  if (!u) return;
  const skills = await query('SELECT skill_id, claimed_level, verified_level FROM user_skills WHERE user_id = $1', [userId]);
  const projects = await query(
    `SELECT p.project_id, p.title, coalesce(array_agg(ps.skill_id) FILTER (WHERE ps.skill_id IS NOT NULL), '{}') AS skills
       FROM projects p LEFT JOIN project_skills ps USING (project_id) WHERE p.user_id = $1 GROUP BY p.project_id`, [userId]);
  const evidence = await query(
    'SELECT evidence_id, skill_id, project_id, kind::text AS kind, status, demonstrated_level FROM evidence WHERE user_id = $1', [userId]);

  await cypher('MERGE (u:User {userId: $id}) SET u.email = $email', { id: userId, email: u.email });
  await cypher(
    `MATCH (u:User {userId: $id})
     OPTIONAL MATCH (u)-[r:HAS_SKILL|TARGETS|BUILT|SUBMITTED]->(n)
     WITH u, collect(r) AS rels, collect(n) AS nodes
     FOREACH (r IN rels | DELETE r)
     FOREACH (n IN [x IN nodes WHERE x:Project OR x:Evidence] | DETACH DELETE n)`, { id: userId });
  await cypher(
    `MATCH (u:User {userId: $id}) UNWIND $rows AS row
     MATCH (s:Skill {skillId: row.skill_id})
     CREATE (u)-[:HAS_SKILL {claimed: row.claimed_level, verified: row.verified_level}]->(s)`, { id: userId, rows: skills });
  if (u.role_id) await cypher('MATCH (u:User {userId: $id}), (r:Role {roleId: $role}) CREATE (u)-[:TARGETS]->(r)', { id: userId, role: u.role_id });
  await cypher(
    `MATCH (u:User {userId: $id}) UNWIND $rows AS row
     CREATE (u)-[:BUILT]->(p:Project {projectId: row.project_id, title: row.title})
     WITH p, row UNWIND row.skills AS sid
     MATCH (s:Skill {skillId: sid}) CREATE (p)-[:USES]->(s)`, { id: userId, rows: projects });
  await cypher(
    `MATCH (u:User {userId: $id}) UNWIND $rows AS row
     MATCH (s:Skill {skillId: row.skill_id})
     CREATE (u)-[:SUBMITTED]->(e:Evidence {evidenceId: row.evidence_id, kind: row.kind, status: row.status})-[:PROVES {level: row.demonstrated_level}]->(s)
     WITH e, row WHERE row.project_id IS NOT NULL
     MATCH (p:Project {projectId: row.project_id}) CREATE (e)-[:FROM_PROJECT]->(p)`, { id: userId, rows: evidence });
}

/** Fire-and-forget user sync after a write; Neo4j being down never fails the request. */
export function syncUserQuietly(userId: string) {
  neo4jAvailable()
    .then((ok) => (ok ? syncUser(userId) : undefined))
    .catch((err) => console.warn('[graph] user sync skipped:', (err as Error).message));
}

// ------------------------------------------------------------------ reads
export interface GraphNode {
  id: number; name: string; category: string; required: number | null; importance: number | null;
  claimed: number; verified: number; effective: number; depth: number; state: 'proven' | 'met' | 'partial' | 'missing';
}
export interface GraphEdge { from: number; to: number; strength: number }

/** Required skills of a role + all transitive prerequisites, overlaid with the user's levels. */
export async function roleGraph(roleId: number, userId: string): Promise<{ source: GraphSource; nodes: GraphNode[]; edges: GraphEdge[] }> {
  let source: GraphSource = 'postgres-cte';
  let ids: Array<{ id: number; depth: number }> = [];
  let edges: GraphEdge[] = [];

  if (await neo4jAvailable()) {
    try {
      ids = await cypher<{ id: number; depth: number }>(
        `MATCH (r:Role {roleId: $roleId})-[:REQUIRES]->(t:Skill)
         MATCH p = (pre:Skill)-[:PREREQ_OF*0..8]->(t)
         RETURN pre.skillId AS id, max(length(p)) AS depth`, { roleId });
      const idList = ids.map((x) => x.id);
      edges = await cypher<GraphEdge>(
        `MATCH (a:Skill)-[e:PREREQ_OF]->(b:Skill)
         WHERE a.skillId IN $ids AND b.skillId IN $ids
         RETURN a.skillId AS from, b.skillId AS to, e.strength AS strength`, { ids: idList });
      source = 'neo4j';
    } catch (err) {
      console.warn('[graph] Neo4j query failed, using PostgreSQL:', (err as Error).message);
    }
  }

  if (source === 'postgres-cte') {
    ids = await query<{ id: number; depth: number }>(
      `WITH RECURSIVE walk(skill_id, depth, path) AS (
         SELECT skill_id, 0, ARRAY[skill_id] FROM role_skills WHERE role_id = $1
         UNION ALL
         SELECT sp.prereq_skill_id, w.depth + 1, w.path || sp.prereq_skill_id
         FROM walk w JOIN skill_prerequisites sp ON sp.skill_id = w.skill_id
         WHERE sp.prereq_skill_id <> ALL (w.path) AND w.depth < 8)
       SELECT skill_id AS id, max(depth)::int AS depth FROM walk GROUP BY skill_id`, [roleId]);
    edges = await query<GraphEdge>(
      `SELECT prereq_skill_id AS "from", skill_id AS "to", strength::float AS strength
         FROM skill_prerequisites WHERE skill_id = ANY($1) AND prereq_skill_id = ANY($1)`, [ids.map((x) => x.id)]);
  }

  const depthOf = new Map(ids.map((x) => [Number(x.id), Number(x.depth)]));
  const rows = await query<{
    skill_id: number; name: string; category: string; required_level: number | null; importance: string | null;
    claimed: number; verified: number; effective: string;
  }>(
    `SELECT s.skill_id, s.name, s.category, rs.required_level, rs.importance,
            coalesce(us.claimed_level, 0) AS claimed, coalesce(us.verified_level, 0) AS verified,
            effective_level(us.claimed_level, us.verified_level) AS effective
       FROM skills s
       LEFT JOIN role_skills rs ON rs.skill_id = s.skill_id AND rs.role_id = $1
       LEFT JOIN user_skills us ON us.skill_id = s.skill_id AND us.user_id = $2
      WHERE s.skill_id = ANY($3)`, [roleId, userId, [...depthOf.keys()]]);

  const nodes: GraphNode[] = rows.map((r) => {
    const need = r.required_level ?? 2;
    const eff = Number(r.effective);
    return {
      id: r.skill_id, name: r.name, category: r.category,
      required: r.required_level, importance: r.importance === null ? null : Number(r.importance),
      claimed: r.claimed, verified: r.verified, effective: eff, depth: depthOf.get(r.skill_id) ?? 0,
      state: r.verified >= need ? 'proven' : eff >= need ? 'met' : r.claimed > 0 ? 'partial' : 'missing',
    };
  });
  return { source, nodes, edges: edges.map((e) => ({ from: Number(e.from), to: Number(e.to), strength: Number(e.strength) })) };
}

/** Roles sharing the most requirements with the given one (career pivots). */
export async function pivotRoles(roleId: number): Promise<{ source: GraphSource; roles: Array<{ title: string; shared: number }> }> {
  if (await neo4jAvailable()) {
    try {
      const roles = await cypher<{ title: string; shared: number }>(
        `MATCH (r:Role {roleId: $roleId})-[:REQUIRES]->(s:Skill)<-[:REQUIRES]-(o:Role)
         RETURN o.title AS title, count(s) AS shared ORDER BY shared DESC, title LIMIT 4`, { roleId });
      return { source: 'neo4j', roles };
    } catch { /* fall through */ }
  }
  const roles = await query<{ title: string; shared: number }>(
    `SELECT o.title, count(*)::int AS shared
       FROM role_skills a JOIN role_skills b ON a.skill_id = b.skill_id AND b.role_id <> a.role_id
       JOIN career_roles o ON o.role_id = b.role_id
      WHERE a.role_id = $1 GROUP BY o.title ORDER BY shared DESC, o.title LIMIT 4`, [roleId]);
  return { source: 'postgres-cte', roles };
}

/** Shortest prerequisite chain from one skill to another. */
export async function prerequisiteChain(fromId: number, toId: number): Promise<{ source: GraphSource; chain: string[] }> {
  if (await neo4jAvailable()) {
    try {
      const [row] = await cypher<{ chain: string[] }>(
        `MATCH p = shortestPath((a:Skill {skillId: $fromId})-[:PREREQ_OF*..10]->(b:Skill {skillId: $toId}))
         RETURN [n IN nodes(p) | n.name] AS chain`, { fromId, toId });
      return { source: 'neo4j', chain: row?.chain ?? [] };
    } catch { /* fall through */ }
  }
  const [row] = await query<{ chain: string[] }>(
    `WITH RECURSIVE up(node, path) AS (
       SELECT $1::int, ARRAY[$1::int]
       UNION ALL
       SELECT sp.skill_id, u.path || sp.skill_id FROM up u JOIN skill_prerequisites sp ON sp.prereq_skill_id = u.node
       WHERE sp.skill_id <> ALL (u.path) AND cardinality(u.path) < 10)
     SELECT ARRAY(SELECT s.name::text FROM unnest(path) WITH ORDINALITY x(id, i) JOIN skills s ON s.skill_id = x.id ORDER BY i) AS chain
     FROM up WHERE node = $2 ORDER BY cardinality(path) LIMIT 1`, [fromId, toId]);
  return { source: 'postgres-cte', chain: row?.chain ?? [] };
}
