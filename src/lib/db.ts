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
    ensureKanjiClaudeColumn(_db);
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
  /** Claude Ý/âm/độc decomposition. Independent of Hanzii `radical`. */
  botu_claude: string | null;
}

let _claudeBotuBackfilled = false;

function kanjiTableExists(db: Database.Database): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kanji'").get();
}

function ensureKanjiClaudeColumn(db: Database.Database): void {
  if (!kanjiTableExists(db)) return;
  try { db.exec('ALTER TABLE kanji ADD COLUMN botu TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE kanji ADD COLUMN botu_claude TEXT'); } catch { /* already exists */ }
  if (_claudeBotuBackfilled) return;
  _claudeBotuBackfilled = true;
  backfillKanjiBotuClaude(db);
}

/**
 * Seed `botu_claude` from existing Claude output: leftover `kanji.botu` rows,
 * then per-character blocks inside lesson vocab JSON. Never overwrites a
 * value already in `botu_claude` — that's the column to clean later.
 */
function backfillKanjiBotuClaude(db: Database.Database): void {
  db.exec(`
    UPDATE kanji SET botu_claude = botu
    WHERE (botu_claude IS NULL OR botu_claude = '')
      AND botu IS NOT NULL AND botu != '' AND botu != 'null'
  `);

  const update = db.prepare(
    `UPDATE kanji SET botu_claude = ?
     WHERE char = ? AND (botu_claude IS NULL OR botu_claude = '')`
  );
  const lessons = db.prepare('SELECT data FROM lessons').all() as { data: string }[];
  db.transaction(() => {
    for (const row of lessons) {
      let vocab: { botu?: { char?: string; parts?: unknown }[] }[] = [];
      try { vocab = (JSON.parse(row.data) as { vocab?: typeof vocab }).vocab ?? []; } catch { continue; }
      for (const v of vocab) {
        for (const block of v.botu ?? []) {
          const ch = block.char?.trim();
          if (!ch || !Array.isArray(block.parts) || block.parts.length === 0) continue;
          update.run(JSON.stringify(block.parts), ch);
        }
      }
    }
  })();
}

