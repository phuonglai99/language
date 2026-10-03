/**
 * Ids accepted by /lesson/[id]:
 *   hsk-<n>  the HSK 2.0 word list of level n (words.hsk_level) — vocabulary only, not a lesson
 *   <id>     an uploaded lesson (lessons.id, nanoid)
 */
export type LessonRef = { kind: 'hsk'; level: number } | { kind: 'lesson'; id: string };

export const hskLessonId = (level: number) => `hsk-${level}`;

export function parseLessonId(id: string): LessonRef | null {
  const hsk = /^hsk-([1-6])$/.exec(id);
  if (hsk) return { kind: 'hsk', level: Number(hsk[1]) };
  return id.trim() ? { kind: 'lesson', id } : null;
}
