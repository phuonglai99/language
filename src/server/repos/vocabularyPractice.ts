import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { parseLessonId } from '@/shared/lessons';
import { posNameVi } from '@/shared/pos';
import { parseSourcePinyin, type PinyinSyllable } from '@/lib/pinyinSyllables';
import { stableHash, VOCABULARY_PRACTICE_SCORING_VERSION, type PracticeKind } from '@/lib/vocabularyPractice';
import type { PracticeAnswerDTO, PracticeBankDTO, PracticeQuestionDTO } from '@/types/api';
import { vocabularyPracticeOverrides, VOCABULARY_PRACTICE_OVERRIDES_VERSION } from '../data/vocabularyPracticeOverrides';

type PracticeRow = {
  word_id: number; hanzi: string; pinyin: string; sense_id: number | null;
  pos: string | null; meaning_vi: string | null; ex_zh: string | null;
  ex_pinyin: string | null; ex_vi: string | null;
};

export type InternalPracticeQuestion = {
  dto: PracticeQuestionDTO;
  answer: PracticeAnswerDTO;
  pinyinSyllables: PinyinSyllable[] | null;
  acceptedHanzi: string[];
  acceptedPinyin: PinyinSyllable[][];
};

export type PracticeBank = PracticeBankDTO & { internal: Map<string, InternalPracticeQuestion> };

const HSK_ROWS = `
  SELECT w.id AS word_id, w.hanzi, w.pinyin, s.id AS sense_id, s.pos, s.meaning_vi,
    e.zh AS ex_zh, e.pinyin AS ex_pinyin, e.vi AS ex_vi
  FROM words w
  LEFT JOIN word_senses s ON s.id = (
    SELECT id FROM word_senses
    WHERE word_id = w.id
    ORDER BY trim(COALESCE(meaning_vi, '')) = '', position, id LIMIT 1
  )
  LEFT JOIN sense_examples e ON e.sense_id = s.id AND e.position = (
    SELECT MIN(position) FROM sense_examples WHERE sense_id = s.id
  )
  WHERE w.hsk_level = ?
  ORDER BY w.pinyin_plain, w.hanzi, w.id
`;

const RANDOM_HSK_ROWS = `
  SELECT w.id AS word_id, w.hanzi, w.pinyin, s.id AS sense_id, s.pos, s.meaning_vi,
    e.zh AS ex_zh, e.pinyin AS ex_pinyin, e.vi AS ex_vi
  FROM words w
  LEFT JOIN word_senses s ON s.id = (
    SELECT id FROM word_senses
    WHERE word_id = w.id
    ORDER BY trim(COALESCE(meaning_vi, '')) = '', position, id LIMIT 1
  )
  LEFT JOIN sense_examples e ON e.sense_id = s.id AND e.position = (
    SELECT MIN(position) FROM sense_examples WHERE sense_id = s.id
  )
  WHERE w.hsk_level BETWEEN 1 AND 6
  ORDER BY w.hsk_level, w.pinyin_plain, w.hanzi, w.id
`;

const LESSON_ROWS = `
  SELECT w.id AS word_id, w.hanzi, w.pinyin, s.id AS sense_id, s.pos, s.meaning_vi,
    e.zh AS ex_zh, e.pinyin AS ex_pinyin, e.vi AS ex_vi
  FROM lesson_words lw
  JOIN words w ON w.id = lw.word_id
  LEFT JOIN word_senses s ON s.id = COALESCE(
    (SELECT id FROM word_senses WHERE id = lw.sense_id AND word_id = w.id AND trim(COALESCE(meaning_vi, '')) <> ''),
    (SELECT id FROM word_senses WHERE word_id = w.id AND trim(COALESCE(meaning_vi, '')) <> '' ORDER BY position, id LIMIT 1),
    (SELECT id FROM word_senses WHERE id = lw.sense_id AND word_id = w.id),
    (SELECT id FROM word_senses WHERE word_id = w.id ORDER BY position, id LIMIT 1)
  )
  LEFT JOIN sense_examples e ON e.sense_id = s.id AND e.position = (
    SELECT MAX(position) FROM sense_examples WHERE sense_id = s.id
  )
  WHERE lw.lesson_id = ?
  ORDER BY lw.position
`;

function questionId(kind: PracticeKind, row: PracticeRow): string {
  return `vp:${kind}:${row.word_id}:${row.sense_id}`;
}

function overrideKey(lessonId: string, row: PracticeRow, kind: PracticeKind): string {
  return `${lessonId}:${row.word_id}:${row.sense_id}:${kind}`;
}

function pureHanzi(value: string): boolean {
  return /^\p{Script=Han}+$/u.test(value.normalize('NFC').replace(/\s/gu, ''));
}

function bump(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1;
}

