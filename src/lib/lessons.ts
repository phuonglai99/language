import fs from 'fs';
import path from 'path';
import type { Lesson, LessonsData, HskLevel } from '@/types/lesson';

const DATA_FILE = path.join(process.cwd(), 'data', 'mandarin-bean-lessons.json');
const PROGRESS_FILE = path.join(process.cwd(), 'data', 'crawl-progress.json');

let cachedData: LessonsData | null = null;

function getData(): LessonsData {
  // Don't cache in dev so new lessons from the crawler are visible without restart
  if (cachedData && process.env.NODE_ENV === 'production') return cachedData;

  // Try final file first, fall back to in-progress file during crawling
  const fileToRead = fs.existsSync(DATA_FILE) ? DATA_FILE : PROGRESS_FILE;
  if (!fs.existsSync(fileToRead)) {
    return { crawled_at: '', total_lessons: 0, by_hsk_level: {}, lessons: [] };
  }

  const raw = fs.readFileSync(fileToRead, 'utf8');
  const parsed = JSON.parse(raw);

  // Normalize: progress file stores { crawledUrls, lessons }, final has full shape
  const lessons: Lesson[] = parsed.lessons ?? [];
  cachedData = {
    crawled_at: parsed.crawled_at ?? '',
    total_lessons: lessons.length,
    by_hsk_level: parsed.by_hsk_level ?? {},
    lessons,
  };
  return cachedData;
}

function isValidLesson(l: Lesson): boolean {
  return !!l.title_en && l.content.length > 0 && !!l.hsk_level;
}

export function getAllLessons(): Lesson[] {
  return getData().lessons.filter(isValidLesson);
}

export function getLessonBySlug(slug: string): Lesson | undefined {
  return getData().lessons.find((l) => l.slug === slug);
}

export function getLessonsByHsk(level: HskLevel): Lesson[] {
  return getData().lessons.filter((l) => l.hsk_level === level);
}

export function getLessonSlugs(): string[] {
  return getData().lessons.map((l) => l.slug);
}

export function getLessonStats(): { total: number; byHsk: Record<string, number> } {
  const data = getData();
  return { total: data.total_lessons, byHsk: data.by_hsk_level };
}
