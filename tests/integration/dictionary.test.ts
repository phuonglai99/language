import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../../src/server/db/migrate';
import { PARTS_OF_SPEECH } from '../../src/shared/pos';
import { saveHanziiWord, missingVietnameseCompounds } from '../../src/server/repos/hanziiWords';
import { findOrCreateMbSense } from '../../src/server/repos/words';
import { lookupDictionary } from '../../src/server/services/dictionarySearch';
import type { HanziiWord } from '../../src/server/third-party-service/hanzii';

function database() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  for (const row of PARTS_OF_SPEECH) db.prepare('INSERT INTO parts_of_speech VALUES (?, ?, ?)').run(...row);
  return db;
}
const bathing: HanziiWord = { id: 123, word: '洗澡', pinyin: 'xǐzǎo', content: [{ kind: 'sv', means: [
  { mean: 'tắm; tắm rửa', examples: [{ e: '我洗澡。', m: 'Tôi tắm.', p: 'wǒ xǐzǎo' }] },
] }] };
function english(db: Database.Database, hanzi = '洗澡', pinyin = 'xǐzǎo') {
  for (const c of hanzi) db.prepare("INSERT OR IGNORE INTO characters (char, crawl_status) VALUES (?, 'pending')").run(c);
  return findOrCreateMbSense(db, { hanzi, pinyin, wordId: hanzi, definition: 'to bathe', hsk: 2 });
}

test('Hanzii imports are idempotent, preserve English, index Vietnamese, and validate readings', async () => {
  const db = database();
  try {
    const englishId = english(db);
    const target = missingVietnameseCompounds(db)[0];
    saveHanziiWord(db, bathing, target.id);
    saveHanziiWord(db, bathing, target.id);
    assert.equal(db.prepare('SELECT count(*) FROM word_senses').pluck().get(), 2);
    assert.equal(db.prepare('SELECT meaning_en FROM word_senses WHERE id = ?').pluck().get(englishId), 'to bathe');
    assert.equal(db.prepare('SELECT count(*) FROM sense_examples').pluck().get(), 1);
    assert.equal(db.prepare('SELECT pos FROM word_senses WHERE meaning_vi IS NOT NULL').pluck().get(), 'vo');
    assert.equal(missingVietnameseCompounds(db).length, 0);
    assert.throws(() => saveHanziiWord(db, { ...bathing, pinyin: 'xìzǎo' }, target.id), /mismatch/);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    const results = await lookupDictionary('tam', { db, fetchWords: async () => { throw new Error('must use DB'); } });
    assert.equal(results[0].zh, '洗澡');
  } finally { db.close(); }
});

test('characters precede words and character-only entries are searchable by pinyin', async () => {
  const db = database();
  try {
    db.prepare("INSERT INTO characters (char, pinyin, hv_meanings, crawl_status) VALUES ('早', 'zǎo', ?, 'ok')").run('["buổi sáng","sớm"]');
    saveHanziiWord(db, { id: 456, word: '早', pinyin: 'zǎo', content: [{ means: [{ mean: 'sớm' }] }] });
    for (const q of ['早', 'zao']) {
      let calls = 0;
      const results = await lookupDictionary(q, { db, fetchWords: async () => { calls++; return []; } });
      assert.equal(results[0].vn, 'buổi sáng; sớm');
      assert.equal(calls, 0);
    }
  } finally { db.close(); }
});

test('lookup fills an English-only entry then reads its Vietnamese from DB', async () => {
  const db = database();
  try {
    english(db);
    let calls = 0;
    const fetchWords = async () => { calls++; return [bathing]; };
    for (let i = 0; i < 2; i++) {
      const results = await lookupDictionary('洗澡', { db, fetchWords });
      assert.equal(results[0].vn, 'tắm; tắm rửa');
    }
    assert.equal(calls, 1);
  } finally { db.close(); }
});

test('missing exact compound is fetched despite local prefix suggestions and saved with character stubs', async () => {
  const db = database();
  try {
    saveHanziiWord(db, { ...bathing, word: '洗澡间', pinyin: 'xǐzǎojiān' });
    let calls = 0;
    const results = await lookupDictionary('洗澡', { db, fetchWords: async () => { calls++; return [bathing]; } });
    assert.equal(calls, 1);
    assert.equal(results[0].zh, '洗澡');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});

test('Hanzii miss or outage falls back to English; complete misses return empty and are cached', async () => {
  const db = database();
  try {
    english(db);
    assert.equal((await lookupDictionary('洗澡', { db, fetchWords: async () => { throw new Error('offline'); } }))[0].vn, 'to bathe');
    let calls = 0;
    for (let i = 0; i < 2; i++) assert.deepEqual(await lookupDictionary('不存在的词', {
      db, fetchWords: async () => { calls++; return []; },
    }), []);
    assert.equal(calls, 1);
  } finally { db.close(); }
});

test('concurrent identical lookups share one remote request', async () => {
  const db = database();
  try {
    let calls = 0;
    const fetchWords = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return [bathing]; };
    const results = await Promise.all([lookupDictionary('洗澡', { db, fetchWords }), lookupDictionary('洗澡', { db, fetchWords })]);
    assert.equal(calls, 1);
    assert.equal(results[0][0].vn, results[1][0].vn);
  } finally { db.close(); }
});


test('blank Vietnamese does not hide a usable Hanzii or English meaning', async () => {
  const db = database();
  try {
    const id = english(db);
    db.prepare("UPDATE word_senses SET meaning_vi = '   ' WHERE id = ?").run(id);
    let calls = 0;
    const results = await lookupDictionary('洗澡', { db, fetchWords: async () => { calls++; return []; } });
    assert.equal(calls, 1);
    assert.equal(results[0].vn, 'to bathe');
    assert.equal(missingVietnameseCompounds(db).length, 1);
  } finally { db.close(); }
});

test('character quick translations omit classical examples without modifying source data', async () => {
  const db = database();
  const entries = ['(Danh) Chỗ ở, nhà ở.\\n\\n◇Thi Kinh 詩經: ví dụ cổ văn', '(Danh) Bên trong.\n\n§ Thông 裡'];
  try {
    db.prepare("INSERT INTO characters (char, pinyin, hv_dictionary, crawl_status) VALUES ('里', 'lǐ', ?, 'ok')").run(JSON.stringify(entries));
    const result = await lookupDictionary('里', { db, fetchWords: async () => { throw new Error('must use cached data'); } });
    assert.equal(result[0].vn, 'Chỗ ở, nhà ở.; Bên trong.');
    assert.deepEqual(JSON.parse(db.prepare("SELECT hv_dictionary FROM characters WHERE char = '里'").pluck().get() as string), entries);
  } finally { db.close(); }
});
