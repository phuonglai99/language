import Database from 'better-sqlite3';
import path from 'node:path';
import { migrate } from './migrate';

/**
 * One connection per process. DB_PATH overrides the file (relative paths resolve from
 * the project root); rollback is DB_PATH=data/lessons.db with the previous build.
 */
const DEFAULT_PATH = 'data/hsk.db';

const globalForDb = globalThis as unknown as { __hskDb?: Database.Database };

export function dbPath(): string {
  return path.resolve(process.cwd(), process.env.DB_PATH || DEFAULT_PATH);
}

export function getDb(): Database.Database {
  // Cached on globalThis so dev-mode module reloads reuse the same connection.
  if (!globalForDb.__hskDb) {
    const db = new Database(dbPath(), { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
    globalForDb.__hskDb = db;
  }
  return globalForDb.__hskDb;
}
