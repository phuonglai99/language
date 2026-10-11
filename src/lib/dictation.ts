import { isPunctChar, isPunctToken, stripPunct } from '@/shared/text';
import type { MBLessonWord } from '@/types/api';

export type WordStatus = 'empty' | 'partial' | 'correct' | 'wrong' | 'extra';
export type WordKind = 'hanzi' | 'number' | 'latin' | 'mixed' | 'symbol';

/** A source token, kept intact so scoring never accidentally changes its weighting. */
export interface DictationToken {
  id: string;
  text: string;
  pinyin: string;
  kind: WordKind;
  scorable: boolean;
}

export interface DictationSentence {
  index: number;
  hanzi: string;
  pinyin: string;
  wordCount: number;
  /** Compatibility field used by the checker; only scorable source tokens are included. */
  words: string[];
  tokens: DictationToken[];
}

export interface WordSlot {
  /** Stable source-token id when available. */
  id?: string;
  /** Original text, including display-only punctuation. */
  text?: string;
  expected: string;
  typed: string;
  status: WordStatus;
  kind: WordKind;
  showHint: boolean;
}

export interface DictationCheckResult {
  result: WordSlot[];
  correct_hanzi: string;
  pinyin: string;
  is_perfect: boolean;
}

const NUMBER_RE = /^[0-9]+$/;
const LATIN_RE = /^[A-Za-z]+$/;
const CN_DIGIT: Record<string, string> = {
  零: '0', 〇: '0', 一: '1', 二: '2', 两: '2', 三: '3',
  四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
};

/** Punctuation and symbols are displayed but never make an answer wrong. */
export function cleanHanzi(input: string): string {
  return stripPunct(input);
}

export function normalizeDictationInput(input: string): string {
  return cleanHanzi(input).replace(
    /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  );
}

export function tokenKind(text: string): WordKind {
  const normalized = normalizeDictationInput(text);
  if (!normalized) return 'symbol';
  if (NUMBER_RE.test(normalized)) return 'number';
  if (LATIN_RE.test(normalized)) return 'latin';
  if (/[0-9A-Za-z]/.test(normalized)) return 'mixed';
  return 'hanzi';
}

export function isHintToken(text: string): boolean {
  return tokenKind(text) !== 'hanzi' && tokenKind(text) !== 'symbol';
}

function chineseDigitsToArabic(s: string): string | null {
  let out = '';
  for (const ch of s) {
    const digit = CN_DIGIT[ch];
    if (!digit) return null;
    out += digit;
  }
  return out;
}

function tokensEqual(typed: string, expected: string, kind: WordKind): boolean {
  if (typed === expected) return true;
  if (kind === 'latin' || kind === 'mixed') return typed.toLowerCase() === expected.toLowerCase();
  if (kind === 'number') {
    const asArabic = chineseDigitsToArabic(typed);
    return asArabic != null && asArabic === expected;
  }
  return false;
}

function tokenPrefixMatch(typed: string, expected: string, kind: WordKind): boolean {
  if (expected.startsWith(typed)) return true;
  if (kind === 'latin' || kind === 'mixed') return expected.toLowerCase().startsWith(typed.toLowerCase());
  if (kind === 'number') {
    const asArabic = chineseDigitsToArabic(typed);
    return asArabic != null && expected.startsWith(asArabic);
  }
  return false;
}

function pinyinHintToken(word: MBLessonWord): string {
  const pinyin = word.pinyin.trim();
  if (pinyin) return pinyin;
  const text = normalizeDictationInput(word.hanzi.trim());
  return NUMBER_RE.test(text) || LATIN_RE.test(text) ? text : '';
}

export function extractContentWords(para: { hanzi: string }[]): string[] {
  return para.map(word => normalizeDictationInput(word.hanzi)).filter(Boolean);
}

/** Converts persisted passage words into display and scoring tokens without splitting word weight. */
export function extractDictationTokens(para: MBLessonWord[], sentenceIndex: number): DictationToken[] {
  return para.map((word, wordIndex) => {
    const text = word.hanzi ?? '';
    const scorable = normalizeDictationInput(text).length > 0;
    return {
      id: `${sentenceIndex}:${wordIndex}`,
      text,
      pinyin: pinyinHintToken(word),
      kind: scorable ? tokenKind(text) : 'symbol',
      scorable,
    };
  });
}

function asScorableTokens(words: string[] | DictationToken[]): DictationToken[] {
  if (!words.length) return [];
  if (typeof words[0] === 'string') {
    return (words as string[]).map((text, index) => ({
      id: `legacy:${index}`,
      text,
      pinyin: '',
      kind: tokenKind(text),
      scorable: normalizeDictationInput(text).length > 0,
    })).filter(token => token.scorable);
  }
  return (words as DictationToken[]).filter(token => token.scorable);
}

