import type Database from 'better-sqlite3';
import { normalizePinyin } from '@/shared/text';

const LABELS: Record<string, string> = {
  'Động': 'v', 'Danh': 'n', 'Tính': 'adj', 'Phó': 'adv', 'Đại': 'pron',
  'Giới': 'prep', 'Liên': 'conj', 'Trợ': 'part', 'Thán': 'intj', 'Số': 'num', 'Lượng': 'm',
};
const terms = (value: string) => value.normalize('NFC').toLocaleLowerCase('vi')
  .replace(/[.。]+$/u, '').split(/[,;\/]/).map(term => term.trim()).filter(Boolean);

/** Use already-crawled character definitions only when the reading and gloss are explicit.
 * Multiple readings, cross-references, and classical examples are not guessed into POS.
 */
export function reconcileCachedCharacterPos(db: Database.Database, word: { id: number; hanzi: string; pinyin: string }) {
  const changes: { senseId: number; before: string | null; after: string; evidence: string }[] = [];
  const source = db.prepare('SELECT pinyin, hv_dictionary FROM characters WHERE char = ?').get(word.hanzi) as { pinyin: string | null; hv_dictionary: string | null } | undefined;
  if (!source?.pinyin || /[,;/]/.test(source.pinyin) || !source.hv_dictionary) return changes;
  if (normalizePinyin(word.hanzi, source.pinyin).toLowerCase() !== normalizePinyin(word.hanzi, word.pinyin).toLowerCase()) return changes;
  const definitions = (JSON.parse(source.hv_dictionary) as string[]).flatMap(text => {
    const match = /^\(([^)]+)\)\s*([^\n]+)/u.exec(text);
    const pos = match && LABELS[match[1]];
    return match && pos ? [{ pos, text: match[2], terms: terms(match[2]) }] : [];
  });
  const senses = db.prepare(`SELECT id, pos, meaning_vi FROM word_senses WHERE word_id = ? AND source = 'import'
    AND verified = 0 AND COALESCE(note, '') NOT LIKE '%Hanzii %' AND trim(COALESCE(meaning_vi, '')) <> ''
  `).all(word.id) as { id: number; pos: string | null; meaning_vi: string }[];
  for (const sense of senses) {
    const wanted = terms(sense.meaning_vi);
    const candidates = definitions.filter(definition => wanted.length && wanted.every(term => definition.terms.includes(term)));
    if (new Set(candidates.map(candidate => candidate.pos)).size !== 1) continue;
    const candidate = candidates[0];
    const evidence = `Hanzii character ${word.hanzi}: (${candidate.pos}) ${candidate.text}`;
    db.prepare("UPDATE word_senses SET pos = ?, note = COALESCE(note || char(10), '') || ? WHERE id = ?")
      .run(candidate.pos, `${evidence}; previous pos=${sense.pos ?? 'NULL'}; cached dictionary match, not human verified`, sense.id);
    changes.push({ senseId: sense.id, before: sense.pos, after: candidate.pos, evidence });
  }
  return changes;
}
