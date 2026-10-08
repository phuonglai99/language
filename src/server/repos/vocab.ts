import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { hskLessonId, parseLessonId } from '@/shared/lessons';
import { posNameVi } from '@/shared/pos';
import { BOTU_FROM_ROLE } from '@/shared/hanzi';
import { hanChars, pinyinPlain, stripVietnamese } from '@/shared/text';
import type { GrammarPoint, Lesson, VocabCard } from '@/types';
import type { LessonMetaDTO, LevelVocabItemDTO, SearchResultDTO } from '@/types/api';

/**
 * Vocabulary study lists, returned in the pre-v4 Lesson shape so the lesson screens
 * (flashcards, quiz, match) work unchanged:
 *   hsk-<n>  the HSK 2.0 word list of level n (words.hsk_level) — vocabulary only
 *   <id>     an uploaded lesson (lessons + lesson_words + lesson_grammar)
 */

interface WordCardRow {
  id: number; hanzi: string; pinyin: string; pinyin_plain: string; hsk_level: number | null; created_at: string;
  sense_id: number | null; pos: string | null; meaning: string | null; ex_zh: string | null; ex_vi: string | null;
}

const CARD_COLUMNS = `
  w.id, w.hanzi, w.pinyin, w.pinyin_plain, w.hsk_level, w.created_at,
  s.id AS sense_id, s.pos, COALESCE(NULLIF(trim(s.meaning_vi), ''), s.meaning_en) AS meaning, e.zh AS ex_zh, e.vi AS ex_vi
`;

/** Word lists: the word's first Vietnamese sense (else first sense) and its first example. */
const LIST_CARD_SELECT = `
  SELECT ${CARD_COLUMNS}
  FROM words w
  LEFT JOIN word_senses s ON s.id = (
    SELECT id FROM word_senses WHERE word_id = w.id ORDER BY NULLIF(trim(meaning_vi), '') IS NULL, position LIMIT 1
  )
  LEFT JOIN sense_examples e ON e.sense_id = s.id AND e.position = (
    SELECT MIN(position) FROM sense_examples WHERE sense_id = s.id
  )
`;

/**
 * Lessons: the sense taught in the lesson (lesson_words.sense_id) and its latest example —
 * a lesson's example is appended to the sense when the lesson is imported.
 */
const LESSON_CARD_SELECT = `
  SELECT ${CARD_COLUMNS}
  FROM lesson_words lw
  JOIN words w ON w.id = lw.word_id
  LEFT JOIN word_senses s ON s.id = COALESCE(lw.sense_id, (
    SELECT id FROM word_senses WHERE word_id = w.id ORDER BY NULLIF(trim(meaning_vi), '') IS NULL, position LIMIT 1
  ))
  LEFT JOIN sense_examples e ON e.sense_id = s.id AND e.position = (
    SELECT MAX(position) FROM sense_examples WHERE sense_id = s.id
  )
  WHERE lw.lesson_id = ?
  ORDER BY lw.position
`;

interface LessonRow {
  id: string; title: string; subtitle: string | null; format: string; hsk_level: number; created_at: string;
  vocab_count: number; grammar_count: number;
}

const LESSON_ROW_SELECT = `
  SELECT l.*, (SELECT COUNT(*) FROM lesson_words WHERE lesson_id = l.id) AS vocab_count,
         (SELECT COUNT(*) FROM lesson_grammar WHERE lesson_id = l.id) AS grammar_count
  FROM lessons l
`;

/** "HSK2" for HSK 2.0 (what the sidebar groups on); "HSK 3.0 · 2" for the newer standard. */
const lessonLevelLabel = (format: string, level: number) =>
  format === 'hsk3' ? `HSK 3.0 · ${level === 7 ? '7-9' : level}` : `HSK${level}`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);

function botuFor(db: Database.Database, hanzi: string): VocabCard['botu'] {
  const parts = db.prepare(
    'SELECT component, role, note FROM character_components WHERE char = ? ORDER BY position',
  );
  return hanChars(hanzi).flatMap(char => {
    const rows = parts.all(char) as { component: string; role: string; note: string | null }[];
    return rows.length ? [{ char, parts: rows.map(p => ({ t: BOTU_FROM_ROLE[p.role], ph: p.component, n: p.note ?? '' })) }] : [];
  });
}

function toCard(db: Database.Database, r: WordCardRow): VocabCard {
  return {
    id: `w${r.id}`,
    zh: r.hanzi,
    py: r.pinyin,
    pos: posNameVi(r.pos),
    vn: r.meaning ?? '',
    botu: botuFor(db, r.hanzi),
    ex: { zh: r.ex_zh ?? '', vn: r.ex_vi ?? '' },
  };
}

