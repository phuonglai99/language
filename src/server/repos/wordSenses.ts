import type Database from 'better-sqlite3';
import type { VocabSense } from '@/types';
import { posNameVi } from '@/shared/pos';

/** Keep each sense and its POS together; prefer the lesson's selected sense. */
export function getWordSenses(db: Database.Database, wordId: number, preferredSenseId?: number | null): VocabSense[] {
  const rows = db.prepare(`
    SELECT id, pos, COALESCE(NULLIF(trim(meaning_vi), ''), meaning_en, '') AS meaning
    FROM word_senses WHERE word_id = ?
    ORDER BY id = ? DESC, trim(COALESCE(meaning_vi, '')) = '', position, id
  `).all(wordId, preferredSenseId ?? null) as { id: number; pos: string | null; meaning: string }[];
  return rows.map(row => ({ ...row, pos: posNameVi(row.pos) }));
}
