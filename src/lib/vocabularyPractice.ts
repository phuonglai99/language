import type { PinyinSyllable } from './pinyinSyllables';

export const VOCABULARY_PRACTICE_SCORING_VERSION = 1;
export type PracticeKind = 'hanzi-to-pinyin' | 'hanzi-to-hanzi' | 'vi-to-hanzi';
export type PinyinIssueKind = 'wrong-base' | 'wrong-tone' | 'missing' | 'extra';

export type PinyinIssue = {
  kind: PinyinIssueKind;
  expectedIndex: number | null;
  actualIndex: number | null;
  expected?: PinyinSyllable;
  actual?: PinyinSyllable;
};

export type PinyinGrade = {
  correct: boolean;
  expected: PinyinSyllable[];
  actual: PinyinSyllable[];
  issues: PinyinIssue[];
};

export type PracticeFormatError = 'empty' | 'pinyin-format' | 'pinyin-marks' | 'hanzi-format';

export type ParsedPracticeInput =
  | { ok: true; syllables: PinyinSyllable[]; normalized: string }
  | { ok: false; error: PracticeFormatError };

const COMBINING_TONE_RE = /[\u0300\u0301\u0304\u030c]/u;

/** Parses numeric learner input and consumes the complete non-whitespace string. */
export function parseNumericPinyin(raw: string): ParsedPracticeInput {
  const normalized = raw.normalize('NFC').toLowerCase().replace(/\s/gu, '').replace(/ü/g, 'v');
  if (!normalized) return { ok: false, error: 'empty' };
  if (COMBINING_TONE_RE.test(raw.normalize('NFD')) || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/iu.test(raw)) {
    return { ok: false, error: 'pinyin-marks' };
  }
  const matches = [...normalized.matchAll(/([a-zv]+)([1-5])/g)];
  if (!matches.length || matches.map(match => match[0]).join('') !== normalized) {
    return { ok: false, error: 'pinyin-format' };
  }
  const syllables = matches.map(match => ({
    base: match[1], tone: Number(match[2]) as PinyinSyllable['tone'],
  }));
  return { ok: true, syllables, normalized: syllables.map(s => `${s.base}${s.tone}`).join('') };
}

function substitutionIssue(expected: PinyinSyllable, actual: PinyinSyllable): PinyinIssueKind {
  return expected.base === actual.base ? 'wrong-tone' : 'wrong-base';
}

/** Levenshtein alignment prevents one omitted syllable shifting every later error. */
export function gradePinyin(actual: PinyinSyllable[], expected: PinyinSyllable[]): PinyinGrade {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const cost = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) cost[i][0] = i;
  for (let j = 0; j < cols; j++) cost[0][j] = j;
  for (let i = 1; i < rows; i++) for (let j = 1; j < cols; j++) {
    const equal = expected[i - 1].base === actual[j - 1].base && expected[i - 1].tone === actual[j - 1].tone;
    cost[i][j] = equal ? cost[i - 1][j - 1] : Math.min(cost[i - 1][j - 1], cost[i - 1][j], cost[i][j - 1]) + 1;
  }
  const reversed: PinyinIssue[] = [];
  let i = expected.length, j = actual.length;
  while (i || j) {
    const equal = i > 0 && j > 0 && expected[i - 1].base === actual[j - 1].base && expected[i - 1].tone === actual[j - 1].tone;
    if (equal) { i--; j--; continue; }
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + 1) {
      reversed.push({ kind: substitutionIssue(expected[i - 1], actual[j - 1]), expectedIndex: i - 1, actualIndex: j - 1, expected: expected[i - 1], actual: actual[j - 1] });
      i--; j--; continue;
    }
    if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      reversed.push({ kind: 'missing', expectedIndex: i - 1, actualIndex: null, expected: expected[i - 1] }); i--; continue;
    }
    reversed.push({ kind: 'extra', expectedIndex: null, actualIndex: j - 1, actual: actual[j - 1] }); j--;
  }
  return { correct: reversed.length === 0, expected, actual, issues: reversed.reverse() };
}

export function normalizeHanziAnswer(raw: string): string {
  return raw.normalize('NFC').replace(/\s/gu, '');
}

export function parseHanziInput(raw: string): { ok: true; normalized: string } | { ok: false; error: PracticeFormatError } {
  const normalized = normalizeHanziAnswer(raw);
  if (!normalized) return { ok: false, error: 'empty' };
  if (!/^\p{Script=Han}+$/u.test(normalized)) return { ok: false, error: 'hanzi-format' };
  return { ok: true, normalized };
}

export function gradeHanzi(raw: string, accepted: string[]): { correct: boolean; normalized: string } | { error: PracticeFormatError } {
  const parsed = parseHanziInput(raw);
  if (!parsed.ok) return { error: parsed.error };
  return { correct: accepted.some(answer => normalizeHanziAnswer(answer) === parsed.normalized), normalized: parsed.normalized };
}

export function stableHash(value: unknown): string {
  const canonical = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}:${canonical.length}`;
}
