import { stripVietnamese } from './text';

/**
 * v4 has no lessons table. A "lesson" is a view over the vocabulary marks:
 *   hsk-<n>       words in the HSK 2.0 list of level n (words.hsk_level)
 *   topic-<slug>  words of one topic (words.topic), i.e. an uploaded lesson
 */
export type LessonRef = { kind: 'hsk'; level: number } | { kind: 'topic'; slug: string };

export const hskLessonId = (level: number) => `hsk-${level}`;

/** "Đến nhà bạn Trung Quốc" → "den-nha-ban-trung-quoc"; Chinese characters are kept. */
export function topicSlug(topic: string): string {
  return stripVietnamese(topic)
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'chu-de';
}

export const topicLessonId = (topic: string) => `topic-${topicSlug(topic)}`;

export function parseLessonId(id: string): LessonRef | null {
  const hsk = /^hsk-([1-6])$/.exec(id);
  if (hsk) return { kind: 'hsk', level: Number(hsk[1]) };
  if (id.startsWith('topic-') && id.length > 6) return { kind: 'topic', slug: id.slice(6) };
  return null;
}

/** Same rule the migration used to turn a lesson title into a topic. */
export function lessonTitleToTopic(title: string): string {
  const dash = title.indexOf(' – ');
  return (dash >= 0 ? title.slice(dash + 3) : title).trim();
}
