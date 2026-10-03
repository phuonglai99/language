import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { addSenseExample, findOrCreateSense, findOrCreateWord } from '../repos/words';
import { firstReading, hanChars, stripNotes } from '@/shared/text';
import { ROLE_FROM_BOTU } from '@/shared/hanzi';
import { hskLessonId } from '@/shared/lessons';
import { nanoid } from '@/lib/nanoid';
import type { Lesson } from '@/types';

/**
 * Writes uploads into the v4 tables:
 *   - Excel: vocabulary only. Sheets named HSK1–HSK6 mark their words with hsk_level;
 *     other sheets just add the words to the dictionary. No lesson is created.
 *   - .docx (analysed by Claude): a lesson — a lessons row, its words in lesson_words
 *     (with the sense taught) and its grammar in grammar_points + lesson_grammar.
 */
type LessonDraft = Omit<Lesson, 'id' | 'createdAt'>;

const HSK_LIST = /^HSK([1-6])$/;

function levelOf(text: string | undefined): number | null {
  const m = HSK_LIST.exec((text ?? '').trim());
  return m ? Number(m[1]) : null;
}

/** Claude's decomposition, only for characters that have none yet (marked as AI output). */
function saveComponents(db: Database.Database, blocks: LessonDraft['vocab'][number]['botu']) {
  const has = db.prepare('SELECT 1 FROM character_components WHERE char = ? LIMIT 1').pluck();
  const ensureChar = db.prepare("INSERT OR IGNORE INTO characters (char, crawl_status) VALUES (?, 'pending')");
  const insert = db.prepare(`
    INSERT INTO character_components (char, position, component, role, note, source, verified)
    VALUES (?, ?, ?, ?, ?, 'ai', 0)
  `);
  for (const block of blocks ?? []) {
    const char = block.char?.trim();
    if (!char || [...char].length !== 1 || has.get(char)) continue;
    const parts = (block.parts ?? []).filter(p => ROLE_FROM_BOTU[p.t] && [...(p.ph ?? '').trim()].length === 1);
    if (!parts.length) continue;
    ensureChar.run(char);
    parts.forEach((p, i) => {
      ensureChar.run(p.ph.trim());
      insert.run(char, i, p.ph.trim(), ROLE_FROM_BOTU[p.t], p.n?.trim() || null);
    });
  }
}

/** Adds the vocabulary; returns [word_id, sense_id] per item, in order. */
function importVocab(db: Database.Database, draft: LessonDraft, listLevel: number | null, senseLevel: number | null): [number, number | null][] {
  const markWord = db.prepare(`
    UPDATE words SET
      hsk_level = CASE WHEN ? IS NOT NULL AND (hsk_level IS NULL OR ? < hsk_level) THEN ? ELSE hsk_level END,
      source = CASE WHEN source = 'mandarin_bean' THEN 'import' ELSE source END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `);
  const ensureChar = db.prepare("INSERT OR IGNORE INTO characters (char, crawl_status) VALUES (?, 'pending')");
  const out: [number, number | null][] = [];
  for (const v of draft.vocab) {
    const hanzi = stripNotes(v.zh ?? '');
    if (!hanzi) continue;
    for (const ch of hanChars(hanzi)) ensureChar.run(ch);
    const wordId = findOrCreateWord(db, hanzi, firstReading(stripNotes(v.py ?? '')), 'import');
    markWord.run(listLevel, listLevel, listLevel, wordId);
    const senseId = findOrCreateSense(db, wordId, v.vn ?? '', v.pos ?? '', 'import', senseLevel);
    if (senseId != null && v.ex?.zh) addSenseExample(db, senseId, v.ex.zh, v.ex.vn ?? '');
    saveComponents(db, v.botu);
    out.push([wordId, senseId]);
  }
  return out;
}

/** Adds the grammar points; returns their ids, in order. */
function importGrammar(db: Database.Database, draft: LessonDraft, level: number | null): number[] {
  const insertPoint = db.prepare(`
    INSERT INTO grammar_points (source_data, title, title_vi, formula, explanation, hsk_level, comparisons)
    VALUES ('import', ?, ?, ?, ?, ?, ?)
  `);
  const insertExample = db.prepare(
    'INSERT INTO grammar_examples (grammar_id, position, zh, pinyin, vi, note) VALUES (?, ?, ?, NULL, ?, ?)',
  );
  const insertExercise = db.prepare(`
    INSERT INTO grammar_exercises (grammar_id, position, type, question, blank, options, answer, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ids: number[] = [];
  for (const g of draft.grammar ?? []) {
    if (!g.title?.trim()) continue;
    const id = Number(insertPoint.run(
      g.title.trim(), g.titleVn?.trim() || null, g.formula?.trim() || null, g.explanation?.trim() || null,
      level, g.comparisons?.length ? JSON.stringify(g.comparisons) : null,
    ).lastInsertRowid);
    (g.examples ?? []).filter(e => e.zh?.trim()).forEach((e, i) =>
      insertExample.run(id, i, e.zh.trim(), e.vn?.trim() || null, e.note?.trim() || null));
    (g.exercises ?? []).filter(x => x.type === 'fill' || x.type === 'choice').forEach((x, i) =>
      insertExercise.run(id, i, x.type, x.question ?? '', x.blank ?? null,
        x.options ? JSON.stringify(x.options) : null, x.answer ?? '', x.explanation ?? null));
    ids.push(id);
  }
  return ids;
}

/** Excel: one draft per sheet, vocabulary only. Returns the HSK word lists touched. */
export async function importWordLists(drafts: LessonDraft[]): Promise<{ id: string | null; title: string; vocabCount: number }[]> {
  const db = getDb();
  return db.transaction(() => drafts.map(draft => {
    const listLevel = levelOf(draft.title);
    importVocab(db, draft, listLevel, listLevel ?? levelOf(draft.level));
    return { id: listLevel ? hskLessonId(listLevel) : null, title: draft.title, vocabCount: draft.vocab.length };
  }))();
}

/** .docx: one lesson with its words and grammar. The lesson's HSK 2.0 level comes from the draft. */
export async function importLesson(draft: LessonDraft): Promise<{ id: string; title: string; vocabCount: number }> {
  const level = levelOf(draft.level);
  if (level == null) throw new Error(`Không xác định được cấp HSK của bài ("${draft.level}")`);
  const db = getDb();
  return db.transaction(() => {
    const id = nanoid(12);
    db.prepare(`
      INSERT INTO lessons (id, title, subtitle, format, hsk_level, source) VALUES (?, ?, ?, 'hsk2', ?, 'import')
    `).run(id, draft.title.trim(), draft.subtitle?.trim() || null, level);
    const insertWord = db.prepare('INSERT OR IGNORE INTO lesson_words (lesson_id, position, word_id, sense_id) VALUES (?, ?, ?, ?)');
    importVocab(db, draft, null, level).forEach(([wordId, senseId], i) => insertWord.run(id, i, wordId, senseId));
    const insertGrammar = db.prepare('INSERT INTO lesson_grammar (lesson_id, position, grammar_id) VALUES (?, ?, ?)');
    importGrammar(db, draft, level).forEach((grammarId, i) => insertGrammar.run(id, i, grammarId));
    return { id, title: draft.title.trim(), vocabCount: draft.vocab.length };
  })();
}
