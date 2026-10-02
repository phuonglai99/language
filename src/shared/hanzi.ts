/**
 * Mapping of Hanzii character fields to the v4 columns. Shared by the migration (P1) and
 * the app, which crawls characters missing from the DB on first lookup.
 */

const FORMATION: Record<string, string> = {
  'tượng hình': 'pictograph',
  'chỉ sự': 'ideograph',
  'hội ý': 'compound',
  'hình thanh': 'phono_semantic',
  'giả tá': 'loan',
  'chuyển chú': 'derivative',
};
const FORMATION_LABEL = Object.fromEntries(Object.entries(FORMATION).map(([vi, code]) => [code, vi]));
/** Canonical order, so "hội ý & hình thanh" and "hình thanh & hội ý" store the same way. */
const FORMATION_ORDER = ['pictograph', 'ideograph', 'compound', 'phono_semantic', 'loan', 'derivative'];

/** Hanzii lục thư ("hình thanh &amp; hội ý") → [formation, formation2]; unknown terms throw. */
export function parseFormation(raw: string | null | undefined): [string | null, string | null] {
  if (!raw) return [null, null];
  const parts = raw
    .replace(/&amp;/g, '&')
    .split(/&| kiêm /)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const code = FORMATION[p];
      if (!code) throw new Error(`Unknown lục thư "${p}" in "${raw}"`);
      return code;
    });
  const unique = [...new Set(parts)].sort((a, b) => FORMATION_ORDER.indexOf(a) - FORMATION_ORDER.indexOf(b));
  if (unique.length > 2) throw new Error(`More than 2 lục thư in "${raw}"`);
  return [unique[0] ?? null, unique[1] ?? null];
}

/** [formation, formation2] → "hình thanh & hội ý" for display. */
export function formationLabel(a: string | null, b: string | null): string | null {
  const labels = [a, b].filter((c): c is string => !!c).map(c => FORMATION_LABEL[c] ?? c);
  return labels.length ? labels.join(' & ') : null;
}

const FREQUENCY: Record<string, number> = { 'rất thấp': 1, 'thấp': 2, 'trung bình': 3, 'cao': 4, 'rất cao': 5 };
const FREQUENCY_LABEL = ['', 'Rất thấp', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

/** Hanzii "popular" ("rất cao") → 1–5; undefined when the text is unknown. */
export function parseFrequency(raw: string | number | null | undefined): number | null | undefined {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw >= 1 && raw <= 5 ? raw : undefined;
  return FREQUENCY[raw.trim().toLowerCase()];
}

export function frequencyLabel(level: number | null | undefined): string | null {
  return level ? FREQUENCY_LABEL[level] ?? null : null;
}

/** Hanzii radical "nữ 女" (or "nguyệt" without the form) → its parts; form NFKC-normalised (⾎ → 血). */
export function parseRadical(raw: string | null | undefined): { hanViet: string; form: string | null } | null {
  const value = raw?.trim();
  if (!value) return null;
  const space = value.indexOf(' ');
  if (space < 0) return { hanViet: value.toLowerCase(), form: null };
  return { hanViet: value.slice(0, space).toLowerCase(), form: value.slice(space + 1).trim().normalize('NFKC') };
}

/** Component roles in the DB ↔ the botu "t" codes the UI renders. */
export const ROLE_FROM_BOTU: Record<string, string> = { y: 'meaning', am: 'sound', solo: 'self' };
export const BOTU_FROM_ROLE: Record<string, 'y' | 'am' | 'solo'> = { meaning: 'y', sound: 'am', self: 'solo' };

/**
 * Hanzii stroke data → the object HanziWriter loads. Most entries already are
 * {strokes, medians, radStrokes}; some are a bare array of stroke paths.
 */
export function normalizeStrokeData(raw: unknown): { data: { strokes: unknown[]; medians?: unknown }; hasMedians: boolean } | null {
  const parsed = typeof raw === 'string' ? (raw ? JSON.parse(raw) as unknown : null) : raw;
  if (!parsed) return null;
  const data = (Array.isArray(parsed) ? { strokes: parsed } : parsed) as { strokes?: unknown; medians?: unknown };
  if (!Array.isArray(data.strokes)) return null;
  return { data: data as { strokes: unknown[]; medians?: unknown }, hasMedians: Array.isArray(data.medians) };
}