export function getKanji(char: string): KanjiRow | null {
  const db = getDb();
  ensureKanjiClaudeColumn(db);
  if (!kanjiTableExists(db)) return null;
  const row = db.prepare(
    'SELECT char, cn_vi, pinyin, strokes, radical, lucthu, hinhthai, netbut, popular, means_tdpt, means_tg, means_tdtd, strokes_svg, botu, botu_claude FROM kanji WHERE char = ?'
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
      botu TEXT, botu_claude TEXT, crawled_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kanji_tmp_check (x INTEGER);
    DROP TABLE IF EXISTS kanji_tmp_check;
  `);
  ensureKanjiClaudeColumn(db);
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

/** Writes Claude decomposition into `botu_claude`. Does not touch Hanzii `radical`. */
export function updateKanjiBotu(char: string, botu: import('@/types').BotuPart[]): void {
  const db = getDb();
  ensureKanjiClaudeColumn(db);
  const json = JSON.stringify(botu);
  db.prepare(
    `INSERT INTO kanji (char, botu_claude, crawled_at) VALUES (?, ?, ?)
     ON CONFLICT(char) DO UPDATE SET botu_claude=excluded.botu_claude`
  ).run(char, json, new Date().toISOString());
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

/** DDL is idempotent but not free; run it once per connection. */
const mbSchemaReady = new WeakSet<Database.Database>();

function ensureMBTable(db: Database.Database) {
  if (mbSchemaReady.has(db)) {
    // Counts may still be missing: scripts write rows behind our back.
    backfillMBCounts(db);
    return;
  }
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
      sentence_timestamps TEXT,
      vocab_count INTEGER,
      sentence_count INTEGER
    );
    CREATE INDEX IF NOT EXISTS mb_lessons_hsk ON mb_lessons(hsk_level);
  `);
  for (const col of ['sentence_timestamps TEXT', 'vocab_count INTEGER', 'sentence_count INTEGER']) {
    try { db.exec(`ALTER TABLE mb_lessons ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Partial index keeps the "any rows missing counts?" probe O(1) instead of a
  // full table scan (each row carries ~17KB of content JSON).
  db.exec('CREATE INDEX IF NOT EXISTS mb_lessons_missing_counts ON mb_lessons(slug) WHERE vocab_count IS NULL');
  mbSchemaReady.add(db);
  backfillMBCounts(db);
}

/**
 * List views only need per-lesson vocab/sentence counts, which used to be
 * derived by parsing every lesson's content JSON on every request. The counts
 * are cached in columns instead; rows written by the crawler/import scripts
 * arrive with NULL counts and are filled in here, once.
 */
function backfillMBCounts(db: Database.Database) {
  const pending = db.prepare('SELECT slug, content FROM mb_lessons WHERE vocab_count IS NULL').all() as { slug: string; content: string }[];
  if (pending.length === 0) return;
  const update = db.prepare('UPDATE mb_lessons SET vocab_count = ?, sentence_count = ? WHERE slug = ?');
  db.transaction(() => {
    for (const row of pending) {
      let content: MBLessonWord[][] = [];
      try { content = JSON.parse(row.content) as MBLessonWord[][]; } catch { /* keep empty */ }
      update.run(countLessonVocab(content), countContentSentences(content), row.slug);
    }
  })();
}

export function saveMBLesson(lesson: MBLesson): void {
  const db = getDb();
  ensureMBTable(db);
  db.prepare(`
    INSERT INTO mb_lessons
      (slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, content, content_text, vocab_count, sentence_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      url=excluded.url,
      title_en=excluded.title_en,
      title_zh_simplified=excluded.title_zh_simplified,
      title_zh_traditional=excluded.title_zh_traditional,
      hsk_level=excluded.hsk_level,
      categories=excluded.categories,
      audio_url=excluded.audio_url,
      content=excluded.content,
      content_text=excluded.content_text,
      vocab_count=excluded.vocab_count,
      sentence_count=excluded.sentence_count
  `).run(
    lesson.slug, lesson.url, lesson.title_en,
    lesson.title_zh_simplified, lesson.title_zh_traditional,
    lesson.hsk_level, JSON.stringify(lesson.categories),
    lesson.audio_url ?? null,
    JSON.stringify(lesson.content), lesson.content_text,
    countLessonVocab(lesson.content), countContentSentences(lesson.content),
  );
}

export function getMBLesson(slug: string): MBLesson | null {
  const db = getDb();
  ensureMBTable(db);
  const row = db.prepare(
    'SELECT slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, content, content_text, sentence_timestamps FROM mb_lessons WHERE slug = ?'
  ).get(slug) as Record<string, unknown> | undefined;
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

/** Card-sized lesson: no `content` / `content_text`, so lists stay cheap. */
export type MBLessonListItem = Omit<MBLesson, 'content' | 'content_text' | 'sentence_timestamps'> & { vocabCount: number };

const MB_LIST_COLUMNS =
  'slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level, categories, audio_url, COALESCE(vocab_count, 0) AS vocabCount';

function mapMBListRow(r: Record<string, unknown>): MBLessonListItem {
  const { categories, ...rest } = r;
  return {
    ...(rest as Omit<MBLessonListItem, 'categories'>),
    categories: JSON.parse(categories as string),
  };
}

export interface MBLessonFilters {
  /** HSK level, or null/undefined for every level. */
  hsk?: number | null;
  /** Free-text query matched against titles and categories. */
  q?: string | null;
  /** 'checked' | 'uncheck' | 'unchecked' — alignment review status. */
  status?: string | null;
  /** Also match `q` against the lesson body (dictation search). */
  searchContentText?: boolean;
}

/**
 * Filters in SQL rather than in JS so a filtered list never loads the rows it
 * is about to discard.
 */
export function queryMBLessons(filters: MBLessonFilters = {}): MBLessonListItem[] {
  const db = getDb();
  ensureMBTable(db);

  const where: string[] = [];
  const args: unknown[] = [];

  if (filters.hsk != null && Number.isFinite(filters.hsk)) {
    where.push('hsk_level = ?');
    args.push(filters.hsk);
  }

  const status = filters.status?.toLowerCase();
  if (status === 'checked') {
    where.push(`categories LIKE '%"Checked"%'`);
  } else if (status === 'uncheck' || status === 'unchecked') {
    where.push(`categories LIKE '%"Uncheck"%'`);
  }

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    const fields = ['title_en', 'title_zh_simplified', 'categories'];
    if (filters.searchContentText) fields.push('content_text');
    where.push(`(${fields.map(f => `${f} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    args.push(...fields.map(() => like));
  }

  const rows = db.prepare(
    `SELECT ${MB_LIST_COLUMNS} FROM mb_lessons${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY hsk_level, slug`
  ).all(...args) as Record<string, unknown>[];
  return rows.map(mapMBListRow);
}

export function getMBLessonsByHsk(level: number): MBLessonListItem[] {
  return queryMBLessons({ hsk: level });
}

export type MBLessonNavItem = {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
};

export interface MBLessonNeighbors {
  prev: MBLessonNavItem | null;
  next: MBLessonNavItem | null;
  index: number;
  total: number;
}

/** Previous/next lesson in the same HSK level, ordered like the reading list. */
export function getAdjacentMBLessons(slug: string, hskLevel: number): MBLessonNeighbors {
  const db = getDb();
  ensureMBTable(db);
  const rows = db.prepare(
    'SELECT slug, title_en, title_zh_simplified FROM mb_lessons WHERE hsk_level = ? ORDER BY slug',
  ).all(hskLevel) as MBLessonNavItem[];
  const i = rows.findIndex(r => r.slug === slug);
  if (i < 0) return { prev: null, next: null, index: 0, total: rows.length };
  return {
    prev: i > 0 ? rows[i - 1] : null,
    next: i < rows.length - 1 ? rows[i + 1] : null,
    index: i + 1,
    total: rows.length,
  };
}

export function getAllMBLessons(): MBLessonListItem[] {
  return queryMBLessons();
}

export interface MBLessonCounts {
  total: number;
  byHsk: Record<number, number>;
}

/** Counts only — what the sidebar needs, without shipping 700+ lesson rows. */
export function getMBLessonCounts(): MBLessonCounts {
  const db = getDb();
  ensureMBTable(db);
  const rows = db.prepare(
    'SELECT hsk_level, COUNT(*) AS n FROM mb_lessons GROUP BY hsk_level ORDER BY hsk_level'
  ).all() as { hsk_level: number; n: number }[];
  const byHsk: Record<number, number> = {};
  let total = 0;
  for (const r of rows) {
    byHsk[r.hsk_level] = r.n;
    total += r.n;
  }
  return { total, byHsk };
}

export function getMBLessonCount(): number {
  const db = getDb();
  ensureMBTable(db);
  const row = db.prepare('SELECT COUNT(*) as n FROM mb_lessons').get() as { n: number };
  return row.n;
}

export interface MBAlignSummary {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
  hsk_level: number;
  audio_url: string | null;
  sentenceCount: number;
  unmatchedCount: number;
  hasTimestamps: boolean;
}

const MB_WORD_PUNCT = /^[\s，。？！、：；""''「」【】（）…—·]+$/;

export function countLessonVocab(content: MBLessonWord[][]): number {
  const seen = new Set<string>();
  for (const para of content) {
    for (const w of para) {
      const h = (w.hanzi ?? '').trim();
      if (!h || MB_WORD_PUNCT.test(h)) continue;
      seen.add(h);
    }
  }
  return seen.size;
}

function countContentSentences(content: MBLessonWord[][]): number {
  return content.filter(para =>
    para.some(w => w.hanzi.trim() && !/^[\s，。？！、：；""''「」【】（）…—·]+$/.test(w.hanzi)),
  ).length;
}

export function getMBAlignSummaries(): MBAlignSummary[] {
  const db = getDb();
  ensureMBTable(db);
  const rows = db.prepare(
    'SELECT slug, title_en, title_zh_simplified, hsk_level, audio_url, COALESCE(sentence_count, 0) AS sentence_count, sentence_timestamps FROM mb_lessons ORDER BY hsk_level, slug',
  ).all() as Record<string, unknown>[];

  return rows.map(r => {
    let timestamps: SentenceTimestamp[] | null = null;
    if (typeof r.sentence_timestamps === 'string' && r.sentence_timestamps) {
      try { timestamps = JSON.parse(r.sentence_timestamps); } catch { /* ignore */ }
    }
    const hasTimestamps = Array.isArray(timestamps);
    let sentenceCount = 0;
    let unmatchedCount = 0;
    if (hasTimestamps && timestamps) {
      sentenceCount = timestamps.length;
      unmatchedCount = timestamps.filter(t => t.start == null || t.end == null).length;
    } else {
      sentenceCount = r.sentence_count as number;
      unmatchedCount = sentenceCount;
    }
    return {
      slug: r.slug as string,
      title_en: r.title_en as string,
      title_zh_simplified: r.title_zh_simplified as string,
      hsk_level: r.hsk_level as number,
      audio_url: (r.audio_url as string) ?? null,
      sentenceCount,
      unmatchedCount,
      hasTimestamps,
    };
  });
}

export function saveMBLessonAlignment(
  slug: string,
  timestamps: SentenceTimestamp[],
  content?: MBLessonWord[][],
): boolean {
  const db = getDb();
  ensureMBTable(db);
  const exists = db.prepare('SELECT slug FROM mb_lessons WHERE slug = ?').get(slug);
  if (!exists) return false;
  const tsJson = JSON.stringify(timestamps);
  if (content) {
    db.prepare('UPDATE mb_lessons SET sentence_timestamps = ?, content = ?, vocab_count = ?, sentence_count = ? WHERE slug = ?')
      .run(tsJson, JSON.stringify(content), countLessonVocab(content), countContentSentences(content), slug);
  } else {
    db.prepare('UPDATE mb_lessons SET sentence_timestamps = ? WHERE slug = ?')
      .run(tsJson, slug);
  }
  return true;
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

export interface HanziiGrammarRow {
  id: number;
  uid: string | null;
  title: string;
  use_for: string | null;
  keywords: string | null;
  level: string | null;
  hsk: string;
  contents: string;
  examples: string | null;
}

function ensureHanziiGrammarTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hanzii_grammar (
      id INTEGER PRIMARY KEY,
      uid TEXT,
      title TEXT NOT NULL,
      use_for TEXT,
      keywords TEXT,
      level TEXT,
      hsk TEXT,
      contents TEXT NOT NULL,
      examples TEXT,
      raw TEXT,
      crawled_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS hanzii_grammar_hsk ON hanzii_grammar(hsk);
  `);
}

const EX_PINYIN_RE = /^[-•]\s*(.+?)\s*\/([^/]+)\/\s*(.*)$/;
const EX_LINE_RE = /^[-•]\s+(.+)$/;

function parseHanziiExamples(contents: string[]): { zh: string; vn: string; note?: string }[] {
  const examples: { zh: string; vn: string; note?: string }[] = [];
  let inExamples = false;
  for (const raw of contents) {
    const line = raw.trim();
    if (/^ví dụ\s*[:：.]?/i.test(line) || /^vd\s*[:：]/i.test(line)) {
      inExamples = true;
      continue;
    }
    const withPy = line.match(EX_PINYIN_RE);
    if (withPy) {
      examples.push({ zh: withPy[1].trim(), vn: withPy[3].trim(), note: withPy[2].trim() });
      continue;
    }
    if (inExamples) {
      const m = line.match(EX_LINE_RE);
      if (m && /^[\u4e00-\u9fff]/.test(m[1].trim())) {
        const rest = m[1].trim();
        const split = rest.match(/^([\u4e00-\u9fff0-9A-Za-z，。！？、：；“”‘’「」【】（）…—·\s]+)\s+(.+)$/);
        if (split && /[\u4e00-\u9fff]/.test(split[1]) && /[A-Za-zÀ-ỹ]/.test(split[2])) {
          examples.push({ zh: split[1].trim(), vn: split[2].trim() });
        } else {
          examples.push({ zh: rest, vn: '' });
        }
        continue;
      }
      inExamples = false;
    }
  }
  return examples;
}

function rowToHanziiGrammar(row: HanziiGrammarRow): import('@/types').HanziiGrammar {
  const contents: string[] = row.contents ? JSON.parse(row.contents) : [];
  const storedExamples = row.examples ? JSON.parse(row.examples) as unknown[] : [];
  const parsed = parseHanziiExamples(contents);
  const examples = parsed.length > 0
    ? parsed
    : storedExamples.filter(e => e && typeof e === 'object').map(e => {
        const x = e as Record<string, string>;
        return { zh: x.zh ?? x.chinese ?? '', vn: x.vn ?? x.mean ?? x.vi ?? '', note: x.note || x.pinyin };
      });
  const explLines = contents.filter(line => {
    const t = line.trim();
    if (/^ví dụ\s*[:：.]?/i.test(t) || /^vd\s*[:：]/i.test(t)) return false;
    if (EX_PINYIN_RE.test(t) || (EX_LINE_RE.test(t) && /[\u4e00-\u9fff]/.test(t))) return false;
    return true;
  });
  const formulaFromContents = contents.find(l => /cấu trúc\s*[:：]/i.test(l))?.trim();
  return {
    id: row.id,
    title: row.keywords || row.title,
    titleVn: row.title,
    formula: row.keywords || formulaFromContents || row.use_for || '',
    explanation: explLines.join('\n'),
    examples,
    level: row.level ?? '',
    hsk: row.hsk,
    keywords: row.keywords ?? '',
    useFor: row.use_for ?? '',
  };
}

export function getHanziiGrammarByHsk(hsk: string): import('@/types').HanziiGrammar[] {
  const db = getDb();
  ensureHanziiGrammarTable(db);
  const rows = db.prepare(
    'SELECT id, uid, title, use_for, keywords, level, hsk, contents, examples FROM hanzii_grammar WHERE hsk = ? ORDER BY id ASC'
  ).all(hsk) as HanziiGrammarRow[];
  return rows.map(rowToHanziiGrammar);
}

export function getHanziiGrammarCounts(): { hsk: string; count: number }[] {
  const db = getDb();
  ensureHanziiGrammarTable(db);
  return db.prepare(
    'SELECT hsk, COUNT(*) as count FROM hanzii_grammar GROUP BY hsk ORDER BY hsk'
  ).all() as { hsk: string; count: number }[];
}

export function getHanziiGrammarCount(): number {
  const db = getDb();
  ensureHanziiGrammarTable(db);
  const row = db.prepare('SELECT COUNT(*) as n FROM hanzii_grammar').get() as { n: number };
  return row.n;
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
