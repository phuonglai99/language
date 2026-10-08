import type { PracticeAnswerDTO, PracticeCheckDTO, PracticeKindDTO, PracticeQuestionDTO } from '@/types/api';

export const VOCABULARY_PRACTICE_PROGRESS_VERSION = 1;
export type PracticeDirection = 'hanzi' | 'vi' | 'mixed';
export type PracticeCount = 10 | 20 | 30 | 'all';

export type PracticeConfig = {
  direction: PracticeDirection;
  hanziInput: 'pinyin' | 'hanzi';
  includeHanziCopy: boolean;
  count: PracticeCount;
  autoSaveNotes: boolean;
  noteFolderId: string;
};

export type PracticeQueueItem = { questionId: string; phase: 'main' | 'deferred' | 'review' };

export type PracticeRecord = {
  draft: string;
  validAttempts: number;
  answerViewed: boolean;
  skipped: boolean;
  firstTryCorrect: boolean;
  reviewScheduled: boolean;
  submission?: PracticeCheckDTO;
  revealedAnswer?: PracticeAnswerDTO;
};

export type VocabularyPracticeProgressV1 = {
  version: 1;
  lessonId: string;
  updatedAt: number;
  contentSignature: string;
  scoringVersion: number;
  config: PracticeConfig;
  queue: PracticeQueueItem[];
  initialQuestionIds: string[];
  currentIndex: number;
  records: Record<string, PracticeRecord>;
};

const PREFIX = 'hsk:vocabulary-practice:progress:v1:';
const MAX_ITEMS = 10_000;

export function vocabularyPracticeProgressKey(lessonId: string): string {
  return `${PREFIX}${encodeURIComponent(lessonId)}`;
}

