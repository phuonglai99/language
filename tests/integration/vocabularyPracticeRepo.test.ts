import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../../src/server/db/migrate';
import { getVocabularyPracticeBank } from '../../src/server/repos/vocabularyPractice';

test('practice repo selects Vietnamese senses, keeps lesson membership, and excludes unsafe pinyin', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    migrate(db);
    const insertWord = db.prepare("INSERT INTO words (hanzi, pinyin, pinyin_plain, hsk_level, source) VALUES (?, ?, ?, 1, 'manual')");
    const school = Number(insertWord.run('学校', 'xuéxiào', 'xuexiao').lastInsertRowid);
    const mother = Number(insertWord.run('妈妈', 'māma', 'mama').lastInsertRowid);
    const unsafe = Number(insertWord.run('你好', 'nihao', 'nihao').lastInsertRowid);
    const englishOnly = Number(insertWord.run('再见', 'zàijiàn', 'zaijian').lastInsertRowid);
    const insertSense = db.prepare("INSERT INTO word_senses (word_id, position, meaning_vi, meaning_en, source) VALUES (?, 0, ?, ?, 'manual')");
    const schoolSense = Number(insertSense.run(school, 'trường học', 'school').lastInsertRowid);
    insertSense.run(mother, 'mẹ', 'mother');
    insertSense.run(unsafe, 'xin chào', 'hello');
    insertSense.run(englishOnly, null, 'goodbye');
    db.prepare("INSERT INTO lessons (id, title, format, hsk_level, source) VALUES ('lesson-one', 'Bài một', 'hsk2', 1, 'manual')").run();
    db.prepare('INSERT INTO lesson_words (lesson_id, position, word_id, sense_id) VALUES (?, ?, ?, ?)').run('lesson-one', 0, school, schoolSense);

    const hsk = getVocabularyPracticeBank('hsk-1', db);
    assert.ok(hsk);
    assert.equal(hsk.counts['hanzi-to-hanzi'], 4);
    assert.equal(hsk.counts['vi-to-hanzi'], 3);
    assert.equal(hsk.counts['hanzi-to-pinyin'], 3);
    assert.equal(hsk.excluded['pinyin-unmarked'], 1);
    assert.equal(hsk.excluded['meaning-vi-missing'], 1);
    assert.ok(hsk.questions.every(question => !('answer' in question) && !('pinyin' in question)));

    const lesson = getVocabularyPracticeBank('lesson-one', db);
    assert.ok(lesson);
    assert.equal(lesson.questions.length, 3);
    assert.ok(lesson.questions.every(question => question.wordId === school));
    assert.equal(lesson.internal.get(`vp:hanzi-to-pinyin:${school}:${schoolSense}`)?.answer.pinyinNumber, 'xue2 xiao4');
  } finally { db.close(); }
});

test('practice repo does not publish an unresolved Vietnamese synonym prompt', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    migrate(db);
    const word = db.prepare("INSERT INTO words (hanzi, pinyin, pinyin_plain, hsk_level, source) VALUES (?, ?, ?, 1, 'manual')");
    const sense = db.prepare("INSERT INTO word_senses (word_id, position, meaning_vi, source) VALUES (?, 0, 'giáo viên', 'manual')");
    const teacher = Number(word.run('老师', 'lǎoshī', 'laoshi').lastInsertRowid);
    const instructor = Number(word.run('教师', 'jiàoshī', 'jiaoshi').lastInsertRowid);
    sense.run(teacher); sense.run(instructor);
    const bank = getVocabularyPracticeBank('hsk-1', db);
    assert.ok(bank);
    assert.equal(bank.counts['vi-to-hanzi'], 0);
    assert.equal(bank.excluded['meaning-ambiguous'], 2);
    assert.equal(bank.counts['hanzi-to-pinyin'], 2);
  } finally { db.close(); }
});

test('random HSK practice source includes words from every HSK level in the database', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    migrate(db);
    const word = db.prepare("INSERT INTO words (hanzi, pinyin, pinyin_plain, hsk_level, source) VALUES (?, ?, ?, ?, 'manual')");
    const sense = db.prepare("INSERT INTO word_senses (word_id, position, meaning_vi, source) VALUES (?, 0, ?, 'manual')");
    const one = Number(word.run('一', 'yī', 'yi', 1).lastInsertRowid);
    const six = Number(word.run('六', 'liù', 'liu', 6).lastInsertRowid);
    sense.run(one, 'một');
    sense.run(six, 'sáu');

    const bank = getVocabularyPracticeBank('hsk-random', db);
    assert.ok(bank);
    assert.deepEqual(new Set(bank.questions.map(question => question.wordId)), new Set([one, six]));
    assert.equal(bank.counts['hanzi-to-hanzi'], 2);
    assert.equal(bank.counts['vi-to-hanzi'], 2);
    assert.equal(bank.counts['hanzi-to-pinyin'], 2);
  } finally { db.close(); }
});
