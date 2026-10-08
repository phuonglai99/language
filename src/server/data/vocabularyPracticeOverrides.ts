/**
 * Reviewed exceptions belong here rather than being inferred from similar meanings.
 * Keys are `${lessonId}:${wordId}:${senseId}:${kind}`. Keep reasons in review notes.
 */
export const VOCABULARY_PRACTICE_OVERRIDES_VERSION = 1;

export type VocabularyPracticeOverride = {
  acceptedHanzi?: string[];
  acceptedNumberedPinyin?: string[];
  reason: string;
};

export const vocabularyPracticeOverrides: Readonly<Record<string, VocabularyPracticeOverride>> = {};

