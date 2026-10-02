/**
 * DB v4 migration: data/lessons.db (read-only) → data/hsk.db (rebuilt from scratch).
 *
 *   npm run migrate:v4                      # all steps
 *   npm run migrate:v4 -- --source=<file>   # migrate from another copy, e.g. a backup
 *
 * Plan: docs/migration-plan.md. Column mapping: docs/db/README.md.
 * The old DB is never written: it is opened with { readonly: true }.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { steps } from './steps';

export interface MigrationContext {
  /** Old DB, read-only. */
  old: Database.Database;
  /** New DB being built. */
  db: Database.Database;
  log: (msg: string) => void;
}

export interface MigrationStep {
  name: string;
  run: (ctx: MigrationContext) => void;
}

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(ROOT, 'docs/db/schema.sql');
const DEFAULT_SOURCE = path.join(ROOT, 'data/lessons.db');
const TARGET = path.join(ROOT, 'data/hsk.db');

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function removeDbFiles(file: string) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(file + suffix, { force: true });
  }
}

function main() {
  const source = path.resolve(arg('source') ?? DEFAULT_SOURCE);
  if (source === TARGET) throw new Error('Source and target are the same file');
  if (!fs.existsSync(source)) throw new Error(`Source DB not found: ${source}`);

  const old = new Database(source, { readonly: true, fileMustExist: true });
  removeDbFiles(TARGET);
  const db = new Database(TARGET);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const log = (msg: string) => console.log(`  ${msg}`);
  console.log(`source: ${path.relative(ROOT, source)}`);
  console.log(`target: ${path.relative(ROOT, TARGET)}`);

  for (const step of steps) {
    const started = Date.now();
    console.log(`▶ ${step.name}`);
    db.transaction(() => step.run({ old, db, log }))();
    console.log(`  done in ${Date.now() - started} ms`);
  }

  const fkErrors = db.pragma('foreign_key_check') as unknown[];
  if (fkErrors.length) throw new Error(`foreign_key_check: ${fkErrors.length} violation(s)`);

  const tables = db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'words_fts%' AND name NOT LIKE 'sqlite_%'")
    .get() as { n: number };
  console.log(`✔ ${tables.n} tables, ${steps.length} step(s), no FK violations`);

  old.close();
  db.close();
}

main();