export function defaultPracticeConfig(): PracticeConfig {
  return { direction: 'mixed', hanziInput: 'pinyin', includeHanziCopy: false, count: 10, autoSaveNotes: false, noteFolderId: '' };
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function selectedKinds(config: PracticeConfig): PracticeKindDTO[] {
  if (config.direction === 'hanzi') return [config.hanziInput === 'pinyin' ? 'hanzi-to-pinyin' : 'hanzi-to-hanzi'];
  if (config.direction === 'vi') return ['vi-to-hanzi'];
  return config.includeHanziCopy
    ? ['hanzi-to-pinyin', 'vi-to-hanzi', 'hanzi-to-hanzi']
    : ['hanzi-to-pinyin', 'vi-to-hanzi'];
}

export function questionsForConfig(questions: PracticeQuestionDTO[], config: PracticeConfig): PracticeQuestionDTO[] {
  const kinds = new Set(selectedKinds(config));
  return questions.filter(question => kinds.has(question.kind));
}

/** Builds rounds by word, so another form of a word is at least one full word round away. */
export function buildPracticeQueue(
  questions: PracticeQuestionDTO[], config: PracticeConfig, random: () => number = Math.random,
): { queue: PracticeQueueItem[]; initialQuestionIds: string[]; wordCount: number } {
  const eligible = questionsForConfig(questions, config);
  const byWord = new Map<string, PracticeQuestionDTO[]>();
  for (const question of eligible) {
    const bucket = byWord.get(question.wordKey) ?? [];
    bucket.push(question); byWord.set(question.wordKey, bucket);
  }
  const maxWords = config.count === 'all' ? byWord.size : config.count;
  const words = shuffled([...byWord.keys()], random).slice(0, maxWords);
  const queue: PracticeQueueItem[] = [];
  const maxForms = Math.max(0, ...words.map(word => byWord.get(word)?.length ?? 0));
  for (let round = 0; round < maxForms; round++) {
    const phase = words.length < 4 && round > 0 ? 'deferred' : 'main';
    for (const word of words) {
      const question = byWord.get(word)?.[round];
      if (question) queue.push({ questionId: question.questionId, phase });
    }
  }
  return { queue, initialQuestionIds: queue.map(item => item.questionId), wordCount: words.length };
}

export function emptyPracticeRecord(): PracticeRecord {
  return { draft: '', validAttempts: 0, answerViewed: false, skipped: false, firstTryCorrect: false, reviewScheduled: false };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validConfig(value: unknown): value is PracticeConfig {
  if (!isObject(value)) return false;
  return ['hanzi', 'vi', 'mixed'].includes(value.direction as string) && ['pinyin', 'hanzi'].includes(value.hanziInput as string) &&
    typeof value.includeHanziCopy === 'boolean' && [10, 20, 30, 'all'].includes(value.count as PracticeCount) &&
    (value.autoSaveNotes == null || typeof value.autoSaveNotes === 'boolean') &&
    (value.noteFolderId == null || (typeof value.noteFolderId === 'string' && value.noteFolderId.length <= 100));
}

function validAnswer(value: unknown): value is PracticeAnswerDTO {
  return isObject(value) && typeof value.hanzi === 'string' && typeof value.pinyin === 'string' &&
    typeof value.pinyinNumber === 'string' && typeof value.meaningVi === 'string' && typeof value.pos === 'string' &&
    isObject(value.example) && typeof value.example.zh === 'string' && typeof value.example.pinyin === 'string' && typeof value.example.vi === 'string';
}

function validRecord(value: unknown): value is PracticeRecord {
  if (!isObject(value) || typeof value.draft !== 'string' || value.draft.length > 200 || !Number.isInteger(value.validAttempts) ||
      typeof value.answerViewed !== 'boolean' || typeof value.skipped !== 'boolean' || typeof value.firstTryCorrect !== 'boolean' ||
      typeof value.reviewScheduled !== 'boolean') return false;
  if (value.revealedAnswer != null && !validAnswer(value.revealedAnswer)) return false;
  if (value.submission == null) return true;
  const submissionValid = isObject(value.submission) && typeof value.submission.questionId === 'string' &&
    ['hanzi-to-pinyin', 'hanzi-to-hanzi', 'vi-to-hanzi'].includes(value.submission.kind as string) &&
    typeof value.submission.contentSignature === 'string' && Number.isInteger(value.submission.scoringVersion) &&
    ['correct', 'incorrect'].includes(value.submission.status as string) && typeof value.submission.feedback === 'string' &&
    validAnswer(value.submission.answer) && (value.submission.issues == null || (Array.isArray(value.submission.issues) &&
      value.submission.issues.every(issue => isObject(issue) && ['wrong-base', 'wrong-tone', 'missing', 'extra'].includes(issue.kind as string) &&
        (issue.expectedIndex === null || Number.isInteger(issue.expectedIndex)) && (issue.actualIndex === null || Number.isInteger(issue.actualIndex)) &&
        (issue.expected == null || (isObject(issue.expected) && typeof issue.expected.base === 'string' && [1, 2, 3, 4, 5].includes(issue.expected.tone as number))) &&
        (issue.actual == null || (isObject(issue.actual) && typeof issue.actual.base === 'string' && [1, 2, 3, 4, 5].includes(issue.actual.tone as number))))));
  return submissionValid;
}

export function parseVocabularyPracticeProgress(raw: string, lessonId: string): VocabularyPracticeProgressV1 | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.version !== 1 || value.lessonId !== lessonId || !Number.isFinite(value.updatedAt) ||
        typeof value.contentSignature !== 'string' || !Number.isInteger(value.scoringVersion) || !validConfig(value.config) ||
        !Array.isArray(value.queue) || value.queue.length > MAX_ITEMS || !Array.isArray(value.initialQuestionIds) ||
        value.initialQuestionIds.length > MAX_ITEMS || typeof value.currentIndex !== 'number' || !Number.isInteger(value.currentIndex) || value.currentIndex < 0 ||
        value.currentIndex > value.queue.length || !isObject(value.records)) return null;
    const records = Object.entries(value.records);
    if (!value.queue.every(item => isObject(item) && typeof item.questionId === 'string' && item.questionId.length <= 200 && ['main', 'deferred', 'review'].includes(item.phase as string)) ||
        !value.initialQuestionIds.every(id => typeof id === 'string' && id.length <= 200) || records.length > MAX_ITEMS ||
        !records.every(([id, record]) => id.length <= 210 && validRecord(record))) return null;
    const progress = value as unknown as VocabularyPracticeProgressV1;
    return {
      ...progress,
      config: {
        ...progress.config,
        autoSaveNotes: progress.config.autoSaveNotes === true,
        noteFolderId: typeof progress.config.noteFolderId === 'string' ? progress.config.noteFolderId : '',
      },
    };
  } catch { return null; }
}

export function readVocabularyPracticeProgress(lessonId: string): VocabularyPracticeProgressV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(vocabularyPracticeProgressKey(lessonId));
    if (!raw) return null;
    const parsed = parseVocabularyPracticeProgress(raw, lessonId);
    if (!parsed) localStorage.removeItem(vocabularyPracticeProgressKey(lessonId));
    return parsed;
  } catch { return null; }
}

export function writeVocabularyPracticeProgress(progress: VocabularyPracticeProgressV1): boolean {
  if (typeof window === 'undefined') return false;
  try { localStorage.setItem(vocabularyPracticeProgressKey(progress.lessonId), JSON.stringify(progress)); return true; }
  catch { return false; }
}

export function removeVocabularyPracticeProgress(lessonId: string): boolean {
  if (typeof window === 'undefined') return false;
  try { localStorage.removeItem(vocabularyPracticeProgressKey(lessonId)); return true; }
  catch { return false; }
}