/**
 * Scores source words only. Punctuation/symbols are removed on both sides while the
 * original source text stays on each slot for the UI to render it in-place.
 */
export function matchDictationWords(userInput: string, words: string[] | DictationToken[]): WordSlot[] {
  const cleaned = normalizeDictationInput(userInput);
  let cursor = 0;
  const slots: WordSlot[] = asScorableTokens(words).map(token => {
    const expected = normalizeDictationInput(token.text);
    const typed = cleaned.slice(cursor, cursor + expected.length);
    cursor += typed.length;

    let status: WordStatus;
    if (!typed) status = 'empty';
    else if (typed.length < expected.length) status = tokenPrefixMatch(typed, expected, token.kind) ? 'partial' : 'wrong';
    else status = tokensEqual(typed, expected, token.kind) ? 'correct' : 'wrong';

    return { id: token.id, text: token.text, expected, typed, status, kind: token.kind, showHint: false };
  });

  if (cursor < cleaned.length) {
    slots.push({ expected: '', typed: cleaned.slice(cursor), status: 'extra', kind: 'hanzi', showHint: false });
  }
  return slots;
}

export function isDictationPerfect(slots: WordSlot[]): boolean {
  return slots.some(slot => slot.expected) && slots.every(slot => slot.status === 'correct');
}

/** Verifies response data before it is shown or persisted in localStorage. */
export function isDictationCheckResult(value: unknown): value is DictationCheckResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<DictationCheckResult>;
  if (!Array.isArray(result.result) || typeof result.correct_hanzi !== 'string' || typeof result.pinyin !== 'string' || typeof result.is_perfect !== 'boolean') return false;
  return result.result.every(slot =>
    slot && typeof slot === 'object' &&
    typeof slot.expected === 'string' && typeof slot.typed === 'string' &&
    typeof slot.showHint === 'boolean' &&
    ['empty', 'partial', 'correct', 'wrong', 'extra'].includes(slot.status) &&
    ['hanzi', 'number', 'latin', 'mixed', 'symbol'].includes(slot.kind) &&
    (slot.id == null || typeof slot.id === 'string') && (slot.text == null || typeof slot.text === 'string'),
  );
}

export function extractSentences(content: MBLessonWord[][]): DictationSentence[] {
  return content.map((para, index) => {
    const tokens = extractDictationTokens(para, index);
    const words = tokens.filter(token => token.scorable).map(token => normalizeDictationInput(token.text));
    return {
      index,
      hanzi: para.map(word => word.hanzi).join(''),
      pinyin: tokens.filter(token => token.scorable).map(token => token.pinyin).filter(Boolean).join(' '),
      wordCount: words.length,
      words,
      tokens,
    };
  }).filter(sentence => sentence.wordCount > 0);
}

function normHanzi(s: string): string {
  return s.replace(/\s+/g, '');
}

/** Rebuild word paragraphs so each assigned sentence stays one playable unit. */
export function remapContentToSentences(original: MBLessonWord[][], sentenceHanzis: string[]): MBLessonWord[][] {
  const words = original.flat();
  let wi = 0;
  const out: MBLessonWord[][] = [];
  for (const hanzi of sentenceHanzis) {
    const needle = normHanzi(hanzi);
    if (!needle) {
      out.push([{ hanzi: hanzi || '', pinyin: '', hsk: null, definition: null }]);
      continue;
    }
    const startWi = wi;
    const para: MBLessonWord[] = [];
    let acc = '';
    let matched = false;
    while (wi < words.length) {
      para.push(words[wi]);
      acc += words[wi].hanzi;
      wi++;
      const normalized = normHanzi(acc);
      if (normalized === needle || normalized.startsWith(needle)) { matched = true; break; }
      if (needle.startsWith(normalized)) continue;
      break;
    }
    if (!matched) {
      wi = startWi;
      out.push([{ hanzi, pinyin: '', hsk: null, definition: null }]);
    } else out.push(para);
  }
  if (wi < words.length && out.length) out[out.length - 1] = [...out[out.length - 1], ...words.slice(wi)];
  return out;
}

export function locateSentenceSpans(raw: string, sentences: { hanzi: string }[]): ({ start: number; end: number } | null)[] {
  const spans: ({ start: number; end: number } | null)[] = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const needle = sentence.hanzi.trim();
    if (!needle) { spans.push(null); continue; }
    const found = raw.indexOf(needle, cursor);
    if (found >= 0) {
      spans.push({ start: found, end: found + needle.length });
      cursor = found + needle.length;
    } else spans.push(null);
  }
  return spans;
}

/** Used by the client renderer to preserve punctuation in its exact source position. */
export function isDictationDisplaySymbol(ch: string): boolean {
  return isPunctChar(ch) || isPunctToken(ch);
}
