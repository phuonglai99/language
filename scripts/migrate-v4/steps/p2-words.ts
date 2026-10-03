/**
 * P2 — Vocabulary: parts_of_speech, words, word_senses, sense_examples, word_characters, words_fts.
 * Mapping: docs/db/README.md §2.2. Plan: docs/migration-plan.md P2.
 *
 * Word identity
 *   Every distinct Mandarin Bean spelling (hanzi + pinyin) is its own word: the source is
 *   CC-CEDICT, which already separates entries such as 钱 qián (money) / 钱 Qián (surname)
 *   and 得 de / 得 dé. Two Mandarin Bean spellings are never merged.
 *   Imported vocab (HSK lists, lesson uploads) and notes attach to the closest Mandarin Bean
 *   spelling of the same hanzi: exact → same letters ignoring case/apostrophes → differs only
 *   by neutral tones (import files often write 东西 "dōngxī" for dōngxi). Otherwise they form
 *   their own word, shared between imports by the same rules.
 *
 * Sense identity
 *   - imported vocab: (word, pos, Vietnamese meaning)
 *   - Mandarin Bean:  (wordId, definition) — a wordId is one dictionary entry with several
 *     contextual definitions.
 *
 * Leaves a TEMP table mb_sense_map(mb_word_id, definition, hanzi, sense_id) for P3.
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { MigrationStep } from '../index';
import {
  firstReading, hanChars, neutralToneVariants, normalizePinyin, pinyinPlain, stripNotes, stripVietnamese,
} from '../../../src/shared/text';
import { PARTS_OF_SPEECH, parsePosLabels } from '../../../src/shared/pos';

/** Unknown labels throw so nothing is silently dropped. */
function parsePos(raw: string | null | undefined): string[] {
  const { codes, unknown } = parsePosLabels(raw);
  if (unknown.length) throw new Error(`Unknown part of speech "${unknown.join(', ')}" in "${raw}"`);
  return codes;
}

interface VocabItem {
  zh?: string;
  py?: string;
  pos?: string;
  vn?: string;
  ex?: { zh?: string; vn?: string };
}

interface MBToken {
  hanzi: string;
  pinyin: string;
  hsk: number | null;
  definition: string | null;
  wordId?: string | null;
}

interface VocabFix { zh: string; py: string; reason: string }

const HSK_LIST = /^HSK([1-6])$/;
const FIXES = path.join(__dirname, '../seed/vocab-fixes.json');

