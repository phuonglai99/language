import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../../src/server/db/migrate';
import { PARTS_OF_SPEECH } from '../../src/shared/pos';
import { reconcileHanziiWord } from '../../src/server/repos/hanziiReconcile';
import type { HanziiWord } from '../../src/server/third-party-service/hanzii';

test('repair uses exact reading and gloss evidence, preserves IDs, reviewed senses and ambiguity', () => {
  const db = new Database(':memory:');
  try {
    migrate(db);
    for (const row of PARTS_OF_SPEECH) db.prepare('INSERT INTO parts_of_speech VALUES (?, ?, ?)').run(...row);
    db.prepare("INSERT INTO words (id, hanzi, pinyin, pinyin_plain, source) VALUES (1, '过', 'guò', 'guo', 'import')").run();
    const insert = db.prepare("INSERT INTO word_senses (word_id, position, pos, meaning_vi, source, verified) VALUES (1, ?, 'n', ?, 'import', ?)");
    const id = Number(insert.run(0, 'qua, đi qua', 0).lastInsertRowid);
    const reviewed = Number(insert.run(1, 'qua', 1).lastInsertRowid);
    const ambiguous = Number(insert.run(2, 'chung', 0).lastInsertRowid);
    const entries: HanziiWord[] = [
      { id: 9, word: '过', pinyin: 'guò', content: [
        { kind: 'v', means: [{ mean: 'qua; đi qua; chảy qua' }, { mean: 'chung' }] },
        { kind: 'n', means: [{ mean: 'chung' }] },
      ] },
      { id: 10, word: '过', pinyin: 'guo', content: [{ kind: 'u', means: [{ mean: 'qua; đi qua' }] }] },
    ];
    const word = { id: 1, hanzi: '过', pinyin: 'guò' };
    const result = reconcileHanziiWord(db, word, entries);
    assert.equal(result.matchedEntries, 1);
    assert.equal(db.prepare('SELECT pos FROM word_senses WHERE id = ?').pluck().get(id), 'v');
    assert.equal(db.prepare('SELECT pos FROM word_senses WHERE id = ?').pluck().get(reviewed), 'n');
    assert.equal(db.prepare('SELECT pos FROM word_senses WHERE id = ?').pluck().get(ambiguous), 'n');
    assert.equal(result.unresolved.length, 1);
    assert.equal(db.prepare("SELECT count(*) FROM word_senses WHERE pos = 'part'").pluck().get(), 0);
    const count = db.prepare('SELECT count(*) FROM word_senses').pluck().get();
    assert.equal(reconcileHanziiWord(db, word, entries).changes.length, 0);
    assert.equal(db.prepare('SELECT count(*) FROM word_senses').pluck().get(), count);
  } finally { db.close(); }
});

test('cached character dictionary repairs explicit glosses without network or guessing readings', async () => {
  const { reconcileCachedCharacterPos } = await import('../../src/server/repos/hanziiCharacterPos');
  const db = new Database(':memory:');
  try {
    migrate(db);
    for (const row of PARTS_OF_SPEECH) db.prepare('INSERT INTO parts_of_speech VALUES (?, ?, ?)').run(...row);
    db.prepare("INSERT INTO characters (char, pinyin, hv_dictionary) VALUES ('吃', 'chī', ?)")
      .run(JSON.stringify(['(Động) Ăn.\n\nVí dụ khác có danh từ']));
    db.prepare("INSERT INTO words (id, hanzi, pinyin, pinyin_plain, source) VALUES (1, '吃', 'chī', 'chi', 'import')").run();
    db.prepare("INSERT INTO word_senses (word_id, position, pos, meaning_vi, source) VALUES (1, 0, 'n', 'ăn', 'import')").run();
    const word = { id: 1, hanzi: '吃', pinyin: 'chī' };
    assert.equal(reconcileCachedCharacterPos(db, { ...word, pinyin: 'chì' }).length, 0);
    assert.equal(reconcileCachedCharacterPos(db, word)[0].after, 'v');
    assert.equal(reconcileCachedCharacterPos(db, word).length, 0);
  } finally { db.close(); }
});

test('existing Hanzii senses correct imports offline and prevent stale POS on repeated upload', async () => {
  const { reconcileStoredHanziiPos, preferredStoredHanziiPos } = await import('../../src/server/repos/storedHanziiPos');
  const db = new Database(':memory:');
  try {
    migrate(db);
    for (const row of PARTS_OF_SPEECH) db.prepare('INSERT INTO parts_of_speech VALUES (?, ?, ?)').run(...row);
    db.prepare("INSERT INTO words (id, hanzi, pinyin, pinyin_plain, source) VALUES (1, '吃', 'chī', 'chi', 'import')").run();
    db.prepare("INSERT INTO word_senses (word_id, position, pos, meaning_vi, source) VALUES (1, 0, 'n', 'ăn', 'import')").run();
    db.prepare("INSERT INTO word_senses (word_id, position, pos, meaning_vi, source, note) VALUES (1, 1, 'v', 'ăn; dùng bữa', 'import', 'Hanzii word 1: cached')").run();
    assert.equal(reconcileStoredHanziiPos(db, 1)[0].after, 'v');
    assert.equal(preferredStoredHanziiPos(db, 1, 'ăn'), 'v');
    assert.equal(reconcileStoredHanziiPos(db, 1).length, 0);
  } finally { db.close(); }
});
