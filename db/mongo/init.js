// =====================================================================
// SkillGraph · MongoDB initialisation (mongosh, runs once on first `docker compose up`)
// Collections, $jsonSchema validators and indexes come from schema.json
// (the same file `npm run db:init` applies outside Docker).
// =====================================================================
const fs = require('fs');
const dbName = process.env.MONGO_INITDB_DATABASE || 'skillgraph';
const sg = db.getSiblingDB(dbName);
const schema = JSON.parse(fs.readFileSync('/docker-entrypoint-initdb.d/schema.json', 'utf8'));

for (const c of schema.collections) {
  sg.createCollection(c.name, { validator: c.validator, validationLevel: 'strict', validationAction: 'error' });
  for (const ix of c.indexes) sg.getCollection(c.name).createIndex(ix.key, ix.options || {});
  print(`created ${c.name} with ${c.indexes.length} indexes`);
}

// least-privilege application user: read/write on this database only
if (process.env.MONGO_APP_PASSWORD) {
  sg.createUser({
    user: process.env.MONGO_APP_USER || 'skillgraph_app',
    pwd: process.env.MONGO_APP_PASSWORD,
    roles: [{ role: 'readWrite', db: dbName }],
  });
}
print('SkillGraph MongoDB initialised');