function lessonGrammar(db: Database.Database, lessonId: string): GrammarPoint[] {
  const points = db.prepare(`
    SELECT g.id, g.title, g.title_vi, g.formula, g.explanation, g.comparisons
    FROM lesson_grammar lg JOIN grammar_points g ON g.id = lg.grammar_id
    WHERE lg.lesson_id = ? ORDER BY lg.position
  `).all(lessonId) as { id: number; title: string; title_vi: string | null; formula: string | null; explanation: string | null; comparisons: string | null }[];
  const examples = db.prepare('SELECT zh, vi, note FROM grammar_examples WHERE grammar_id = ? ORDER BY position');
  const exercises = db.prepare(
    'SELECT id, type, question, blank, options, answer, explanation FROM grammar_exercises WHERE grammar_id = ? ORDER BY position',
  );
  return points.map(g => ({
    id: String(g.id),
    title: g.title,
    titleVn: g.title_vi ?? '',
    formula: g.formula ?? '',
    explanation: g.explanation ?? '',
    examples: (examples.all(g.id) as { zh: string; vi: string | null; note: string | null }[])
      .map(e => ({ zh: e.zh, vn: e.vi ?? '', ...(e.note ? { note: e.note } : {}) })),
    exercises: (exercises.all(g.id) as { id: number; type: 'fill' | 'choice'; question: string; blank: string | null; options: string | null; answer: string; explanation: string | null }[])
      .map(x => ({
        id: String(x.id), type: x.type, question: x.question, answer: x.answer,
        ...(x.blank ? { blank: x.blank } : {}),
        ...(x.options ? { options: JSON.parse(x.options) as string[] } : {}),
        ...(x.explanation ? { explanation: x.explanation } : {}),
      })),
    ...(g.comparisons ? { comparisons: JSON.parse(g.comparisons) as GrammarPoint['comparisons'] } : {}),
  }));
}

export async function listLessons(): Promise<LessonMetaDTO[]> {
  const db = getDb();
  const lists = db.prepare(
    'SELECT hsk_level, COUNT(*) AS n, MIN(created_at) AS created_at FROM words WHERE hsk_level BETWEEN 1 AND 6 GROUP BY hsk_level ORDER BY hsk_level',
  ).all() as { hsk_level: number; n: number; created_at: string }[];
  const lessons = db.prepare(`${LESSON_ROW_SELECT} ORDER BY l.created_at`).all() as LessonRow[];
  return [
    ...lists.map(l => ({
      id: hskLessonId(l.hsk_level), title: `HSK${l.hsk_level}`, subtitle: `${l.n} từ vựng HSK${l.hsk_level}`,
      level: `HSK${l.hsk_level}`, createdAt: l.created_at, vocabCount: l.n, grammarCount: 0,
    })),
    ...lessons.map(l => ({
      id: l.id, title: l.title, subtitle: l.subtitle ?? `${l.vocab_count} từ vựng`,
      level: lessonLevelLabel(l.format, l.hsk_level), createdAt: l.created_at,
      vocabCount: l.vocab_count, grammarCount: l.grammar_count,
    })),
  ];
}

export async function getLesson(id: string): Promise<Lesson | null> {
  const ref = parseLessonId(id);
  if (!ref) return null;
  const db = getDb();
  if (ref.kind === 'hsk') {
    const rows = db.prepare(`${LIST_CARD_SELECT} WHERE w.hsk_level = ? ORDER BY w.pinyin_plain, w.hanzi`).all(ref.level) as WordCardRow[];
    if (!rows.length) return null;
    return {
      id, title: `HSK${ref.level}`, subtitle: `${rows.length} từ vựng HSK${ref.level}`, level: `HSK${ref.level}`,
      createdAt: rows.reduce((m, r) => (r.created_at < m ? r.created_at : m), rows[0].created_at),
      vocab: rows.map(r => toCard(db, r)), grammar: [],
    };
  }
  const lesson = db.prepare(`${LESSON_ROW_SELECT} WHERE l.id = ?`).get(ref.id) as LessonRow | undefined;
  if (!lesson) return null;
  const rows = db.prepare(LESSON_CARD_SELECT).all(lesson.id) as WordCardRow[];
  return {
    id: lesson.id, title: lesson.title, subtitle: lesson.subtitle ?? `${rows.length} từ vựng`,
    level: lessonLevelLabel(lesson.format, lesson.hsk_level), createdAt: lesson.created_at,
    vocab: rows.map(r => toCard(db, r)), grammar: lessonGrammar(db, lesson.id),
  };
}

/**
 * Deletes an uploaded lesson. Its words and grammar points stay (dictionary and the HSK
 * grammar pages); only the lesson and its links go. HSK word lists cannot be deleted.
 */
export async function deleteLesson(id: string): Promise<boolean> {
  const ref = parseLessonId(id);
  if (ref?.kind !== 'lesson') return false;
  return getDb().prepare('DELETE FROM lessons WHERE id = ?').run(ref.id).changes > 0;
}