function minLevel(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

const loose = (p: string) => p.toLowerCase().replace(/'/g, '');

interface WordEntry { id: number; hanzi: string; pinyin: string; fromMB: boolean }

class WordStore {
  /** hanzi + toneless pinyin → words (polyphones such as 中 zhōng / zhòng share a bucket). */
  private buckets = new Map<string, WordEntry[]>();
  private insertWord: Database.Statement;
  private getRow: Database.Statement;
  private updateRow: Database.Statement;
  /** Import spellings attached to a Mandarin Bean word with a different spelling. */
  readonly attached = new Map<number, Set<string>>();

  constructor(private db: Database.Database) {
    this.insertWord = db.prepare(`
      INSERT INTO words (hanzi, pinyin, pinyin_plain, hsk_level, source, created_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))
    `);
    this.getRow = db.prepare('SELECT hsk_level, source FROM words WHERE id = ?');
    this.updateRow = db.prepare('UPDATE words SET hsk_level = ?, source = ? WHERE id = ?');
  }

  private bucket(hanzi: string, pinyin: string): WordEntry[] {
    const key = `${hanzi}\u0000${pinyinPlain(pinyin)}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = []));
    return b;
  }

  /** Mandarin Bean spelling: exact match or a new word. */
  mbWord(hanzi: string, pinyin: string): number {
    const b = this.bucket(hanzi, pinyin);
    const hit = b.find(e => e.pinyin === pinyin);
    if (hit) return hit.id;
    const res = this.insertWord.run(hanzi, pinyin, pinyinPlain(pinyin), null, 'mandarin_bean', null);
    const entry = { id: Number(res.lastInsertRowid), hanzi, pinyin, fromMB: true };
    b.push(entry);
    return entry.id;
  }

  /** Imported / note spelling: closest existing word, else a new one. */
  attach(opts: {
    hanzi: string; pinyin: string; hsk: number | null;
    source: 'import' | 'manual'; createdAt: string | null;
  }): number {
    const { hanzi, pinyin } = opts;
    const b = this.bucket(hanzi, pinyin);
    const pick = (pred: (e: WordEntry) => boolean) =>
      b.find(e => e.fromMB && pred(e)) ?? b.find(e => !e.fromMB && pred(e));
    let entry = pick(e => e.pinyin === pinyin)
      ?? pick(e => loose(e.pinyin) === loose(pinyin))
      ?? pick(e => neutralToneVariants(e.pinyin, pinyin));

    if (!entry) {
      const res = this.insertWord.run(hanzi, pinyin, pinyinPlain(pinyin), opts.hsk, opts.source, opts.createdAt);
      entry = { id: Number(res.lastInsertRowid), hanzi, pinyin, fromMB: false };
      b.push(entry);
      return entry.id;
    }

    if (entry.pinyin !== pinyin) {
      if (!this.attached.has(entry.id)) this.attached.set(entry.id, new Set());
      this.attached.get(entry.id)!.add(pinyin);
    }
    const cur = this.getRow.get(entry.id) as { hsk_level: number | null; source: string };
    // A word that appears in an imported list counts as imported, even if a reading passage introduced it.
    const source = cur.source === 'mandarin_bean' && opts.source === 'import' ? 'import' : cur.source;
    this.updateRow.run(minLevel(cur.hsk_level, opts.hsk), source, entry.id);
    return entry.id;
  }

  toneConflicts(): string[] {
    const out: string[] = [];
    for (const b of this.buckets.values()) {
      if (b.length < 2) continue;
      out.push(`${b[0].hanzi}: ${b.map(e => `${e.pinyin}${e.fromMB ? '' : '[import]'}`).join(' | ')}`);
    }
    return out;
  }
}

class SenseStore {
  private byKey = new Map<string, number>();
  private nextPos = new Map<number, number>();
  private insertSense: Database.Statement;
  private updateLevel: Database.Statement;
  private getLevel: Database.Statement;
  private insertExample: Database.Statement;
  private exampleKeys = new Set<string>();
  private examplePos = new Map<number, number>();

  constructor(db: Database.Database) {
    this.insertSense = db.prepare(`
      INSERT INTO word_senses (word_id, position, pos, meaning_vi, meaning_en, hsk_level, source, mb_word_id, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    this.updateLevel = db.prepare('UPDATE word_senses SET hsk_level = ? WHERE id = ?');
    this.getLevel = db.prepare('SELECT hsk_level FROM word_senses WHERE id = ?');
    this.insertExample = db.prepare(
      'INSERT INTO sense_examples (sense_id, position, zh, vi) VALUES (?, ?, ?, ?)',
    );
  }

  has(wordId: number, key: string) {
    return this.byKey.has(`${wordId}\u0000${key}`);
  }

  upsert(wordId: number, key: string, row: {
    pos: string | null; vi: string | null; en: string | null; hsk: number | null;
    source: string; mbWordId: string | null;
  }): number {
    const full = `${wordId}\u0000${key}`;
    let id = this.byKey.get(full);
    if (id == null) {
      const position = this.nextPos.get(wordId) ?? 0;
      this.nextPos.set(wordId, position + 1);
      const res = this.insertSense.run(wordId, position, row.pos, row.vi, row.en, row.hsk, row.source, row.mbWordId);
      id = Number(res.lastInsertRowid);
      this.byKey.set(full, id);
    } else if (row.hsk != null) {
      const cur = (this.getLevel.get(id) as { hsk_level: number | null }).hsk_level;
      const level = minLevel(cur, row.hsk);
      if (level !== cur) this.updateLevel.run(level, id);
    }
    return id;
  }

  addExample(senseId: number, zh: string | undefined, vi: string | undefined) {
    const text = zh?.trim();
    if (!text) return;
    const k = `${senseId}\u0000${text}`;
    if (this.exampleKeys.has(k)) return;
    this.exampleKeys.add(k);
    const position = this.examplePos.get(senseId) ?? 0;
    this.examplePos.set(senseId, position + 1);
    this.insertExample.run(senseId, position, text, vi?.trim() || null);
  }
}

export const p2Words: MigrationStep = {
  name: 'P2 words',
  run({ old, db, log }) {
    // ── P2.1 parts_of_speech ─────────────────────────────────────────────────
    const insertPos = db.prepare('INSERT INTO parts_of_speech (code, name_vi, name_zh) VALUES (?, ?, ?)');
    for (const row of PARTS_OF_SPEECH) insertPos.run(...row);

    const words = new WordStore(db);
    const senses = new SenseStore(db);
    const count = (sql: string) => db.prepare(sql).pluck().get() as number;

    // ── P2.4 Mandarin Bean first: every dictionary spelling becomes a word ──
    db.exec(`
      CREATE TEMP TABLE mb_sense_map (
        mb_word_id TEXT NOT NULL, definition TEXT NOT NULL, hanzi TEXT NOT NULL, sense_id INTEGER NOT NULL,
        PRIMARY KEY (mb_word_id, definition, hanzi)
      )
    `);
    const insertMap = db.prepare('INSERT OR IGNORE INTO mb_sense_map VALUES (?, ?, ?, ?)');
    const contents = old.prepare('SELECT content FROM mb_lessons').pluck().all() as string[];
    let tokenCount = 0;
    for (const content of contents) {
      for (const para of JSON.parse(content) as MBToken[][]) {
        for (const t of para) {
          if (!t.wordId || !t.definition) continue;
          tokenCount++;
          const hanzi = t.hanzi.trim();
          // words.hsk_level is the HSK 2.0 list level (imports only). Mandarin Bean tags tokens on
          // the HSK 3.0 scale (it has level 7), so its level stays on the sense.
          const wordId = words.mbWord(hanzi, normalizePinyin(hanzi, t.pinyin));
          const senseId = senses.upsert(wordId, `mb\u0000${t.wordId}\u0000${t.definition}`, {
            pos: null, vi: null, en: t.definition.trim(), hsk: t.hsk ?? null,
            source: 'mandarin_bean', mbWordId: t.wordId,
          });
          insertMap.run(t.wordId, t.definition, t.hanzi.trim(), senseId);
        }
      }
    }
    log(`mandarin bean: ${tokenCount} tokens → ${count('SELECT COUNT(*) FROM words')} words, ${
      count('SELECT COUNT(*) FROM mb_sense_map')} (wordId, definition, hanzi) mappings`);

    // ── P2.2 / P2.3 imported lessons: HSK lists first, then the other lessons ─
    const fixes = JSON.parse(fs.readFileSync(FIXES, 'utf8')) as VocabFix[];
    const fixByZh = new Map(fixes.map(f => [f.zh, f]));
    const usedFixes = new Set<string>();
    const cleaned: string[] = [];

    const lessons = old.prepare('SELECT id, title, level, created_at, data FROM lessons').all() as
      { id: string; title: string; level: string | null; created_at: string; data: string }[];
    lessons.sort((a, b) => Number(!HSK_LIST.test(a.title)) - Number(!HSK_LIST.test(b.title)));

    // HSK list sheets are vocabulary only (words.hsk_level). Every other old lesson was an
    // uploaded lesson and becomes a lessons row (same id) with its words in lesson_words.
    const insertLesson = db.prepare(`
      INSERT INTO lessons (id, title, subtitle, format, hsk_level, source, created_at)
      VALUES (?, ?, ?, 'hsk2', ?, 'import', ?)
    `);
    const insertLessonWord = db.prepare(
      'INSERT OR IGNORE INTO lesson_words (lesson_id, position, word_id, sense_id) VALUES (?, ?, ?, ?)',
    );
    let vocabRows = 0;
    const lessonSummary: string[] = [];
    for (const lesson of lessons) {
      const listLevel = HSK_LIST.exec(lesson.title);
      const hsk = listLevel ? Number(listLevel[1]) : null;
      const lessonLevel = /^HSK([1-6])$/.exec(lesson.level ?? '');
      const vocab = (JSON.parse(lesson.data) as { vocab?: VocabItem[] }).vocab ?? [];
      const isLesson = !listLevel;
      if (isLesson) {
        if (!lessonLevel) throw new Error(`Lesson "${lesson.title}" has no HSK level (${lesson.level})`);
        const subtitle = (JSON.parse(lesson.data) as { subtitle?: string }).subtitle ?? null;
        insertLesson.run(lesson.id, lesson.title, subtitle, Number(lessonLevel[1]), lesson.created_at);
      }
      let position = 0;
      for (const v of vocab) {
        const rawZh = v.zh?.trim();
        if (!rawZh) continue;
        vocabRows++;
        const fix = fixByZh.get(rawZh);
        if (fix) usedFixes.add(fix.zh);
        const rawPy = (fix?.py ?? v.py ?? '').trim();
        const hanzi = stripNotes(rawZh);
        const cleanPy = firstReading(stripNotes(rawPy));
        if (hanzi !== rawZh || cleanPy !== rawPy) cleaned.push(`${rawZh} [${v.py}] → ${hanzi} [${cleanPy}]`);

        const wordId = words.attach({
          hanzi, pinyin: normalizePinyin(hanzi, cleanPy), hsk,
          source: 'import', createdAt: lesson.created_at,
        });
        const vi = v.vn?.trim() || null;
        const senseLevel = hsk ?? (lessonLevel ? Number(lessonLevel[1]) : null);
        const posCodes = parsePos(v.pos);
        let taught: number | null = null;
        for (const pos of posCodes.length ? posCodes : [null]) {
          const senseId = senses.upsert(wordId, `vi\u0000${pos}\u0000${(vi ?? '').toLowerCase()}`, {
            pos, vi, en: null, hsk: senseLevel, source: 'import', mbWordId: null,
          });
          senses.addExample(senseId, v.ex?.zh, v.ex?.vn);
          taught ??= senseId;
        }
        if (isLesson) insertLessonWord.run(lesson.id, position++, wordId, taught);
      }
      if (isLesson) lessonSummary.push(`${lesson.title} (HSK${lessonLevel![1]}, ${position} từ)`);
    }
    const unusedFixes = fixes.filter(f => !usedFixes.has(f.zh));
    if (unusedFixes.length) throw new Error(`vocab-fixes.json entries matched nothing: ${unusedFixes.map(f => f.zh).join(', ')}`);
    log(`imported vocab: ${vocabRows} rows; fixes applied: ${fixes.length}`);
    log(`lessons: ${lessonSummary.join('; ')}`);

    // ── P2.8 note_items ──────────────────────────────────────────────────────
    const notes = old.prepare('SELECT zh, py, vn, pos, created_at FROM note_items').all() as
      { zh: string; py: string; vn: string; pos: string; created_at: string }[];
    const wordsBeforeNotes = count('SELECT COUNT(*) FROM words');
    for (const n of notes) {
      const hanzi = n.zh.trim();
      const wordId = words.attach({
        hanzi, pinyin: normalizePinyin(hanzi, n.py), hsk: null,
        source: 'manual', createdAt: n.created_at,
      });
      const vi = n.vn?.trim() || null;
      // A note usually restates an existing sense ("bạn bè"); add one only when nothing matches.
      const existing = db.prepare(
        'SELECT 1 FROM word_senses WHERE word_id = ? AND lower(meaning_vi) = lower(?)',
      ).get(wordId, vi);
      if (!existing && vi) {
        const codes = parsePos(n.pos);
        for (const pos of codes.length ? codes : [null]) {
          senses.upsert(wordId, `vi\u0000${pos}\u0000${vi.toLowerCase()}`, {
            pos, vi, en: null, hsk: null, source: 'manual', mbWordId: null,
          });
        }
      }
    }
    log(`notes: ${notes.length} items → ${count('SELECT COUNT(*) FROM words') - wordsBeforeNotes} new words`);

    // ── P2.7 word_characters ─────────────────────────────────────────────────
    const allWords = db.prepare('SELECT id, hanzi FROM words').all() as { id: number; hanzi: string }[];
    const insertWc = db.prepare('INSERT INTO word_characters (word_id, position, char) VALUES (?, ?, ?)');
    for (const w of allWords) hanChars(w.hanzi).forEach((ch, i) => insertWc.run(w.id, i, ch));

    // ── P2.9 han_viet: only when every character has a single reading ────────
    db.exec(`
      UPDATE words SET han_viet = (
        SELECT CASE WHEN COUNT(*) = SUM(c.han_viet IS NOT NULL AND c.han_viet <> '' AND instr(c.han_viet, '.') = 0)
                    THEN group_concat(c.han_viet, ' ') END
        FROM (SELECT wc.position, c.han_viet FROM word_characters wc
              JOIN characters c ON c.char = wc.char
              WHERE wc.word_id = words.id ORDER BY wc.position) c
      )
      WHERE EXISTS (SELECT 1 FROM word_characters WHERE word_id = words.id)
    `);

    // ── P2.10 words_fts ──────────────────────────────────────────────────────
    const ftsRows = db.prepare(`
      SELECT w.id, w.hanzi, w.pinyin_plain, w.han_viet,
             group_concat(COALESCE(s.meaning_vi, '') || ' ' || COALESCE(s.meaning_en, ''), ' | ') AS meanings
      FROM words w LEFT JOIN word_senses s ON s.word_id = w.id
      GROUP BY w.id
    `).all() as { id: number; hanzi: string; pinyin_plain: string; han_viet: string | null; meanings: string | null }[];
    const insertFts = db.prepare(
      'INSERT INTO words_fts (rowid, hanzi, pinyin_plain, han_viet, meanings, meanings_plain) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const r of ftsRows) {
      const meanings = (r.meanings ?? '').replace(/\s+/g, ' ').trim();
      insertFts.run(r.id, r.hanzi, r.pinyin_plain, r.han_viet ?? '', meanings, stripVietnamese(meanings));
    }

    // ── Summary + P2.11 review lists ─────────────────────────────────────────
    log(`words: ${count('SELECT COUNT(*) FROM words')} (import ${count("SELECT COUNT(*) FROM words WHERE source='import'")}, mandarin_bean ${count("SELECT COUNT(*) FROM words WHERE source='mandarin_bean'")}, manual ${count("SELECT COUNT(*) FROM words WHERE source='manual'")})`);
    log(`hsk_level: ${(db.prepare('SELECT hsk_level, COUNT(*) AS n FROM words GROUP BY hsk_level').all() as { hsk_level: number | null; n: number }[]).map(r => `${r.hsk_level ?? '-'}=${r.n}`).join(' ')}`);
    log(`word_senses: ${count('SELECT COUNT(*) FROM word_senses')} (vi ${count('SELECT COUNT(*) FROM word_senses WHERE meaning_vi IS NOT NULL')}, en ${count('SELECT COUNT(*) FROM word_senses WHERE meaning_en IS NOT NULL')}, pos NULL ${count('SELECT COUNT(*) FROM word_senses WHERE pos IS NULL')})`);
    log(`sense_examples: ${count('SELECT COUNT(*) FROM sense_examples')}`);
    log(`word_characters: ${count('SELECT COUNT(*) FROM word_characters')}; han_viet filled: ${count('SELECT COUNT(*) FROM words WHERE han_viet IS NOT NULL')}`);
    log(`REVIEW import cells cleaned (${cleaned.length}): ${cleaned.join('; ')}`);
    const attached = [...words.attached].map(([id, set]) => {
      const w = db.prepare('SELECT hanzi, pinyin FROM words WHERE id = ?').get(id) as { hanzi: string; pinyin: string };
      return `${w.hanzi} ${[...set].join('/')} → ${w.pinyin}`;
    });
    log(`REVIEW import spellings attached to a different dictionary spelling (${attached.length}): ${attached.join('; ')}`);
    const conflicts = words.toneConflicts();
    log(`REVIEW same hanzi + toneless pinyin, kept as separate words (${conflicts.length}): ${conflicts.join('; ')}`);

    const missingChars = count(
      'SELECT COUNT(*) FROM word_characters wc LEFT JOIN characters c ON c.char = wc.char WHERE c.char IS NULL',
    );
    if (missingChars) throw new Error(`${missingChars} word characters are missing from characters`);
  },
};
