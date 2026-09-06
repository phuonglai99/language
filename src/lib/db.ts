import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Lesson } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lessons.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT,
        level TEXT,
        topic TEXT,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
    try { _db.exec('ALTER TABLE lessons ADD COLUMN topic TEXT'); } catch { /* already exists */ }
  }
  return _db;
}

export function getAllLessons(): (Omit<Lesson, 'vocab' | 'grammar'> & { vocabCount: number; grammarCount: number })[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, title, subtitle, level, topic, created_at, data FROM lessons ORDER BY created_at DESC'
  ).all() as { id: string; title: string; subtitle: string; level: string; topic: string | null; created_at: string; data: string }[];
  return rows.map(r => {
    let vocabCount = 0, grammarCount = 0;
    try { const d = JSON.parse(r.data); vocabCount = d.vocab?.length ?? 0; grammarCount = d.grammar?.length ?? 0; } catch { /* ignore */ }
    return { id: r.id, title: r.title, subtitle: r.subtitle, level: r.level, topic: r.topic ?? undefined, createdAt: r.created_at, vocab: [], grammar: [], vocabCount, grammarCount };
  });
}

export function getLesson(id: string): Lesson | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as { id: string; title: string; subtitle: string; level: string; topic: string | null; created_at: string; data: string } | undefined;
  if (!row) return null;
  const lesson = JSON.parse(row.data) as Lesson;
  if (row.topic) lesson.topic = row.topic;
  let dirty = false;
  for (const v of lesson.vocab) {
    if (!v.id) {
      v.id = Math.random().toString(36).slice(2, 12);
      dirty = true;
    }
  }
  if (dirty) {
    db.prepare('UPDATE lessons SET data = ? WHERE id = ?').run(JSON.stringify(lesson), id);
  }
  return lesson;
}

export function saveLesson(lesson: Lesson): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO lessons (id, title, subtitle, level, topic, created_at, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(lesson.id, lesson.title, lesson.subtitle, lesson.level, lesson.topic ?? null, lesson.createdAt, JSON.stringify(lesson));
}

export function deleteLesson(id: string): void {
  getDb().prepare('DELETE FROM lessons WHERE id = ?').run(id);
}

export interface KanjiRow {
  char: string;
  cn_vi: string | null;
  pinyin: string | null;
  strokes: number | null;
  radical: string | null;
  lucthu: string | null;
  hinhthai: string | null;
  netbut: string | null;
  popular: number | null;
  means_tdpt: string | null;
  means_tg: string | null;
  means_tdtd: string | null;
  strokes_svg: string | null;
  botu: string | null;
}

export function getKanji(char: string): KanjiRow | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT char, cn_vi, pinyin, strokes, radical, lucthu, hinhthai, netbut, popular, means_tdpt, means_tg, means_tdtd, strokes_svg, botu FROM kanji WHERE char = ?'
  ).get(char) as KanjiRow | undefined;
  return row ?? null;
}

