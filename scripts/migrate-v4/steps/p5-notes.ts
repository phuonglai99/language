/**
 * P5 — Notes: note_folders, note_items (word_id / sense_id instead of copied text).
 * Mapping: docs/db/README.md §2.5. Words for every note were created or matched in P2.
 */
import type { MigrationStep } from '../index';
import { neutralToneVariants, normalizePinyin } from '../../../src/shared/text';

const loose = (p: string) => p.toLowerCase().replace(/'/g, '');

export const p5Notes: MigrationStep = {
  name: 'P5 notes',
  run({ old, db, log }) {
    const folders = old.prepare('SELECT id, name, is_system, created_at FROM note_folders').all() as
      { id: string; name: string; is_system: number; created_at: string }[];
    const insertFolder = db.prepare('INSERT INTO note_folders (id, name, is_system, created_at) VALUES (?, ?, ?, ?)');
    for (const f of folders) insertFolder.run(f.id, f.name, f.is_system, f.created_at);

    const items = old.prepare(
      'SELECT id, folder_id, zh, py, vn, source_lesson_id, created_at FROM note_items ORDER BY created_at',
    ).all() as { id: string; folder_id: string; zh: string; py: string; vn: string; source_lesson_id: string | null; created_at: string }[];

    const wordsByHanzi = db.prepare('SELECT id, pinyin FROM words WHERE hanzi = ?');
    const senseByVi = db.prepare(
      'SELECT id FROM word_senses WHERE word_id = ? AND lower(meaning_vi) = lower(?) ORDER BY position LIMIT 1',
    ).pluck();
    const insertItem = db.prepare(`
      INSERT INTO note_items (id, folder_id, word_id, sense_id, source_passage_id, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);

    const report: string[] = [];
    let withSource = 0;
    for (const it of items) {
      const hanzi = it.zh.trim();
      const pinyin = normalizePinyin(hanzi, it.py ?? '');
      const candidates = wordsByHanzi.all(hanzi) as { id: number; pinyin: string }[];
      const word = candidates.find(w => w.pinyin === pinyin)
        ?? candidates.find(w => loose(w.pinyin) === loose(pinyin))
        ?? candidates.find(w => neutralToneVariants(w.pinyin, pinyin));
      if (!word) throw new Error(`Note ${it.id}: no word for ${hanzi} [${it.py}]`);
      const senseId = (it.vn?.trim() ? senseByVi.get(word.id, it.vn.trim()) : undefined) as number | undefined;
      // source_lesson_id pointed at the old lessons table, which has no counterpart in v4.
      if (it.source_lesson_id) withSource++;
      insertItem.run(it.id, it.folder_id, word.id, senseId ?? null, it.created_at);
      report.push(`${hanzi} → word ${word.id} (${word.pinyin}), sense ${senseId ?? '-'}`);
    }
    log(`note_folders: ${folders.length}; note_items: ${items.length} (${report.join('; ')})`);
    if (withSource) log(`REVIEW ${withSource} items had source_lesson_id; dropped (no lessons table in v4)`);
  },
};
