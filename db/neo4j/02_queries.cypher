// =====================================================================
// SkillGraph · Neo4j traversal queries (demo)
// Run in Neo4j Browser (http://localhost:7474) after `npm run graph:sync`.
// The app uses the same Cypher in lib/graph.ts.
// =====================================================================

// G1 · Learning path to a role: every skill the role needs plus all
//      transitive prerequisites, with the distance from the requirement.
MATCH (r:Role {title: 'Machine Learning Engineer'})-[req:REQUIRES]->(target:Skill)
MATCH path = (pre:Skill)-[:PREREQ_OF*0..6]->(target)
RETURN pre.name AS skill, min(length(path)) AS stepsBeforeRequirement,
       collect(DISTINCT target.name) AS unlocks
ORDER BY stepsBeforeRequirement DESC, skill;

// G2 · Shortest prerequisite chain between two skills
MATCH p = shortestPath((a:Skill {name: 'Programming Fundamentals'})-[:PREREQ_OF*]->(b:Skill {name: 'LLM Applications'}))
RETURN [n IN nodes(p) | n.name] AS chain, length(p) AS hops;

// G3 · What a user is missing for their target role, and what each gap blocks
MATCH (u:User {email: 'aarav.mehta@skillgraph.dev'})-[:TARGETS]->(r:Role)-[req:REQUIRES]->(s:Skill)
OPTIONAL MATCH (u)-[h:HAS_SKILL]->(s)
WITH u, r, s, req, coalesce(h.verified, 0) + 0.5 * (coalesce(h.claimed, 0) - coalesce(h.verified, 0)) AS eff
WHERE eff < req.level
OPTIONAL MATCH (s)-[:PREREQ_OF]->(blocked:Skill)<-[:REQUIRES]-(r)
RETURN s.name AS gap, req.level AS required, eff AS current, collect(DISTINCT blocked.name) AS alsoBlocks
ORDER BY size(alsoBlocks) DESC, required DESC;

// G4 · Evidence paths: how each verified skill is proven (user -> evidence -> skill, via project)
MATCH (u:User {email: 'aarav.mehta@skillgraph.dev'})-[:SUBMITTED]->(e:Evidence {status: 'verified'})-[pr:PROVES]->(s:Skill)
OPTIONAL MATCH (e)-[:FROM_PROJECT]->(p:Project)
RETURN s.name AS skill, pr.level AS level, e.kind AS evidenceType, p.title AS viaProject;

// G5 · "Keystone" skills: unlock the most other skills (out-degree over the DAG, 3 hops)
MATCH (s:Skill)-[:PREREQ_OF*1..3]->(t:Skill)
RETURN s.name AS skill, count(DISTINCT t) AS unlocks
ORDER BY unlocks DESC LIMIT 10;

// G6 · Related skills for a skill (co-occurrence in postings), excluding prerequisites
MATCH (s:Skill {name: 'Python'})-[rel:RELATED_TO]-(o:Skill)
WHERE NOT (o)-[:PREREQ_OF]->(s) AND NOT (s)-[:PREREQ_OF]->(o)
RETURN o.name AS related, rel.weight AS coOccurrence
ORDER BY coOccurrence DESC LIMIT 8;

// G7 · Roles that share the most requirements with the user's target (career pivots)
MATCH (u:User {email: 'aarav.mehta@skillgraph.dev'})-[:TARGETS]->(r:Role)-[:REQUIRES]->(s:Skill)<-[:REQUIRES]-(other:Role)
RETURN other.title AS alternativeRole, count(s) AS sharedSkills
ORDER BY sharedSkills DESC;
