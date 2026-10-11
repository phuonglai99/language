import type Database from 'better-sqlite3';

const terms = (value: string) => value.normalize('NFC').toLocaleLowerCase('vi').split(/[,;/]/).map(value => value.trim()).filter(Boolean);

/** Reuse dictionary senses already in this DB before considering any remote lookup. */
export function reconcileStoredHanziiPos(db: Database.Database, wordId: number) {
  const dictionary = db.prepare(`SELECT pos, meaning_vi, note FROM word_senses
    WHERE word_id = ? AND pos IS NOT NULL AND meaning_vi IS NOT NULL AND note LIKE 'Hanzii word %'
  `).all(wordId) as { pos: string; meaning_vi: string; note: string }[];
  const legacy = db.prepare(`SELECT id, pos, meaning_vi FROM word_senses
    WHERE word_id = ? AND source = 'import' AND verified = 0 AND meaning_vi IS NOT NULL
    AND COALESCE(note, '') NOT LIKE '%Hanzii %'
  `).all(wordId) as { id: number; pos: string | null; meaning_vi: string }[];
  const changes = [];
  for (const sense of legacy) {
    const wanted = terms(sense.meaning_vi);
    const candidates = dictionary.filter(entry => wanted.length && wanted.every(term => terms(entry.meaning_vi).includes(term)));
    if (new Set(candidates.map(candidate => candidate.pos)).size !== 1) continue;
    const candidate = candidates[0];
    const evidence = `Hanzii cached word sense: ${candidate.meaning_vi}; ${candidate.note}`;
    db.prepare("UPDATE word_senses SET pos = ?, note = COALESCE(note || char(10), '') || ? WHERE id = ?")
      .run(candidate.pos, `${evidence}; previous pos=${sense.pos ?? 'NULL'}; automatic match, not human verified`, sense.id);
    changes.push({ senseId: sense.id, before: sense.pos, after: candidate.pos, evidence });
  }
  return changes;
}

/** Prevent a repeated upload from recreating a POS already corrected by dictionary evidence. */
export function preferredStoredHanziiPos(db: Database.Database, wordId: number, meaning: string): string | null {
  const wanted = terms(meaning);
  const rows = db.prepare(`SELECT pos, meaning_vi FROM word_senses WHERE word_id = ?
    AND pos IS NOT NULL AND meaning_vi IS NOT NULL AND note LIKE '%Hanzii %'
  `).all(wordId) as { pos: string; meaning_vi: string }[];
  const matches = rows.filter(row => wanted.length && wanted.every(term => terms(row.meaning_vi).includes(term)));
  const positions = new Set(matches.map(row => row.pos));
  return positions.size === 1 ? matches[0].pos : null;
}
