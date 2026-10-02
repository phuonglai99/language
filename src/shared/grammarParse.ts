/**
 * Hanzii grammar content → v4 columns. Shared by the migration (P4) and the grammar crawler.
 *
 * Hanzii `contents` (array of lines) is parsed once, at write time:
 *   - a line becomes an example only when it is one ("- 我是老师。 /Wǒ shì lǎoshī./ Tôi là thầy giáo.",
 *     or a "- 中文 tiếng Việt" bullet right after a "Ví dụ:" header);
 *   - every other line stays in `explanation`, verbatim;
 *   - `formula` comes only from a "Cấu trúc: …" line.
 */
const HAN = /\p{Script=Han}/u;
const EX_WITH_PINYIN = /^[-•]\s*(.+?)\s*\/([^/]+)\/\s*(.*)$/;
const EX_BULLET = /^[-•]\s+(.+)$/;
const EX_HEADER = /^(ví dụ|vd)\s*[:：.]?\s*$/i;
const FORMULA = /^cấu trúc\s*[:：]\s*(.+)$/i;
/** "中文句子。 Câu tiếng Việt" → split where the Vietnamese starts. */
const ZH_VI = /^([\p{Script=Han}0-9A-Za-z，。！？、：；“”‘’「」【】（）…—·\s]+?)\s+([^\p{Script=Han}]*[A-Za-zÀ-ỹ].*)$/u;

export const HANZII_HSK: Record<string, number | null> = {
  HSK1: 1, HSK2: 2, HSK3: 3, HSK4: 4, HSK5: 5, HSK6: 6, 'HSK7-9': 7, 'Khác': null,
};
export const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

export interface ParsedExample { zh: string; pinyin: string | null; vi: string | null }

export function parseHanziiContents(lines: string[]): { explanation: string; formula: string | null; examples: ParsedExample[] } {
  const keep: string[] = [];
  const examples: ParsedExample[] = [];
  let formula: string | null = null;
  let inExamples = false;
  let pendingHeader: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (EX_HEADER.test(line)) {
      if (pendingHeader != null) keep.push(pendingHeader);
      pendingHeader = raw;
      inExamples = true;
      continue;
    }

    const withPinyin = EX_WITH_PINYIN.exec(line);
    if (withPinyin && HAN.test(withPinyin[1])) {
      examples.push({ zh: withPinyin[1].trim(), pinyin: withPinyin[2].trim(), vi: withPinyin[3].trim() || null });
      pendingHeader = null;
      continue;
    }

    const bullet = inExamples ? EX_BULLET.exec(line) : null;
    if (bullet && HAN.test(bullet[1].trim().charAt(0))) {
      const split = ZH_VI.exec(bullet[1].trim());
      examples.push(split
        ? { zh: split[1].trim(), pinyin: null, vi: split[2].trim() }
        : { zh: bullet[1].trim(), pinyin: null, vi: null });
      pendingHeader = null;
      continue;
    }

    // Header with no example under it stays as text.
    if (pendingHeader != null) {
      keep.push(pendingHeader);
      pendingHeader = null;
    }
    inExamples = false;
    if (formula == null) {
      const f = FORMULA.exec(line);
      if (f) formula = f[1].trim();
    }
    keep.push(raw);
  }
  if (pendingHeader != null) keep.push(pendingHeader);
  return { explanation: keep.join('\n').trim(), formula, examples };
}


/** Hanzii `level` ("A1", "高等", "Li hợp") → hsk_level / cefr / category. */
export function hanziiLevel(level: string | null | undefined): { hskLevel: number | null; cefr: string | null; category: string | null } {
  const v = (level ?? '').trim();
  const byCefr: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  if (CEFR.has(v)) return { hskLevel: byCefr[v], cefr: v, category: null };
  if (v === '高等') return { hskLevel: 7, cefr: null, category: null };
  return { hskLevel: null, cefr: null, category: v || null };
}
