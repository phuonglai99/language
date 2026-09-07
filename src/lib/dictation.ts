import type { MBLessonWord } from '@/lib/db';

export interface DictationSentence {
  index: number;
  hanzi: string;
  pinyin: string;
  wordCount: number;
  words: string[];
}

export type CharStatus = 'correct' | 'wrong' | 'missing' | 'extra';

export interface CharResult {
  char: string;
  status: CharStatus;
  expected?: string;
}

export type WordStatus = 'empty' | 'partial' | 'correct' | 'wrong' | 'extra';
export type WordKind = 'hanzi' | 'number' | 'latin' | 'mixed';

export interface WordSlot {
  expected: string;
  typed: string;
  status: WordStatus;
  kind: WordKind;
  showHint: boolean;
}

const PUNCT_RE = /[，。？！：；「」『』、""''【】（）…—·\s]/g;
const NUMBER_RE = /^[0-9０-９]+$/;
const LATIN_RE = /^[A-Za-zＡ-Ｚａ-ｚ]+$/;
const CN_DIGIT: Record<string, string> = {
  零: '0', 〇: '0', 一: '1', 二: '2', 两: '2', 三: '3',
  四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
};

export function cleanHanzi(input: string): string {
  return input.replace(PUNCT_RE, '');
}

export function normalizeDictationInput(input: string): string {
  return cleanHanzi(input).replace(
    /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  );
}

export function tokenKind(hanzi: string): WordKind {
  const h = normalizeDictationInput(hanzi);
  if (!h) return 'hanzi';
  if (NUMBER_RE.test(h)) return 'number';
  if (LATIN_RE.test(h)) return 'latin';
  if (/[0-9A-Za-z]/.test(h)) return 'mixed';
  return 'hanzi';
}

export function isHintToken(hanzi: string): boolean {
  return tokenKind(hanzi) !== 'hanzi';
}

function chineseDigitsToArabic(s: string): string | null {
  let out = '';
  for (const ch of s) {
    const d = CN_DIGIT[ch];
    if (!d) return null;
    out += d;
  }
  return out;
}

function tokensEqual(typed: string, expected: string, kind: WordKind): boolean {
  if (typed === expected) return true;
  if (kind === 'latin' || kind === 'mixed') {
    return typed.toLowerCase() === expected.toLowerCase();
  }
  if (kind === 'number') {
    const asArabic = chineseDigitsToArabic(typed);
    return asArabic != null && asArabic === expected;
  }
  return false;
}

function tokenPrefixMatch(typed: string, expected: string, kind: WordKind): boolean {
  if (expected.startsWith(typed)) return true;
  if (kind === 'latin' || kind === 'mixed') {
    return expected.toLowerCase().startsWith(typed.toLowerCase());
  }
  if (kind === 'number') {
    const asArabic = chineseDigitsToArabic(typed);
    return asArabic != null && expected.startsWith(asArabic);
  }
  return false;
}

export function extractContentWords(para: { hanzi: string }[]): string[] {
  return para.map(w => normalizeDictationInput(w.hanzi)).filter(h => h.length > 0);
}

export function matchDictationWords(userInput: string, words: string[]): WordSlot[] {
  const cleaned = normalizeDictationInput(userInput);
  let cursor = 0;
  const slots: WordSlot[] = words.map(raw => {
    const expected = normalizeDictationInput(raw);
    const kind = tokenKind(expected);
    const typed = cleaned.slice(cursor, cursor + expected.length);
    cursor += typed.length;
    const showHint = kind !== 'hanzi';

    let status: WordStatus;
    if (!typed) status = 'empty';
    else if (typed.length < expected.length) {
      status = tokenPrefixMatch(typed, expected, kind) ? 'partial' : 'wrong';
    } else {
      status = tokensEqual(typed, expected, kind) ? 'correct' : 'wrong';
    }

    return { expected, typed, status, kind, showHint };
  });

  if (cursor < cleaned.length) {
    slots.push({
      expected: '',
      typed: cleaned.slice(cursor),
      status: 'extra',
      kind: 'hanzi',
      showHint: false,
    });
  }
  return slots;
}

export function isDictationPerfect(slots: WordSlot[]): boolean {
  return slots.length > 0 && slots.every(s => s.status === 'correct');
}

function pinyinHintToken(word: MBLessonWord): string {
  const pinyin = word.pinyin.trim();
  if (pinyin) return pinyin;

  const hanzi = word.hanzi.trim();
  return NUMBER_RE.test(hanzi) || LATIN_RE.test(hanzi) ? hanzi : '';
}

export function extractSentences(content: MBLessonWord[][]): DictationSentence[] {
  return content
    .map((para, index) => {
      const words = extractContentWords(para);
      const hanzi = para.map(w => w.hanzi).join('');
      const pinyin = para.map(pinyinHintToken).filter(Boolean).join(' ');
      return { index, hanzi, pinyin, wordCount: words.length, words };
    })
    .filter(s => s.wordCount > 0);
}

function normHanzi(s: string): string {
  return s.replace(/\s+/g, '');
}

/** Rebuild word paragraphs so each assigned sentence stays one playable unit. */
export function remapContentToSentences(
  original: MBLessonWord[][],
  sentenceHanzis: string[],
): MBLessonWord[][] {
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
      const accN = normHanzi(acc);
      if (accN === needle || accN.startsWith(needle)) {
        matched = true;
        break;
      }
      if (needle.startsWith(accN)) continue;
      break;
    }

    if (!matched) {
      wi = startWi;
      out.push([{ hanzi, pinyin: '', hsk: null, definition: null }]);
    } else {
      out.push(para);
    }
  }
  if (wi < words.length && out.length > 0) {
    out[out.length - 1] = [...out[out.length - 1], ...words.slice(wi)];
  }
  return out;
}

export function locateSentenceSpans(
  raw: string,
  sentences: { hanzi: string }[],
): ({ start: number; end: number } | null)[] {
  const spans: ({ start: number; end: number } | null)[] = [];
  let cursor = 0;
  for (const s of sentences) {
    const needle = s.hanzi.trim();
    if (!needle) {
      spans.push(null);
      continue;
    }
    const found = raw.indexOf(needle, cursor);
    if (found >= 0) {
      spans.push({ start: found, end: found + needle.length });
      cursor = found + needle.length;
    } else {
      spans.push(null);
    }
  }
  return spans;
}

export function diffHanzi(userInput: string, correct: string): CharResult[] {
  const u = cleanHanzi(userInput).split('');
  const c = cleanHanzi(correct).split('');
  const results: CharResult[] = [];
  const maxLen = Math.max(u.length, c.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= u.length) {
      results.push({ char: c[i], status: 'missing' });
    } else if (i >= c.length) {
      results.push({ char: u[i], status: 'extra' });
    } else if (u[i] === c[i]) {
      results.push({ char: u[i], status: 'correct' });
    } else {
      results.push({ char: u[i], status: 'wrong', expected: c[i] });
    }
  }
  return results;
}