export function saveKanji(data: {
  char: string; cn_vi?: string; pinyin?: string; strokes?: number;
  radical?: string; lucthu?: string; hinhthai?: string; netbut?: string;
  popular?: number; means_tdpt?: string[]; means_tg?: string[];
  means_tdtd?: string[]; strokes_svg?: string; botu?: import('@/types').BotuPart[];
}): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS kanji (
      char TEXT PRIMARY KEY, cn_vi TEXT, pinyin TEXT, strokes INTEGER,
      radical TEXT, lucthu TEXT, hinhthai TEXT, netbut TEXT, popular INTEGER,
      means_tdpt TEXT, means_tg TEXT, means_tdtd TEXT, strokes_svg TEXT,
      botu TEXT, crawled_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kanji_tmp_check (x INTEGER);
    DROP TABLE IF EXISTS kanji_tmp_check;
  `);
  // Ensure botu column exists (migrating existing DBs)
  try { db.exec('ALTER TABLE kanji ADD COLUMN botu TEXT'); } catch { /* already exists */ }
  db.prepare(`
    INSERT INTO kanji
      (char, cn_vi, pinyin, strokes, radical, lucthu, hinhthai, netbut, popular, means_tdpt, means_tg, means_tdtd, strokes_svg, botu, crawled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(char) DO UPDATE SET
      cn_vi=excluded.cn_vi, pinyin=excluded.pinyin, strokes=excluded.strokes,
      radical=excluded.radical, lucthu=excluded.lucthu, hinhthai=excluded.hinhthai,
      netbut=excluded.netbut, popular=excluded.popular, means_tdpt=excluded.means_tdpt,
      means_tg=excluded.means_tg, means_tdtd=excluded.means_tdtd,
      strokes_svg=excluded.strokes_svg, crawled_at=excluded.crawled_at
  `).run(
    data.char, data.cn_vi ?? null, data.pinyin ?? null, data.strokes ?? null,
    data.radical ?? null, data.lucthu ?? null, data.hinhthai ?? null, data.netbut ?? null,
    data.popular ?? null,
    JSON.stringify(data.means_tdpt ?? []),
    JSON.stringify(data.means_tg ?? []),
    JSON.stringify(data.means_tdtd ?? []),
    data.strokes_svg ?? null,
    data.botu ? JSON.stringify(data.botu) : null,
    new Date().toISOString(),
  );
}

export function updateKanjiBotu(char: string, botu: import('@/types').BotuPart[]): void {
  const db = getDb();
  try { db.exec('ALTER TABLE kanji ADD COLUMN botu TEXT'); } catch { /* already exists */ }
  db.prepare(
    'INSERT INTO kanji (char, botu, crawled_at) VALUES (?, ?, ?) ON CONFLICT(char) DO UPDATE SET botu=excluded.botu'
  ).run(char, JSON.stringify(botu), new Date().toISOString());
}

// ── Mandarin Bean reading lessons ────────────────────────────────────────────

export interface MBLessonWord {
  hanzi: string;
  pinyin: string;
  hsk: number | null;
  definition: string | null;
  wordId?: string | null;
}

export interface SentenceTimestamp {
  index: number;
  start: number | null;
  end: number | null;
}

export interface MBLesson {
  slug: string;
  url: string;
  title_en: string;
  title_zh_simplified: string;
  title_zh_traditional: string;
  hsk_level: number;
  categories: string[];
  audio_url: string | null;
  content: MBLessonWord[][];
  content_text: string;
  sentence_timestamps?: SentenceTimestamp[] | null;
}

function ensureMBTable(db: Database.Database) {
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
      content_text TEXT NOT NULL,
      sentence_timestamps TEXT
    );
    CREATE INDEX IF NOT EXISTS mb_lessons_hsk ON mb_lessons(hsk_level);
  `);
  try { db.exec('ALTER TABLE mb_lessons ADD COLUMN sentence_timestamps TEXT'); } catch { /* already exists */ }
}

export function saveMBLesson(lesson: MBLesson): void {
  const db = getDb();
  ensureMBTable(db);
  db.prepare(`
    INSERT INTO mb_lessons
      (slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, content, content_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      url=excluded.url,
      title_en=excluded.title_en,
      title_zh_simplified=excluded.title_zh_simplified,
      title_zh_traditional=excluded.title_zh_traditional,
      hsk_level=excluded.hsk_level,
      categories=excluded.categories,
      audio_url=excluded.audio_url,
      content=excluded.content,
      content_text=excluded.content_text
  `).run(
    lesson.slug, lesson.url, lesson.title_en,
    lesson.title_zh_simplified, lesson.title_zh_traditional,
    lesson.hsk_level, JSON.stringify(lesson.categories),
    lesson.audio_url ?? null,
    JSON.stringify(lesson.content), lesson.content_text,
  );
}

