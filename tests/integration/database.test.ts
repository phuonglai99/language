import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../../src/server/db/migrate';
import { findOrCreateWord } from '../../src/server/repos/words';

test('migrations initialize a fresh database and preserve data on rerun', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    assert.deepEqual(migrate(db), [1, 2]);
    db.prepare("INSERT INTO note_folders (id, name) VALUES ('test', 'My notes')").run();
    assert.deepEqual(migrate(db), []);
    assert.equal(db.prepare("SELECT name FROM note_folders WHERE id = 'test'").pluck().get(), 'My notes');
    assert.equal(db.prepare("SELECT is_system FROM note_folders WHERE id = 'mistake'").pluck().get(), 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});

test('word import deduplicates neutral tones and transaction rollback removes word and search data', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    migrate(db);
    for (const char of ['东', '西', '好']) {
      db.prepare("INSERT INTO characters (char, crawl_status) VALUES (?, 'pending')").run(char);
    }
    const wordId = db.transaction(() => findOrCreateWord(db, '东西', 'dōngxī', 'import'))();
    assert.equal(findOrCreateWord(db, '东西', 'dōngxi', 'import'), wordId);
    assert.equal(db.prepare('SELECT COUNT(*) FROM word_characters WHERE word_id = ?').pluck().get(wordId), 2);
    const before = db.prepare('SELECT COUNT(*) FROM words_fts').pluck().get();
    assert.throws(() => db.transaction(() => {
      findOrCreateWord(db, '好', 'hǎo', 'import');
      throw new Error('simulated import failure');
    })(), /simulated import failure/);
    assert.equal(db.prepare("SELECT COUNT(*) FROM words WHERE hanzi = '好'").pluck().get(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) FROM words_fts').pluck().get(), before);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});
