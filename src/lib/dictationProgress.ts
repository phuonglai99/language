import { isDictationCheckResult, type DictationCheckResult, type DictationSentence } from '@/lib/dictation';

export const DICTATION_PROGRESS_VERSION = 1;
export const DICTATION_SCORING_VERSION = 1;
export type DictationDifficulty = 'easy' | 'normal' | 'hard';
export type WordHintMode = 'hanzi' | 'pinyin';

export type DictationProgressSentence = {
  draft: string;
  hintUsed: boolean;
  wordHintsUsed: Record<string, { hanzi: boolean; pinyin: boolean }>;
  submission?: { input: string; result: DictationCheckResult };
};

export type DictationProgressV1 = {
  version: 1;
  slug: string;
  updatedAt: number;
  contentSignature: string;
  scoringVersion: number;
  currentSentenceIndex: number;
  playbackRate: 0.75 | 1;
  difficulty: DictationDifficulty;
  wordHintMode: WordHintMode;
  sentences: Record<string, DictationProgressSentence>;
};

const PREFIX = 'hsk:dictation:progress:v1:';
const MAX_DRAFT = 20_000;
const MAX_SENTENCES = 1_000;
const MAX_HINTS = 500;

export function dictationProgressKey(slug: string): string {
  return `${PREFIX}${encodeURIComponent(slug)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validString(value: unknown, max = MAX_DRAFT): value is string {
  return typeof value === 'string' && value.length <= max;
}

function validSentence(value: unknown): value is DictationProgressSentence {
  if (!isRecord(value) || !validString(value.draft) || typeof value.hintUsed !== 'boolean' || !isRecord(value.wordHintsUsed)) return false;
  const hints = Object.entries(value.wordHintsUsed);
  if (hints.length > MAX_HINTS || !hints.every(([id, hint]) => validString(id, 200) && isRecord(hint) && typeof hint.hanzi === 'boolean' && typeof hint.pinyin === 'boolean')) return false;
  if (value.submission == null) return true;
  return isRecord(value.submission) && validString(value.submission.input) && isDictationCheckResult(value.submission.result);
}

/** Parses untrusted localStorage safely. Invalid data affects only this lesson key. */
export function parseDictationProgress(value: string, slug: string): DictationProgressV1 | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== 1 || parsed.slug !== slug || !Number.isFinite(parsed.updatedAt) ||
      !validString(parsed.contentSignature, 10_000) || !Number.isInteger(parsed.scoringVersion) ||
      !Number.isInteger(parsed.currentSentenceIndex) || ![0.75, 1].includes(parsed.playbackRate as number) ||
      !['easy', 'normal', 'hard'].includes(parsed.difficulty as string) || !['hanzi', 'pinyin'].includes(parsed.wordHintMode as string) || !isRecord(parsed.sentences)) return null;
    const entries = Object.entries(parsed.sentences);
    if (entries.length > MAX_SENTENCES || !entries.every(([index, sentence]) => /^\d+$/.test(index) && validSentence(sentence))) return null;
    return parsed as DictationProgressV1;
  } catch {
    return null;
  }
}

export function readDictationProgress(slug: string): DictationProgressV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(dictationProgressKey(slug));
    return value ? parseDictationProgress(value, slug) : null;
  } catch { return null; }
}

export function writeDictationProgress(progress: DictationProgressV1): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(dictationProgressKey(progress.slug), JSON.stringify(progress));
    return true;
  } catch { return false; }
}

export function removeDictationProgress(slug: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(dictationProgressKey(slug));
    return true;
  } catch { return false; }
}

/** Stable, timestamp-free fingerprint. FNV-1a is sufficient to invalidate stale local UI state. */
export function dictationContentSignature(sentences: Pick<DictationSentence, 'index' | 'hanzi' | 'words' | 'pinyin' | 'tokens'>[]): string {
  const canonical = JSON.stringify(sentences.map(sentence => ({
    index: sentence.index, hanzi: sentence.hanzi, words: sentence.words, pinyin: sentence.pinyin,
    tokens: sentence.tokens.map(token => ({ id: token.id, text: token.text, kind: token.kind, pinyin: token.pinyin, scorable: token.scorable })),
  })));
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}:${canonical.length}`;
}
