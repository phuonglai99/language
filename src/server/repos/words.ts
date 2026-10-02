import type Database from 'better-sqlite3';
import { neutralToneVariants, normalizePinyin, pinyinPlain, stripVietnamese } from '@/shared/text';
import { parsePosLabels } from '@/shared/pos';

type Source = 'import' | 'mandarin_bean' | 'ai' | 'manual';

const loose = (p: string) => p.toLowerCase().replace(/'/g, '');

/**
 * Word for (hanzi, pinyin) with the same matching as the migration: exact spelling,
 * then ignoring case/apostrophes, then a neutral-tone variant. Creates it when none matches.
 */
export function findOrCreateWord(db: Database.Database, hanziRaw: string, pinyinRaw: string, source: Source): number {
  const hanzi = hanziRaw.trim();
  const pinyin = normalizePinyin(hanzi, pinyinRaw ?? '');
  const candidates = db.prepare('SELECT id, pinyin FROM words WHERE hanzi = ?').all(hanzi) as { id: number; pinyin: string }[];
  const hit = candidates.find(w => w.pinyin === pinyin)
    ?? candidates.find(w => loose(w.pinyin) === loose(pinyin))
    ?? candidates.find(w => neutralToneVariants(w.pinyin, pinyin));
  if (hit) return hit.id;

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO words (hanzi, pinyin, pinyin_plain, source) VALUES (?, ?, ?, ?)',
  ).run(hanzi, pinyin, pinyinPlain(pinyin), source);
  const id = Number(lastInsertRowid);
  db.prepare('INSERT INTO word_characters (word_id, position, char) SELECT ?, key, value FROM json_each(?)')
    .run(id, JSON.stringify([...hanzi].filter(ch => /\p{Script=Han}/u.test(ch))));
  syncWordSearch(db, id);
  return id;
}

/**
 * Sense of a word with this Vietnamese meaning (case-insensitive); creates one per POS
 * label when none matches. Returns null when there is no meaning to match on.
 */
export function findOrCreateSense(
  db: Database.Database, wordId: number, meaningVi: string, posLabel: string, source: Source,
): number | null {
  const vi = meaningVi.trim();
  if (!vi) return null;
  const existing = db.prepare(
    'SELECT id FROM word_senses WHERE word_id = ? AND lower(meaning_vi) = lower(?) ORDER BY position LIMIT 1',
  ).pluck().get(wordId, vi) as number | undefined;
  if (existing != null) return existing;

  const { codes } = parsePosLabels(posLabel);
  const insert = db.prepare(`
    INSERT INTO word_senses (word_id, position, pos, meaning_vi, source)
    VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM word_senses WHERE word_id = ?), ?, ?, ?)
  `);
  let first: number | null = null;
  for (const pos of codes.length ? codes : [null]) {
    const id = Number(insert.run(wordId, wordId, pos, vi, source).lastInsertRowid);
    first ??= id;
  }
  syncWordSearch(db, wordId);
  return first;
}

/** Rewrites the words_fts row for one word (meanings come from all of its senses). */
export function syncWordSearch(db: Database.Database, wordId: number): void {
  const row = db.prepare(`
    SELECT w.hanzi, w.pinyin_plain, w.han_viet,
           group_concat(COALESCE(s.meaning_vi, '') || ' ' || COALESCE(s.meaning_en, ''), ' | ') AS meanings
    FROM words w LEFT JOIN word_senses s ON s.word_id = w.id
    WHERE w.id = ? GROUP BY w.id
  `).get(wordId) as { hanzi: string; pinyin_plain: string; han_viet: string | null; meanings: string | null } | undefined;
  if (!row) return;
  const meanings = (row.meanings ?? '').replace(/\s+/g, ' ').trim();
  db.prepare('DELETE FROM words_fts WHERE rowid = ?').run(wordId);
  db.prepare(
    'INSERT INTO words_fts (rowid, hanzi, pinyin_plain, han_viet, meanings, meanings_plain) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(wordId, row.hanzi, row.pinyin_plain, row.han_viet ?? '', meanings, stripVietnamese(meanings));
}
