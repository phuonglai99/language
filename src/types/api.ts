/**
 * Shapes the API and server components return to the client. They do not mirror DB
 * columns: repos in src/server/repos map rows to these. For now most keep the pre-v4
 * shapes so screens did not have to change during the migration.
 */

// ── Notes ────────────────────────────────────────────────────────────────────

export interface NoteFolderDTO {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
}

export interface NoteFolderWithCountDTO extends NoteFolderDTO {
  itemCount: number;
}

export interface NoteItemDTO {
  id: string;
  folderId: string;
  zh: string;
  py: string;
  vn: string;
  /** Vietnamese part-of-speech name ("Danh từ"), '' when unknown. */
  pos: string;
  /** Pre-v4 lesson link; v4 has no lessons table, so this is always null. */
  sourceLessonId: string | null;
  createdAt: string;
}

export interface NewNoteItemInput {
  folderId: string;
  zh: string;
  py: string;
  vn: string;
  pos: string;
}

// ── Reading passages (pre-v4 "Mandarin Bean lesson" shapes) ──────────────────

export interface MBLessonWord {
  hanzi: string;
  pinyin: string;
  hsk: number | null;
  definition: string | null;
  wordId?: string | null;
}

export interface SentenceTimestamp {
  index: number;
  start: number | null;
  end: number | null;
}

export interface MBLesson {
  slug: string;
  url: string;
  title_en: string;
  title_zh_simplified: string;
  title_zh_traditional: string;
  hsk_level: number;
  /** Topic category plus the review tag "Checked" / "Uncheck". */
  categories: string[];
  audio_url: string | null;
  content: MBLessonWord[][];
  content_text: string;
  sentence_timestamps?: SentenceTimestamp[] | null;
}

/** Card-sized passage: no content, so lists stay cheap. */
export type MBLessonListItem = Omit<MBLesson, 'content' | 'content_text' | 'sentence_timestamps'> & { vocabCount: number };

export interface MBLessonFilters {
  hsk?: number | null;
  /** Matched against titles and category. */
  q?: string | null;
  /** 'checked' | 'uncheck' | 'unchecked' */
  status?: string | null;
  /** Also match `q` against the passage text (dictation search). */
  searchContentText?: boolean;
}

export interface MBLessonNavItem {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
}

export interface MBLessonNeighbors {
  prev: MBLessonNavItem | null;
  next: MBLessonNavItem | null;
  index: number;
  total: number;
}

export interface MBLessonCounts {
  total: number;
  byHsk: Record<number, number>;
}

export interface MBAlignSummary {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
  hsk_level: number;
  audio_url: string | null;
  sentenceCount: number;
  unmatchedCount: number;
  hasTimestamps: boolean;
}

// ── Characters ───────────────────────────────────────────────────────────────

/** HanziWriter character data ({strokes, medians, radStrokes}); medians may be missing. */
export interface StrokeData {
  strokes: string[];
  medians?: number[][][];
  radStrokes?: number[];
}

export interface CharacterDetailDTO {
  char: string;
  cnVi: string | null;
  pinyin: string | null;
  /** Stroke count. */
  strokes: number | null;
  /** "nữ 女" */
  radical: string | null;
  /** "hình thanh & hội ý" */
  lucthu: string | null;
  hinhthai: string | null;
  netbut: string | null;
  /** Frequency 1 (rất thấp) – 5 (rất cao). */
  popular: number | null;
  pos: string | null;
  meansTdpt: string[];
  meansTg: string[];
  meansTdtd: string[];
  strokesSvg: StrokeData | null;
  botu: { t: 'y' | 'am' | 'solo'; ph: string; n: string }[] | null;
  botuSource: 'claude' | null;
}

// ── Vocabulary lessons & search ──────────────────────────────────────────────

/** Sidebar / home card for a vocabulary lesson (an HSK list or an uploaded topic). */
export interface LessonMetaDTO {
  /** "hsk-<n>" or "topic-<slug>" (see shared/lessons.ts). */
  id: string;
  title: string;
  subtitle: string;
  /** "HSK2"; '' when unknown. */
  level: string;
  topic?: string;
  createdAt: string;
  vocabCount: number;
  grammarCount: number;
}

export interface LevelVocabItemDTO {
  lessonId: string;
  lessonTitle: string;
  zh: string;
  py: string;
  pos: string;
  vn: string;
  ex: { zh: string; vn: string };
}

export interface SearchResultDTO {
  /** Lesson the word belongs to; null for dictionary words outside any lesson. */
  lessonId: string | null;
  lessonTitle: string;
  level: string;
  zh: string;
  py: string;
  vn: string;
  pos: string;
}
