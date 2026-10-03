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

/**
 * Grammar link for a lesson card. HSK word lists have no grammar of their own, so they open
 * the grammar of their level; an uploaded lesson opens its own grammar, or its level's
 * grammar when it has none. `level` is the card label ("HSK2").
 */
export function lessonGrammarHref(id: string, level: string, grammarCount: number): string {
  const ref = parseLessonId(id);
  if (ref?.kind === 'hsk') return `/grammar/hsk/HSK${ref.level}`;
  if (grammarCount > 0) return `/grammar/${encodeURIComponent(id)}`;
  return /^HSK[1-6]$/.test(level) ? `/grammar/hsk/${level}` : '/grammar/hsk/HSK1';
}

export const isHskWordList = (id: string) => parseLessonId(id)?.kind === 'hsk';
