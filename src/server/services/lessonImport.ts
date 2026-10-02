import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { addSenseExample, findOrCreateSense, findOrCreateWord } from '../repos/words';
import { firstReading, hanChars, stripNotes } from '@/shared/text';
import { ROLE_FROM_BOTU } from '@/shared/hanzi';
import { hskLessonId, lessonTitleToTopic, topicLessonId } from '@/shared/lessons';
import type { Lesson } from '@/types';

/**
 * Writes an uploaded lesson (Excel HSK list, or a .docx analysed by Claude) into the v4
 * tables. A lesson is not stored as such: HSK list sheets mark words with hsk_level,
 * any other lesson marks its words with a topic; grammar becomes grammar_points
 * (source_data 'import') at the lesson's level. Returns the virtual lesson ids.
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

function importVocab(db: Database.Database, draft: LessonDraft, mark: { hsk: number | null; topic: string | null }, senseLevel: number | null) {
  const markWord = db.prepare(`
    UPDATE words SET
      hsk_level = CASE WHEN ? IS NOT NULL AND (hsk_level IS NULL OR ? < hsk_level) THEN ? ELSE hsk_level END,
      topic = COALESCE(topic, ?),
      source = CASE WHEN source = 'mandarin_bean' THEN 'import' ELSE source END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `);
  const ensureChar = db.prepare("INSERT OR IGNORE INTO characters (char, crawl_status) VALUES (?, 'pending')");
  for (const v of draft.vocab) {
    const hanzi = stripNotes(v.zh ?? '');
    if (!hanzi) continue;
    for (const ch of hanChars(hanzi)) ensureChar.run(ch);
    const wordId = findOrCreateWord(db, hanzi, firstReading(stripNotes(v.py ?? '')), 'import');
    markWord.run(mark.hsk, mark.hsk, mark.hsk, mark.topic, wordId);
    const senseId = findOrCreateSense(db, wordId, v.vn ?? '', v.pos ?? '', 'import', senseLevel);
    if (senseId != null && v.ex?.zh) addSenseExample(db, senseId, v.ex.zh, v.ex.vn ?? '');
    saveComponents(db, v.botu);
  }
}

function importGrammar(db: Database.Database, draft: LessonDraft, level: number | null) {
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
  }
}

/** One draft per Excel sheet; sheets named HSK1–HSK6 are HSK lists, others become topics. */
export async function importLessons(drafts: LessonDraft[]): Promise<{ id: string; title: string; vocabCount: number }[]> {
  const db = getDb();
  return db.transaction(() => drafts.map(draft => {
    const listLevel = levelOf(draft.title);
    const lessonLevel = levelOf(draft.level);
    if (listLevel != null) {
      importVocab(db, draft, { hsk: listLevel, topic: null }, listLevel);
      importGrammar(db, draft, listLevel);
      return { id: hskLessonId(listLevel), title: `HSK${listLevel}`, vocabCount: draft.vocab.length };
    }
    const topic = lessonTitleToTopic(draft.title);
    importVocab(db, draft, { hsk: null, topic }, lessonLevel);
    importGrammar(db, draft, lessonLevel);
    return { id: topicLessonId(topic), title: topic, vocabCount: draft.vocab.length };
  }))();
}