export function getVocabularyPracticeBank(lessonId: string, db: Database.Database = getDb()): PracticeBank | null {
  const randomHsk = lessonId === 'hsk-random';
  const ref = randomHsk ? null : parseLessonId(lessonId);
  if (!randomHsk && !ref) return null;
  const rows = (randomHsk
    ? db.prepare(RANDOM_HSK_ROWS).all()
    : ref?.kind === 'hsk'
      ? db.prepare(HSK_ROWS).all(ref.level)
      : db.prepare(LESSON_ROWS).all(ref!.id)) as PracticeRow[];
  if (!rows.length) return null;

  const excluded: Record<string, number> = {};
  const questions: PracticeQuestionDTO[] = [];
  const internal = new Map<string, InternalPracticeQuestion>();
  const meaningAnswers = new Map<string, Set<string>>();
  const contextualAnswers = new Map<string, Set<string>>();
  for (const row of rows) {
    const meaning = row.meaning_vi?.trim();
    if (!meaning) continue;
    const key = `${meaning.toLocaleLowerCase('vi')}|${row.pos ?? ''}`;
    const hanzi = row.hanzi.normalize('NFC').replace(/\s/gu, '');
    const answers = meaningAnswers.get(key) ?? new Set<string>();
    answers.add(hanzi); meaningAnswers.set(key, answers);
    const contextualKey = `${key}|${row.ex_vi?.trim().toLocaleLowerCase('vi') ?? ''}`;
    const contextual = contextualAnswers.get(contextualKey) ?? new Set<string>();
    contextual.add(hanzi); contextualAnswers.set(contextualKey, contextual);
  }

  for (const row of rows) {
    if (row.sense_id == null) { bump(excluded, 'sense-missing'); continue; }
    const hanzi = row.hanzi.normalize('NFC').replace(/\s/gu, '');
    if (!pureHanzi(hanzi)) { bump(excluded, 'hanzi-unsupported'); continue; }
    const meaningVi = row.meaning_vi?.trim() ?? '';
    const pos = posNameVi(row.pos);
    const parsedPinyin = parseSourcePinyin(row.pinyin);
    const baseAnswer: PracticeAnswerDTO = {
      hanzi, pinyin: row.pinyin, pinyinNumber: parsedPinyin.ok ? parsedPinyin.numbered : '',
      meaningVi, pos,
      example: { zh: row.ex_zh ?? '', pinyin: row.ex_pinyin ?? '', vi: row.ex_vi ?? '' },
    };

    const add = (kind: PracticeKind, dto: PracticeQuestionDTO, pinyinSyllables: PinyinSyllable[] | null) => {
      const override = vocabularyPracticeOverrides[overrideKey(lessonId, row, kind)];
      const acceptedPinyin = pinyinSyllables ? [pinyinSyllables] : [];
      for (const value of override?.acceptedNumberedPinyin ?? []) {
        const parts = [...value.replace(/\s/gu, '').matchAll(/([a-zvü]+)([1-5])/gi)];
        if (parts.map(part => part[0]).join('').length === value.replace(/\s/gu, '').length) {
          acceptedPinyin.push(parts.map(part => ({ base: part[1].toLowerCase().replace(/ü/g, 'v'), tone: Number(part[2]) as PinyinSyllable['tone'] })));
        }
      }
      const acceptedHanzi = [hanzi, ...(override?.acceptedHanzi ?? [])];
      const item = { dto, answer: baseAnswer, pinyinSyllables, acceptedHanzi, acceptedPinyin };
      questions.push(dto); internal.set(dto.questionId, item);
    };

    if (parsedPinyin.ok) {
      const kind = 'hanzi-to-pinyin';
      add(kind, { questionId: questionId(kind, row), kind, wordId: row.word_id, wordKey: stableHash(hanzi), senseId: row.sense_id, pos, hanzi, meaningVi }, parsedPinyin.syllables);
    } else bump(excluded, `pinyin-${parsedPinyin.reason}`);

    {
      const kind = 'hanzi-to-hanzi';
      add(kind, { questionId: questionId(kind, row), kind, wordId: row.word_id, wordKey: stableHash(hanzi), senseId: row.sense_id, pos, hanzi, meaningVi }, null);
    }

    const meaningKey = `${meaningVi.toLocaleLowerCase('vi')}|${row.pos ?? ''}`;
    const contextualKey = `${meaningKey}|${row.ex_vi?.trim().toLocaleLowerCase('vi') ?? ''}`;
    const meaningIsAmbiguous = (meaningAnswers.get(meaningKey)?.size ?? 0) > 1;
    const contextIsUnique = !!row.ex_vi?.trim() && (contextualAnswers.get(contextualKey)?.size ?? 0) === 1;
    if (!meaningVi) {
      bump(excluded, 'meaning-vi-missing');
    } else if (meaningIsAmbiguous && !contextIsUnique) {
      bump(excluded, 'meaning-ambiguous');
    } else {
      const kind = 'vi-to-hanzi';
      add(kind, { questionId: questionId(kind, row), kind, wordId: row.word_id, wordKey: stableHash(hanzi), senseId: row.sense_id, pos, meaningVi, exampleVi: row.ex_vi ?? '' }, null);
    }
  }

  const signaturePayload = [...internal.values()].map(item => ({
    question: item.dto, answer: item.answer, acceptedHanzi: item.acceptedHanzi,
    acceptedPinyin: item.acceptedPinyin,
  }));
  const contentSignature = stableHash({ lessonId, overrides: VOCABULARY_PRACTICE_OVERRIDES_VERSION, questions: signaturePayload });
  const counts = {
    'hanzi-to-pinyin': questions.filter(q => q.kind === 'hanzi-to-pinyin').length,
    'hanzi-to-hanzi': questions.filter(q => q.kind === 'hanzi-to-hanzi').length,
    'vi-to-hanzi': questions.filter(q => q.kind === 'vi-to-hanzi').length,
  };
  return { lessonId, contentSignature, scoringVersion: VOCABULARY_PRACTICE_SCORING_VERSION, questions, counts, excluded, internal };
}
