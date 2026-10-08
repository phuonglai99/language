import type Database from 'better-sqlite3';
import { hanChars, neutralToneVariants, normalizePinyin } from '@/shared/text';
import { PARTS_OF_SPEECH } from '@/shared/pos';
import { addSenseExample, findOrCreateSense, findOrCreateWord, syncWordSearch } from './words';
import type { HanziiWord } from '../third-party-service/hanzii';

const POS: Record<string, string> = { a: 'adj', d: 'adv', r: 'pron', p: 'prep', c: 'conj', u: 'part', e: 'intj', nr: 'propn', ns: 'propn', sv: 'vo' };

export function matchesHanziiWord(word: { hanzi: string; pinyin: string }, entry: HanziiWord): boolean {
  return word.hanzi === entry.word && neutralToneVariants(
    normalizePinyin(word.hanzi, word.pinyin), normalizePinyin(entry.word, entry.pinyin),
  );
}

/** Imported dictionary senses retain their provenance in note; existing senses are untouched. */
export function saveHanziiWord(db: Database.Database, entry: HanziiWord, targetWordId?: number): number {
  return db.transaction(() => {
    if (targetWordId != null) {
      const target = db.prepare('SELECT hanzi, pinyin FROM words WHERE id = ?').get(targetWordId) as { hanzi: string; pinyin: string } | undefined;
      if (!target || !matchesHanziiWord(target, entry)) throw new Error('Hanzii spelling/reading mismatch');
    }
    for (const char of new Set(hanChars(entry.word))) {
      db.prepare("INSERT OR IGNORE INTO characters (char, crawl_status) VALUES (?, 'pending')").run(char);
    }
    const wordId = targetWordId ?? findOrCreateWord(db, entry.word, entry.pinyin, 'import');
    for (const content of entry.content) {
      const rawPos = content.kind ?? '';
      const pos = POS[rawPos] ?? rawPos;
      const label = PARTS_OF_SPEECH.some(([code]) => code === pos) ? pos : '';
      for (const sense of content.means ?? []) {
        if (typeof sense.mean !== 'string' || !sense.mean.trim()) continue;
        const existing = db.prepare('SELECT id FROM word_senses WHERE word_id = ? AND lower(meaning_vi) = lower(?)').get(wordId, sense.mean.trim());
        const id = findOrCreateSense(db, wordId, sense.mean, label, 'import');
        if (id == null) continue;
        if (!existing) db.prepare('UPDATE word_senses SET note = ? WHERE id = ?')
          .run(`Hanzii word ${entry.id}: https://hanzii.net/search/word/${encodeURIComponent(entry.word)}?hl=vi`, id);
        for (const ex of sense.examples ?? []) {
          if (typeof ex.e !== 'string') continue;
          addSenseExample(db, id, ex.e, typeof ex.m === 'string' ? ex.m : '');
          if (ex.p) db.prepare('UPDATE sense_examples SET pinyin = COALESCE(pinyin, ?) WHERE sense_id = ? AND zh = ?').run(ex.p, id, ex.e.trim());
        }
      }
    }
    syncWordSearch(db, wordId);
    return wordId;
  })();
}

export function missingVietnameseCompounds(db: Database.Database): { id: number; hanzi: string; pinyin: string }[] {
  return (db.prepare(`SELECT id, hanzi, pinyin FROM words w WHERE NOT EXISTS (
    SELECT 1 FROM word_senses s WHERE s.word_id = w.id AND trim(COALESCE(s.meaning_vi, '')) <> ''
  ) ORDER BY w.id`).all() as { id: number; hanzi: string; pinyin: string }[])
    .filter(w => hanChars(w.hanzi).length >= 2);
}
