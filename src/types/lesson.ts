export interface LessonWord {
  hanzi: string;
  pinyin: string;
  hsk: number | null;
  definition: string | null;
  wordId?: string | null;
}

export type LessonParagraph = LessonWord[];

export interface Lesson {
  slug: string;
  url: string;
  title_en: string;
  title_zh_simplified: string;
  title_zh_traditional: string;
  hsk_level: number;
  categories: string[];
  audio_url: string | null;
  content: LessonParagraph[];
  content_text: string;
}

export interface LessonsData {
  crawled_at: string;
  total_lessons: number;
  by_hsk_level: Record<string, number>;
  lessons: Lesson[];
}

export type HskLevel = 1 | 2 | 3 | 4 | 5;
