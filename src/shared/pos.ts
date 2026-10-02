/**
 * Part-of-speech codes (table parts_of_speech) and the free-text labels older data and the
 * UI still send ("Danh từ", "v/n", "Động từ / Danh từ"). Shared by the app and migration.
 */
export const PARTS_OF_SPEECH: readonly [code: string, nameVi: string, nameZh: string][] = [
  ['n', 'Danh từ', '名词'],
  ['v', 'Động từ', '动词'],
  ['adj', 'Tính từ', '形容词'],
  ['adv', 'Phó từ', '副词'],
  ['m', 'Lượng từ', '量词'],
  ['conj', 'Liên từ', '连词'],
  ['pron', 'Đại từ', '代词'],
  ['prep', 'Giới từ', '介词'],
  ['num', 'Số từ', '数词'],
  ['part', 'Trợ từ', '助词'],
  ['propn', 'Danh từ riêng', '专有名词'],
  ['intj', 'Thán từ', '叹词'],
  ['vo', 'Động từ ly hợp', '离合词'],
  ['modal', 'Động từ năng nguyện', '能愿动词'],
  ['phrase', 'Cụm từ', '短语'],
];

const LABELS: Record<string, string> = {
  ...Object.fromEntries(PARTS_OF_SPEECH.map(([code, vi]) => [vi.toLowerCase(), code])),
  ...Object.fromEntries(PARTS_OF_SPEECH.map(([code]) => [code, code])),
  'từ để hỏi': 'pron', // đại từ nghi vấn
  'bổ ngữ kết quả': 'phrase',
};

/**
 * "Động từ / Danh từ", "v/n" → ['v', 'n']. Unknown labels are returned in `unknown`
 * so callers decide: the migration fails loudly, the app drops them.
 */
export function parsePosLabels(raw: string | null | undefined): { codes: string[]; unknown: string[] } {
  const codes: string[] = [];
  const unknown: string[] = [];
  for (const part of (raw ?? '').split('/')) {
    const label = part.trim();
    if (!label) continue;
    const code = LABELS[label.toLowerCase()];
    if (code) codes.push(code);
    else unknown.push(label);
  }
  return { codes, unknown };
}

const NAME_VI = new Map(PARTS_OF_SPEECH.map(([code, vi]) => [code, vi]));

export function posNameVi(code: string | null | undefined): string {
  return (code && NAME_VI.get(code)) || '';
}
