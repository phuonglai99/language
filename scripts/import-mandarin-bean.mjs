#!/usr/bin/env node
/**
 * Import Mandarin Bean lessons from JSON into SQLite DB.
 * Usage: node scripts/import-mandarin-bean.mjs [path/to/mandarin-bean-lessons.json]
 *
 * Default JSON path: data/mandarin-bean-lessons.json
 * Output DB:         data/lessons.db
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const JSON_PATH = process.argv[2] ?? path.join(ROOT, 'data', 'mandarin-bean-lessons.json');
const DB_PATH = path.join(ROOT, 'data', 'lessons.db');

if (!fs.existsSync(JSON_PATH)) {
  console.error(`❌  File not found: ${JSON_PATH}`);
  console.error('   Run "npm run crawl" in the worktree first, then copy the JSON here.');
  process.exit(1);
}

console.log(`📖  Reading ${JSON_PATH} …`);
const raw = fs.readFileSync(JSON_PATH, 'utf8');
const data = JSON.parse(raw);
const lessons = data.lessons ?? [];

function isValid(l) {
  return !!l.title_en && Array.isArray(l.content) && l.content.length > 0 && !!l.hsk_level;
}

const valid = lessons.filter(isValid);
console.log(`✅  ${valid.length} valid lessons (${lessons.length - valid.length} skipped)`);

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS mb_lessons (
    slug TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title_en TEXT NOT NULL,
    title_zh_simplified TEXT NOT NULL,
    title_zh_traditional TEXT NOT NULL,
    hsk_level INTEGER NOT NULL,
    categories TEXT NOT NULL,
    audio_url TEXT,
    content TEXT NOT NULL,
    content_text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mb_lessons_hsk ON mb_lessons(hsk_level);
`);

const insert = db.prepare(`
  INSERT OR REPLACE INTO mb_lessons
    (slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, content, content_text)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((rows) => {
  for (const l of rows) {
    insert.run(
      l.slug, l.url, l.title_en,
      l.title_zh_simplified ?? '', l.title_zh_traditional ?? '',
      l.hsk_level,
      JSON.stringify(l.categories ?? []),
      l.audio_url ?? null,
      JSON.stringify(l.content),
      l.content_text ?? '',
    );
  }
});

console.log('💾  Inserting into DB …');
insertMany(valid);

const count = db.prepare('SELECT COUNT(*) as n FROM mb_lessons').get().n;
const byHsk = db.prepare(
  'SELECT hsk_level, COUNT(*) as n FROM mb_lessons GROUP BY hsk_level ORDER BY hsk_level'
).all();

db.close();

console.log(`\n🎉  Done! ${count} lessons in DB:`);
for (const row of byHsk) console.log(`   HSK ${row.hsk_level}: ${row.n}`);
