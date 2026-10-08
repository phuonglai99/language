import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradeHanzi, gradePinyin, parseHanziInput, parseNumericPinyin } from '../../src/lib/vocabularyPractice';
import { parseSourcePinyin } from '../../src/lib/pinyinSyllables';
import { buildPracticeQueue, defaultPracticeConfig, parseVocabularyPracticeProgress } from '../../src/lib/vocabularyPracticeProgress';
import type { PracticeQuestionDTO } from '../../src/types/api';

test('source pinyin splits marked unspaced words and preserves explicit boundaries and neutral tone', () => {
  assert.deepEqual(parseSourcePinyin('xuéxiào'), {
    ok: true, numbered: 'xue2 xiao4', syllables: [{ base: 'xue', tone: 2 }, { base: 'xiao', tone: 4 }],
  });
  assert.deepEqual(parseSourcePinyin('māma'), {
    ok: true, numbered: 'ma1 ma5', syllables: [{ base: 'ma', tone: 1 }, { base: 'ma', tone: 5 }],
  });
  assert.deepEqual(parseSourcePinyin("Xī'ān"), {
    ok: true, numbered: 'xi1 an1', syllables: [{ base: 'xi', tone: 1 }, { base: 'an', tone: 1 }],
  });
  assert.equal(parseSourcePinyin('xuexiao').ok, false);
});

test('numeric pinyin consumes all input and treats spaces, case, v and ü as specified', () => {
  assert.deepEqual(parseNumericPinyin(' XUE2   XIAO4 '), parseNumericPinyin('xue2xiao4'));
  assert.deepEqual(parseNumericPinyin('lü4'), parseNumericPinyin('lv4'));
  for (const value of ['xue2xiao', 'xue2xiao44', 'xue2!xiao4', 'ma1 ma0']) {
    assert.equal(parseNumericPinyin(value).ok, false, value);
  }
  const marked = parseNumericPinyin('xué xiào');
  assert.equal(marked.ok, false);
  if (!marked.ok) assert.equal(marked.error, 'pinyin-marks');
});

test('pinyin grading distinguishes sound, tone, missing and extra syllables with alignment', () => {
  const expected = [{ base: 'xue', tone: 2 as const }, { base: 'xiao', tone: 4 as const }];
  const tone = parseNumericPinyin('xue2 xiao3');
  const sound = parseNumericPinyin('xue2 xia4');
  assert.ok(tone.ok && sound.ok);
  if (tone.ok) assert.deepEqual(gradePinyin(tone.syllables, expected).issues.map(issue => issue.kind), ['wrong-tone']);
  if (sound.ok) assert.deepEqual(gradePinyin(sound.syllables, expected).issues.map(issue => issue.kind), ['wrong-base']);
  assert.deepEqual(gradePinyin([{ base: 'xiao', tone: 4 }], expected).issues.map(issue => issue.kind), ['missing']);
  assert.deepEqual(gradePinyin([...expected, { base: 'ma', tone: 5 }], expected).issues.map(issue => issue.kind), ['extra']);
});

test('hanzi grading ignores all Unicode whitespace but rejects leftover Latin and punctuation', () => {
  assert.deepEqual(gradeHanzi(' 学\t校\n', ['学校']), { correct: true, normalized: '学校' });
  assert.equal(parseHanziInput('xuexiao').ok, false);
  assert.equal(parseHanziInput('学校。').ok, false);
});

test('mixed queue spaces forms of the same word and defers extra forms for tiny sets', () => {
  const questions: PracticeQuestionDTO[] = [];
  for (let wordId = 1; wordId <= 4; wordId++) {
    questions.push({ questionId: `p${wordId}`, kind: 'hanzi-to-pinyin', wordId, wordKey: `word-${wordId}`, senseId: wordId, pos: '', hanzi: `字${wordId}`, meaningVi: `nghĩa ${wordId}` });
    questions.push({ questionId: `v${wordId}`, kind: 'vi-to-hanzi', wordId, wordKey: `word-${wordId}`, senseId: wordId, pos: '', meaningVi: `nghĩa ${wordId}`, exampleVi: '' });
  }
  const built = buildPracticeQueue(questions, { ...defaultPracticeConfig(), count: 'all' }, () => 0.5);
  const words = built.queue.map(item => Number(item.questionId.slice(1)));
  for (let i = 0; i < words.length; i++) {
    const next = words.indexOf(words[i], i + 1);
    if (next >= 0) assert.ok(next - i >= 4);
  }
  const tiny = buildPracticeQueue(questions.filter(question => question.wordId <= 2), { ...defaultPracticeConfig(), count: 'all' }, () => 0.5);
  assert.ok(tiny.queue.some(item => item.phase === 'deferred'));
});

test('progress parser rejects corrupt and cross-lesson storage', () => {
  assert.equal(parseVocabularyPracticeProgress('{', 'lesson-a'), null);
  const progress = {
    version: 1, lessonId: 'lesson-a', updatedAt: 1, contentSignature: 'sig', scoringVersion: 1,
    config: defaultPracticeConfig(), queue: [], initialQuestionIds: [], currentIndex: 0, records: {},
  };
  assert.deepEqual(parseVocabularyPracticeProgress(JSON.stringify(progress), 'lesson-a'), progress);
  assert.equal(parseVocabularyPracticeProgress(JSON.stringify(progress), 'lesson-b'), null);

  const legacyConfig = { direction: 'mixed', hanziInput: 'pinyin', includeHanziCopy: false, count: 10 };
  const migrated = parseVocabularyPracticeProgress(JSON.stringify({ ...progress, config: legacyConfig }), 'lesson-a');
  assert.equal(migrated?.config.autoSaveNotes, false);
  assert.equal(migrated?.config.noteFolderId, '');
});