export function getMBLesson(slug: string): MBLesson | null {
  const db = getDb();
  ensureMBTable(db);
  const row = db.prepare('SELECT * FROM mb_lessons WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
  if (!row) return null;
  let sentence_timestamps: SentenceTimestamp[] | null = null;
  if (typeof row.sentence_timestamps === 'string' && row.sentence_timestamps) {
    try { sentence_timestamps = JSON.parse(row.sentence_timestamps); } catch { /* ignore */ }
  }
  return {
    ...(row as Omit<MBLesson, 'categories' | 'content' | 'sentence_timestamps'>),
    categories: JSON.parse(row.categories as string),
    content: JSON.parse(row.content as string),
    sentence_timestamps,
  };
}

export function getMBLessonsByHsk(level: number): Omit<MBLesson, 'content'>[] {
  const db = getDb();
  ensureMBTable(db);
  const rows = db.prepare(
    'SELECT slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, content_text FROM mb_lessons WHERE hsk_level = ? ORDER BY slug'
  ).all(level) as Record<string, unknown>[];
  return rows.map(r => ({ ...(r as Omit<MBLesson, 'categories' | 'content'>), categories: JSON.parse(r.categories as string) }));
}

export function getAllMBLessons(): Omit<MBLesson, 'content'>[] {
  const db = getDb();
  ensureMBTable(db);
  const rows = db.prepare(
    'SELECT slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, content_text FROM mb_lessons ORDER BY hsk_level, slug'
  ).all() as Record<string, unknown>[];
  return rows.map(r => ({ ...(r as Omit<MBLesson, 'categories' | 'content'>), categories: JSON.parse(r.categories as string) }));
}

export function getMBLessonCount(): number {
  const db = getDb();
  ensureMBTable(db);
  const row = db.prepare('SELECT COUNT(*) as n FROM mb_lessons').get() as { n: number };
  return row.n;
}

// ── Notes ────────────────────────────────────────────────────────────────────

export const MISTAKE_FOLDER_ID = 'mistake';

export interface NoteFolder {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
}

export interface NoteItem {
  id: string;
  folderId: string;
  zh: string;
  py: string;
  vn: string;
  pos: string;
  sourceLessonId: string | null;
  createdAt: string;
}

function ensureNoteTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_items (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES note_folders(id) ON DELETE CASCADE,
      zh TEXT NOT NULL,
      py TEXT NOT NULL DEFAULT '',
      vn TEXT NOT NULL DEFAULT '',
      pos TEXT NOT NULL DEFAULT '',
      source_lesson_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS note_items_folder ON note_items(folder_id);
  `);
  const exists = db.prepare('SELECT id FROM note_folders WHERE id = ?').get(MISTAKE_FOLDER_ID);
  if (!exists) {
    db.prepare('INSERT INTO note_folders (id, name, is_system, created_at) VALUES (?, ?, 1, ?)').run(
      MISTAKE_FOLDER_ID, 'Mistake', new Date().toISOString()
    );
  }
}

export interface NoteFolderWithCount extends NoteFolder { itemCount: number; }

export function getNoteFolders(): NoteFolderWithCount[] {
  const db = getDb();
  ensureNoteTables(db);
  const rows = db.prepare(`
    SELECT f.id, f.name, f.is_system, f.created_at, COUNT(i.id) as item_count
    FROM note_folders f
    LEFT JOIN note_items i ON i.folder_id = f.id
    GROUP BY f.id
    ORDER BY f.is_system DESC, f.created_at ASC
  `).all() as { id: string; name: string; is_system: number; created_at: string; item_count: number }[];
  return rows.map(r => ({ id: r.id, name: r.name, isSystem: r.is_system === 1, createdAt: r.created_at, itemCount: r.item_count }));
}

export function createNoteFolder(name: string): NoteFolder {
  const db = getDb();
  ensureNoteTables(db);
  const id = Math.random().toString(36).slice(2, 12);
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO note_folders (id, name, is_system, created_at) VALUES (?, ?, 0, ?)').run(id, name.trim(), createdAt);
  return { id, name: name.trim(), isSystem: false, createdAt };
}

export function renameNoteFolder(id: string, name: string): void {
  const db = getDb();
  ensureNoteTables(db);
  db.prepare('UPDATE note_folders SET name = ? WHERE id = ? AND is_system = 0').run(name.trim(), id);
}

export function deleteNoteFolder(id: string): void {
  const db = getDb();
  ensureNoteTables(db);
  db.prepare('DELETE FROM note_folders WHERE id = ? AND is_system = 0').run(id);
}

export function getNoteItems(folderId: string): NoteItem[] {
  const db = getDb();
  ensureNoteTables(db);
  const rows = db.prepare('SELECT id, folder_id, zh, py, vn, pos, source_lesson_id, created_at FROM note_items WHERE folder_id = ? ORDER BY created_at DESC').all(folderId) as { id: string; folder_id: string; zh: string; py: string; vn: string; pos: string; source_lesson_id: string | null; created_at: string }[];
  return rows.map(r => ({ id: r.id, folderId: r.folder_id, zh: r.zh, py: r.py, vn: r.vn, pos: r.pos, sourceLessonId: r.source_lesson_id, createdAt: r.created_at }));
}

export function addNoteItem(item: Omit<NoteItem, 'id' | 'createdAt'>): NoteItem {
  const db = getDb();
  ensureNoteTables(db);
  const existing = db.prepare('SELECT id FROM note_items WHERE folder_id = ? AND zh = ?').get(item.folderId, item.zh);
  if (existing) return getNoteItems(item.folderId).find(i => i.zh === item.zh)!;
  const id = Math.random().toString(36).slice(2, 12);
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO note_items (id, folder_id, zh, py, vn, pos, source_lesson_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, item.folderId, item.zh, item.py, item.vn, item.pos, item.sourceLessonId ?? null, createdAt
  );
  return { ...item, id, createdAt };
}

export function deleteNoteItem(id: string): void {
  const db = getDb();
  ensureNoteTables(db);
  db.prepare('DELETE FROM note_items WHERE id = ?').run(id);
}

export interface SearchResult {
  lessonId: string;
  lessonTitle: string;
  level: string;
  zh: string;
  py: string;
  vn: string;
  pos: string;
}

export interface LevelVocabItem {
  lessonId: string;
  lessonTitle: string;
  zh: string;
  py: string;
  pos: string;
  vn: string;
  ex: { zh: string; vn: string };
}

export function getVocabByLevel(level: string): LevelVocabItem[] {
  const db = getDb();
  const rows = db.prepare('SELECT id, title, data FROM lessons WHERE level = ? ORDER BY created_at ASC').all(level) as { id: string; title: string; data: string }[];
  const items: LevelVocabItem[] = [];
  for (const row of rows) {
    try {
      const d = JSON.parse(row.data);
      for (const v of (d.vocab ?? [])) {
        items.push({ lessonId: row.id, lessonTitle: row.title, zh: v.zh ?? '', py: v.py ?? '', pos: v.pos ?? '', vn: v.vn ?? '', ex: v.ex ?? { zh: '', vn: '' } });
      }
    } catch { /* ignore */ }
  }
  return items;
}

function stripTones(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[üǖǘǚǜ]/g, 'v').toLowerCase();
}

export function searchVocab(query: string, limit = 40): SearchResult[] {
  const db = getDb();
  const rows = db.prepare('SELECT id, title, level, data FROM lessons').all() as { id: string; title: string; level: string; data: string }[];
  const q = query.toLowerCase().trim();
  const qStripped = stripTones(q);
  const results: SearchResult[] = [];
  for (const row of rows) {
    try {
      const d = JSON.parse(row.data);
      for (const v of (d.vocab ?? [])) {
        if (
          (v.zh && v.zh.includes(query)) ||
          (v.py && stripTones(v.py).includes(qStripped)) ||
          (v.vn && v.vn.toLowerCase().includes(q))
        ) {
          results.push({ lessonId: row.id, lessonTitle: row.title, level: row.level, zh: v.zh ?? '', py: v.py ?? '', vn: v.vn ?? '', pos: v.pos ?? '' });
          if (results.length >= limit) return results;
        }
      }
    } catch { /* ignore */ }
  }
  return results;
}
