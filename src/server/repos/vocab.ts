import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { hskLessonId, parseLessonId, topicLessonId, topicSlug } from '@/shared/lessons';
import { posNameVi } from '@/shared/pos';
import { BOTU_FROM_ROLE } from '@/shared/hanzi';
import { hanChars, pinyinPlain, stripVietnamese } from '@/shared/text';
import type { Lesson, VocabCard } from '@/types';
import type { LessonMetaDTO, LevelVocabItemDTO, SearchResultDTO } from '@/types/api';

/**
 * Vocabulary "lessons" are views over words (see shared/lessons.ts), returned in the
 * pre-v4 Lesson shape so the lesson screens (flashcards, quiz, match) work unchanged.
 */

interface WordCardRow {
  id: number; hanzi: string; pinyin: string; hsk_level: number | null; topic: string | null; created_at: string;
  sense_id: number | null; pos: string | null; meaning: string | null; ex_zh: string | null; ex_vi: string | null;
}

/**
 * One card per word: a Vietnamese sense (else any sense) and one of its examples.
 * HSK lists show the first sense/example. A topic lesson shows the latest ones: topics
 * are imported after the lists, so what a topic lesson added is always appended last.
 */
const cardSelect = (latest = false) => `
  SELECT w.id, w.hanzi, w.pinyin, w.hsk_level, w.topic, w.created_at,
         s.id AS sense_id, s.pos, COALESCE(s.meaning_vi, s.meaning_en) AS meaning,
         e.zh AS ex_zh, e.vi AS ex_vi
  FROM words w
  LEFT JOIN word_senses s ON s.id = (
    SELECT id FROM word_senses WHERE word_id = w.id
    ORDER BY meaning_vi IS NULL, position ${latest ? 'DESC' : 'ASC'} LIMIT 1
  )
  LEFT JOIN sense_examples e ON e.sense_id = s.id AND e.position = (
    SELECT ${latest ? 'MAX' : 'MIN'}(position) FROM sense_examples WHERE sense_id = s.id
  )
`;
const CARD_SELECT = cardSelect();

/**
 * Level of an uploaded topic, approximated from the senses its words got at import.
 * Not exact: v4 stores no level per topic, so a topic whose words all reuse lower-level
 * senses reports that lower level (2 of the 6 migrated topics show HSK1 instead of HSK2).
 */
const TOPIC_LEVEL = `
  SELECT MIN(s.hsk_level) FROM words w2 JOIN word_senses s ON s.word_id = w2.id
  WHERE w2.topic = t.topic AND s.source = 'import'
`;

function topicsWithMeta(db: Database.Database) {
  return db.prepare(`
    SELECT t.topic, t.n, t.created_at, (${TOPIC_LEVEL}) AS level
    FROM (SELECT topic, COUNT(*) AS n, MIN(created_at) AS created_at FROM words WHERE topic IS NOT NULL GROUP BY topic) t
    ORDER BY t.created_at
  `).all() as { topic: string; n: number; created_at: string; level: number | null }[];
}

function topicBySlug(db: Database.Database, slug: string) {
  return topicsWithMeta(db).find(t => topicSlug(t.topic) === slug) ?? null;
}

const levelLabel = (n: number | null) => (n ? `HSK${n}` : '');

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

export async function listLessons(): Promise<LessonMetaDTO[]> {
  const db = getDb();
  const lists = db.prepare(
    'SELECT hsk_level, COUNT(*) AS n, MIN(created_at) AS created_at FROM words WHERE hsk_level BETWEEN 1 AND 6 GROUP BY hsk_level ORDER BY hsk_level',
  ).all() as { hsk_level: number; n: number; created_at: string }[];
  return [
    ...lists.map(l => ({
      id: hskLessonId(l.hsk_level), title: `HSK${l.hsk_level}`, subtitle: `${l.n} từ vựng HSK${l.hsk_level}`,
      level: `HSK${l.hsk_level}`, createdAt: l.created_at, vocabCount: l.n, grammarCount: 0,
    })),
    ...topicsWithMeta(db).map(t => ({
      id: topicLessonId(t.topic), title: t.topic, subtitle: `${t.n} từ vựng`, level: levelLabel(t.level),
      topic: t.topic, createdAt: t.created_at, vocabCount: t.n, grammarCount: 0,
    })),
  ];
}

