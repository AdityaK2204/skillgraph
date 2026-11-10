/**
 * npm run db:init [-- --reset]
 * Creates the PostgreSQL schema without Docker's init hook (for a local PostgreSQL install,
 * or to rebuild). Uses DATABASE_ADMIN_URL; the web app itself never connects as superuser.
 * With Docker Compose this already happened on first start, so the script only checks it.
 */
import './_env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { MongoClient } from 'mongodb';

const reset = process.argv.includes('--reset');
const files = ['01_schema.sql', '02_logic.sql', '03_seed_catalog.sql'];

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error('DATABASE_ADMIN_URL is not set');
  const c = new Client({ connectionString: url });
  await c.connect();

  const { rows } = await c.query(`SELECT to_regclass('public.users') IS NOT NULL AS exists`);
  if (rows[0].exists && !reset) {
    console.log('Schema already present (created by docker compose or an earlier run). Use --reset to rebuild it.');
  } else {
    if (reset) {
      console.log('Dropping and recreating schema public …');
      await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await c.query('DROP TYPE IF EXISTS user_role, evidence_kind CASCADE');
    }
    for (const f of files) {
      process.stdout.write(`Applying ${f} … `);
      await c.query(readFileSync(join('db', 'postgres', f), 'utf8'));
      console.log('done');
    }
  }

  // least-privilege application role (same as db/postgres/04_app_role.sh)
  const appPassword = process.env.APP_DB_PASSWORD;
  if (appPassword) {
    const exists = await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'skillgraph_app'`);
    const pw = (await c.query('SELECT quote_literal($1) AS q', [appPassword])).rows[0].q;
    await c.query(exists.rowCount ? `ALTER ROLE skillgraph_app LOGIN PASSWORD ${pw}` : `CREATE ROLE skillgraph_app LOGIN PASSWORD ${pw}`);
    const db = (await c.query('SELECT current_database() AS d')).rows[0].d;
    await c.query(`
      GRANT CONNECT ON DATABASE "${db}" TO skillgraph_app;
      GRANT USAGE ON SCHEMA public TO skillgraph_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO skillgraph_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO skillgraph_app;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO skillgraph_app;
      GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO skillgraph_app;
      REVOKE UPDATE, DELETE ON audit_log FROM skillgraph_app;
      ALTER PROCEDURE refresh_market_signals() SECURITY DEFINER SET search_path = public;`);
    console.log('Role skillgraph_app ready (DML only, no DDL).');
  }
  await c.end();
  await initMongo();
}

/** Applies db/mongo/schema.json (validators + indexes). Docker does this via db/mongo/init.js. */
async function initMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return console.warn('MONGODB_URI not set; skipping MongoDB');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB ?? 'skillgraph');
    const schema = JSON.parse(readFileSync(join('db', 'mongo', 'schema.json'), 'utf8'));
    const existing = new Set((await db.listCollections().toArray()).map((x) => x.name));
    for (const col of schema.collections) {
      if (existing.has(col.name)) {
        await db.command({ collMod: col.name, validator: col.validator, validationLevel: 'strict' })
          .catch((e) => console.warn(`  ${col.name}: validator not updated (${e.message})`));
      } else {
        await db.createCollection(col.name, { validator: col.validator, validationLevel: 'strict', validationAction: 'error' });
      }
      for (const ix of col.indexes) await db.collection(col.name).createIndex(ix.key, ix.options ?? {});
      console.log(`MongoDB ${col.name}: validator + ${col.indexes.length} indexes`);
    }
  } catch (e) {
    console.warn('MongoDB not initialised:', (e as Error).message);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error('db:init failed:', e.message);
  process.exit(1);
});
