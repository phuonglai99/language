import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Applies src/server/db/migrations/NNN_*.sql in order, skipping versions already in
 * schema_migrations. Version 1 (001_init.sql) is the full schema; it is applied by
 * `npm run migrate:v4`, which builds data/hsk.db from the old database.
 *
 * Schema changes after that are new numbered files — never edits to an applied one.
 */
export const MIGRATIONS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'src/server/db/migrations');

export function migrate(db: Database.Database, dir = MIGRATIONS_DIR): number[] {
  const files = fs.readdirSync(dir)
    .map(name => ({ name, version: Number(/^(\d+)_.+\.sql$/.exec(name)?.[1]) }))
    .filter(f => Number.isInteger(f.version))
    .sort((a, b) => a.version - b.version);

  const hasTable = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  ).get();
  const applied = new Set(
    hasTable ? (db.prepare('SELECT version FROM schema_migrations').pluck().all() as number[]) : [],
  );

  const ran: number[] = [];
  for (const f of files) {
    if (applied.has(f.version)) continue;
    const sql = fs.readFileSync(path.join(dir, f.name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(f.version);
    })();
    ran.push(f.version);
  }
  return ran;
}
