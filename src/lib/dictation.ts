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
