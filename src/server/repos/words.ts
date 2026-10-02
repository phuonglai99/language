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
  hskLevel: number | null = null,
): number | null {
  const vi = meaningVi.trim();
  if (!vi) return null;
  const existing = db.prepare(
    'SELECT id, hsk_level FROM word_senses WHERE word_id = ? AND lower(meaning_vi) = lower(?) ORDER BY position LIMIT 1',
  ).get(wordId, vi) as { id: number; hsk_level: number | null } | undefined;
  if (existing) {
    if (hskLevel != null && (existing.hsk_level == null || hskLevel < existing.hsk_level)) {
      db.prepare('UPDATE word_senses SET hsk_level = ? WHERE id = ?').run(hskLevel, existing.id);
    }
    return existing.id;
  }

  const { codes } = parsePosLabels(posLabel);
  const insert = db.prepare(`
    INSERT INTO word_senses (word_id, position, pos, meaning_vi, hsk_level, source)
    VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM word_senses WHERE word_id = ?), ?, ?, ?, ?)
  `);
  let first: number | null = null;
  for (const pos of codes.length ? codes : [null]) {
    const id = Number(insert.run(wordId, wordId, pos, vi, hskLevel, source).lastInsertRowid);
    first ??= id;
  }
  syncWordSearch(db, wordId);
  return first;
}

/** Adds an example to a sense unless that sentence is already there. */
export function addSenseExample(db: Database.Database, senseId: number, zh: string, vi: string): void {
  const text = zh.trim();
  if (!text) return;
  db.prepare(`
    INSERT INTO sense_examples (sense_id, position, zh, vi)
    SELECT ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM sense_examples WHERE sense_id = ?), ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM sense_examples WHERE sense_id = ? AND zh = ?)
  `).run(senseId, senseId, text, vi.trim() || null, senseId, text);
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

/**
 * Sense for a Mandarin Bean token (wordId + contextual definition), creating the word and
 * the English sense when the dictionary does not have them yet.
 */
export function findOrCreateMbSense(
  db: Database.Database, token: { hanzi: string; pinyin: string; wordId: string; definition: string; hsk: number | null },
): number {
  const hanzi = token.hanzi.trim();
  const definition = token.definition.trim();
  const existing = db.prepare(`
    SELECT s.id FROM word_senses s JOIN words w ON w.id = s.word_id
    WHERE s.mb_word_id = ? AND s.meaning_en = ? AND w.hanzi = ? LIMIT 1
  `).pluck().get(token.wordId, definition, hanzi) as number | undefined;
  if (existing != null) return existing;

  const wordId = findOrCreateWord(db, hanzi, token.pinyin, 'mandarin_bean');
  const id = Number(db.prepare(`
    INSERT INTO word_senses (word_id, position, meaning_en, hsk_level, source, mb_word_id)
    VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM word_senses WHERE word_id = ?), ?, ?, 'mandarin_bean', ?)
  `).run(wordId, wordId, definition, token.hsk, token.wordId).lastInsertRowid);
  syncWordSearch(db, wordId);
  return id;
}