/** Vocabulary of one HSK 2.0 level: the word list, then the uploaded lessons of that level. */
export async function listVocabByLevel(level: string): Promise<LevelVocabItemDTO[]> {
  const m = /^HSK([1-6])$/.exec(level.trim());
  if (!m) return [];
  const n = Number(m[1]);
  const db = getDb();
  const out: LevelVocabItemDTO[] = [];
  const push = (rows: WordCardRow[], lessonId: string, lessonTitle: string) => {
    for (const r of rows) {
      out.push({ lessonId, lessonTitle, zh: r.hanzi, py: r.pinyin, pos: posNameVi(r.pos), vn: r.meaning ?? '', ex: { zh: r.ex_zh ?? '', vn: r.ex_vi ?? '' } });
    }
  };
  push(db.prepare(`${LIST_CARD_SELECT} WHERE w.hsk_level = ? ORDER BY w.pinyin_plain, w.hanzi`).all(n) as WordCardRow[], hskLessonId(n), `HSK${n}`);
  const lessons = db.prepare("SELECT id, title FROM lessons WHERE format = 'hsk2' AND hsk_level = ? ORDER BY created_at").all(n) as { id: string; title: string }[];
  for (const l of lessons) push(db.prepare(LESSON_CARD_SELECT).all(l.id) as WordCardRow[], l.id, l.title);
  return out;
}

/**
 * Dictionary search over hanzi, toneless pinyin and meanings (Vietnamese without accents too).
 * Trigram FTS needs ≥ 3 characters, so short queries use indexed LIKE instead.
 * Ranked: exact hanzi, hanzi prefix, exact pinyin, pinyin prefix, then the rest.
 * Each result links to its HSK word list, else to the first lesson that teaches it.
 */
export async function searchWords(query: string, limit = 40, db: Database.Database = getDb(), vietnameseOnly = false): Promise<SearchResultDTO[]> {
  const q = query.trim();
  if (!q) return [];
  const plainPinyin = pinyinPlain(q);
  const plainVi = stripVietnamese(q);

  let ids: number[];
  if ([...q].length >= 3) {
    const phrase = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const match = [`hanzi:${phrase(q)}`, plainPinyin.length >= 3 ? `pinyin_plain:${phrase(plainPinyin)}` : null,
      `meanings_plain:${phrase(plainVi)}`, `meanings:${phrase(q)}`].filter(Boolean).join(' OR ');
    ids = db.prepare('SELECT rowid FROM words_fts WHERE words_fts MATCH ? LIMIT 500').pluck().all(match) as number[];
  } else {
    ids = db.prepare(`
      SELECT id FROM words WHERE hanzi LIKE ? ESCAPE '\\' OR pinyin_plain LIKE ? ESCAPE '\\'
      UNION SELECT rowid FROM words_fts WHERE meanings_plain LIKE ? ESCAPE '\\'
      LIMIT 500
    `).pluck().all(`%${escapeLike(q)}%`, `${escapeLike(plainPinyin)}%`, `%${escapeLike(plainVi)}%`) as number[];
  }
  if (!ids.length) return [];

  const rows = db.prepare(`
    SELECT r.*, (
      SELECT l.id || char(9) || l.title FROM lesson_words lw JOIN lessons l ON l.id = lw.lesson_id
      WHERE lw.word_id = r.id ORDER BY l.created_at LIMIT 1
    ) AS lesson
    FROM (${LIST_CARD_SELECT}) r
    WHERE r.id IN (SELECT value FROM json_each(?))
      ${vietnameseOnly ? "AND EXISTS (SELECT 1 FROM word_senses s WHERE s.word_id = r.id AND trim(COALESCE(s.meaning_vi, '')) <> '')" : ''}
    ORDER BY
      CASE WHEN r.hanzi = ? THEN 0 WHEN r.hanzi LIKE ? ESCAPE '\\' THEN 1
           WHEN r.pinyin_plain = ? THEN 2 WHEN r.pinyin_plain LIKE ? ESCAPE '\\' THEN 3 ELSE 4 END,
      r.hsk_level IS NULL, r.hsk_level, length(r.hanzi), r.id
    LIMIT ?
  `).all(JSON.stringify(ids), q, `${escapeLike(q)}%`, plainPinyin, `${escapeLike(plainPinyin)}%`, limit) as (WordCardRow & { lesson: string | null })[];

  return rows.map(r => {
    const inList = r.hsk_level != null && r.hsk_level <= 6;
    const [lessonId, lessonTitle] = r.lesson ? r.lesson.split('\t') : [null, ''];
    return {
      lessonId: inList ? hskLessonId(r.hsk_level!) : lessonId,
      lessonTitle: inList ? `HSK${r.hsk_level}` : lessonTitle,
      level: inList ? `HSK${r.hsk_level}` : '',
      zh: r.hanzi, py: r.pinyin, vn: r.meaning ?? '', pos: posNameVi(r.pos),
    };
  });
}
