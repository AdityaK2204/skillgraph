// =====================================================================
// SkillGraph · Neo4j schema (applied by `npm run graph:sync`)
// PostgreSQL is the system of record; Neo4j holds a read-optimised
// projection of the skill knowledge graph for multi-hop traversal.
// =====================================================================

// Node uniqueness = the PostgreSQL primary keys
CREATE CONSTRAINT skill_id   IF NOT EXISTS FOR (s:Skill)    REQUIRE s.skillId   IS UNIQUE;
CREATE CONSTRAINT role_id    IF NOT EXISTS FOR (r:Role)     REQUIRE r.roleId    IS UNIQUE;
CREATE CONSTRAINT user_id    IF NOT EXISTS FOR (u:User)     REQUIRE u.userId    IS UNIQUE;
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project)  REQUIRE p.projectId IS UNIQUE;
CREATE CONSTRAINT evidence_id IF NOT EXISTS FOR (e:Evidence) REQUIRE e.evidenceId IS UNIQUE;

// Lookup indexes
CREATE INDEX skill_name    IF NOT EXISTS FOR (s:Skill) ON (s.name);
CREATE INDEX skill_category IF NOT EXISTS FOR (s:Skill) ON (s.category);

// ---------------------------------------------------------------------
// Graph model
//   (:Skill)-[:PREREQ_OF {strength}]->(:Skill)        prerequisite -> skill it unlocks
//   (:Role)-[:REQUIRES {level, importance}]->(:Skill)
//   (:Skill)-[:RELATED_TO {weight}]->(:Skill)         co-occurrence in job postings
//   (:User)-[:HAS_SKILL {claimed, verified}]->(:Skill)
//   (:User)-[:TARGETS]->(:Role)
//   (:User)-[:BUILT]->(:Project)-[:USES]->(:Skill)
//   (:User)-[:SUBMITTED]->(:Evidence)-[:PROVES {level}]->(:Skill)
//   (:Evidence)-[:FROM_PROJECT]->(:Project)
// ---------------------------------------------------------------------
