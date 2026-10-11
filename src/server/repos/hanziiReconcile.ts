import type Database from 'better-sqlite3';
import { normalizePinyin } from '@/shared/text';
import type { HanziiWord } from '../third-party-service/hanzii';
import { hanziiPosCodes, saveHanziiWord } from './hanziiWords';

const reading = (hanzi: string, pinyin: string) => normalizePinyin(hanzi, pinyin).toLowerCase().replace(/['\s]/g, '');
const terms = (value: string) => value.normalize('NFC').toLocaleLowerCase('vi').split(/[,;\/]/).map(s => s.trim()).filter(Boolean);

/** Repairs only unreviewed imports with unambiguous, matching Vietnamese glosses.
 * Strict readings intentionally do not equate guo with guò or different tones.
 */
export function reconcileHanziiWord(db: Database.Database, word: { id: number; hanzi: string; pinyin: string }, entries: HanziiWord[]) {
  const matches = entries.filter(entry => entry.word === word.hanzi && reading(entry.word, entry.pinyin) === reading(word.hanzi, word.pinyin));
  const changes: { senseId: number; meaning: string; before: string | null; after: string; evidence: string }[] = [];
  const unresolved: { senseId: number; meaning: string; pos: string | null; reason: string }[] = [];
  db.transaction(() => {
    const legacy = db.prepare(`SELECT id, meaning_vi, pos FROM word_senses
      WHERE word_id = ? AND source = 'import' AND verified = 0
      AND COALESCE(note, '') NOT LIKE '%Hanzii %' AND trim(COALESCE(meaning_vi, '')) <> ''
    `).all(word.id) as { id: number; meaning_vi: string; pos: string | null }[];
    for (const sense of legacy) {
      const oldTerms = terms(sense.meaning_vi);
      const candidates = matches.flatMap(entry => entry.content.flatMap(content => {
        const positions = hanziiPosCodes(content.kind ?? '');
        return content.means.filter(mean => {
          const sourceTerms = terms(mean.mean);
          return oldTerms.length > 0 && oldTerms.every(term => sourceTerms.includes(term));
        }).flatMap(mean => positions.map(pos => ({ pos, evidence: `Hanzii word ${entry.id}: ${mean.mean}` })));
      }));
      const positions = new Set(candidates.map(candidate => candidate.pos));
      if (positions.size !== 1) {
        unresolved.push({ senseId: sense.id, meaning: sense.meaning_vi, pos: sense.pos, reason: matches.length ? 'no-unambiguous-gloss-match' : 'no-exact-reading' });
        continue;
      }
      const candidate = candidates[0];
      db.prepare("UPDATE word_senses SET pos = ?, note = COALESCE(note || char(10), '') || ? WHERE id = ?")
        .run(candidate.pos, `${candidate.evidence}; previous pos=${sense.pos ?? 'NULL'}; automatic dictionary match, not human verified`, sense.id);
      changes.push({ senseId: sense.id, meaning: sense.meaning_vi, before: sense.pos, after: candidate.pos, evidence: candidate.evidence });
    }
    for (const entry of matches) saveHanziiWord(db, entry, word.id);
  })();
  return { matchedEntries: matches.length, changes, unresolved };
}