export async function getLesson(id: string): Promise<Lesson | null> {
  const ref = parseLessonId(id);
  if (!ref) return null;
  const db = getDb();
  if (ref.kind === 'hsk') {
    const rows = db.prepare(`${CARD_SELECT} WHERE w.hsk_level = ? ORDER BY w.pinyin_plain, w.hanzi`).all(ref.level) as WordCardRow[];
    if (!rows.length) return null;
    return {
      id, title: `HSK${ref.level}`, subtitle: `${rows.length} từ vựng HSK${ref.level}`, level: `HSK${ref.level}`,
      createdAt: rows.reduce((m, r) => (r.created_at < m ? r.created_at : m), rows[0].created_at),
      vocab: rows.map(r => toCard(db, r)), grammar: [],
    };
  }
  const topic = topicBySlug(db, ref.slug);
  if (!topic) return null;
  const rows = db.prepare(`${cardSelect(true)} WHERE w.topic = ? ORDER BY w.id`).all(topic.topic) as WordCardRow[];
  return {
    id, title: topic.topic, subtitle: `${rows.length} từ vựng`, level: levelLabel(topic.level), topic: topic.topic,
    createdAt: topic.created_at, vocab: rows.map(r => toCard(db, r)), grammar: [],
  };
}

/** Removes an uploaded topic: its words stay in the dictionary, only the topic mark goes. HSK lists cannot be deleted. */
export async function deleteLesson(id: string): Promise<boolean> {
  const ref = parseLessonId(id);
  if (ref?.kind !== 'topic') return false;
  const db = getDb();
  const topic = topicBySlug(db, ref.slug);
  if (!topic) return false;
  db.prepare('UPDATE words SET topic = NULL WHERE topic = ?').run(topic.topic);
  return true;
}

/** Vocabulary of one level: the HSK list, then uploaded topics of that level. */
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
  push(db.prepare(`${CARD_SELECT} WHERE w.hsk_level = ? ORDER BY w.pinyin_plain, w.hanzi`).all(n) as WordCardRow[], hskLessonId(n), `HSK${n}`);
  for (const t of topicsWithMeta(db).filter(t => t.level === n)) {
    push(db.prepare(`${cardSelect(true)} WHERE w.topic = ? ORDER BY w.id`).all(t.topic) as WordCardRow[], topicLessonId(t.topic), t.topic);
  }
  return out;
}

/**
 * Dictionary search over hanzi, toneless pinyin and meanings (Vietnamese without accents too).
 * Trigram FTS needs ≥ 3 characters, so short queries use indexed LIKE instead.
 * Ranked: exact hanzi, hanzi prefix, exact pinyin, pinyin prefix, then the rest.
 */
export async function searchWords(query: string, limit = 40): Promise<SearchResultDTO[]> {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const plainPinyin = pinyinPlain(q);
  const plainVi = stripVietnamese(q);
  const like = (s: string) => `%${s.replace(/[\\%_]/g, m => '\\' + m)}%`;

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
    `).pluck().all(like(q), `${plainPinyin.replace(/[\\%_]/g, m => '\\' + m)}%`, like(plainVi)) as number[];
  }
  if (!ids.length) return [];

  const rows = db.prepare(`
    ${CARD_SELECT}
    WHERE w.id IN (SELECT value FROM json_each(?))
    ORDER BY
      CASE WHEN w.hanzi = ? THEN 0 WHEN w.hanzi LIKE ? ESCAPE '\\' THEN 1
           WHEN w.pinyin_plain = ? THEN 2 WHEN w.pinyin_plain LIKE ? ESCAPE '\\' THEN 3 ELSE 4 END,
      w.hsk_level IS NULL, w.hsk_level, length(w.hanzi), w.id
    LIMIT ?
  `).all(JSON.stringify(ids), q, `${q.replace(/[\\%_]/g, m => '\\' + m)}%`, plainPinyin,
    `${plainPinyin.replace(/[\\%_]/g, m => '\\' + m)}%`, limit) as WordCardRow[];

  return rows.map(r => {
    const lessonId = r.hsk_level && r.hsk_level <= 6 ? hskLessonId(r.hsk_level) : r.topic ? topicLessonId(r.topic) : null;
    return {
      lessonId,
      lessonTitle: r.hsk_level && r.hsk_level <= 6 ? `HSK${r.hsk_level}` : r.topic ?? '',
      level: levelLabel(r.hsk_level),
      zh: r.hanzi, py: r.pinyin, vn: r.meaning ?? '', pos: posNameVi(r.pos),
    };
  });
}
