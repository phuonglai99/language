import type { MBLessonWord } from '@/lib/db';

export interface DictationSentence {
  index: number;
  hanzi: string;
  pinyin: string;
  wordCount: number;
}

export type CharStatus = 'correct' | 'wrong' | 'missing' | 'extra';

export interface CharResult {
  char: string;
  status: CharStatus;
  expected?: string;
}

const PUNCT_RE = /[，。？！：；「」『』、""''【】（）…—·\s]/g;

export function cleanHanzi(input: string): string {
  return input.replace(PUNCT_RE, '');
}

export function extractSentences(content: MBLessonWord[][]): DictationSentence[] {
  return content
    .map((para, index) => {
      const hanzi = para.map(w => w.hanzi).join('');
      const pinyin = para.map(w => w.pinyin).filter(Boolean).join(' ');
      const wordCount = para.filter(w => w.hanzi.trim() && !/^[\s，。？！、：；""''「」【】（）…—·]+$/.test(w.hanzi)).length;
      return { index, hanzi, pinyin, wordCount };
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
