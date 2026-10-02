/** Grammar is grouped by HSK level only; points without a level form one extra group. */
export const UNLEVELED_LABEL = 'Chưa xếp cấp';

export const GRAMMAR_LEVEL_LABELS = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9', UNLEVELED_LABEL] as const;

/** grammar_points.hsk_level → label used in URLs and the sidebar. */
export function grammarLevelLabel(level: number | null): string {
  if (level == null) return UNLEVELED_LABEL;
  return level === 7 ? 'HSK7-9' : `HSK${level}`;
}

/**
 * Label (or a pre-v4 URL segment) → hsk_level. `null` is the unleveled group;
 * `undefined` means the label is not a grammar level at all.
 */
export function parseGrammarLevel(label: string): number | null | undefined {
  const value = label.trim();
  if (value === UNLEVELED_LABEL || value === 'Khác') return null; // "Khác": pre-v4 name of the group
  if (value === 'HSK7-9') return 7;
  const m = /^HSK([1-6])$/.exec(value);
  return m ? Number(m[1]) : undefined;
}
