/**
 * Splits crawled Mandarin Bean paragraphs (arrays of tokens) into sentences: after 。,
 * or after ？！?! that ends the paragraph, keeping trailing closing quotes/brackets with the
 * sentence. Same rules as the 2026-09-07 split (scripts/migrate-mb-split-sentences.mjs),
 * so newly imported passages are cut exactly like the migrated ones.
 */
const FULL_STOP = new Set(['。']);
const FINAL = new Set(['？', '！', '?', '!']);
const CLOSING = new Set(['”', '’', '」', '』', '）', '】', ')', ']']);

const hasAny = (text: string, set: Set<string>) => [...text].some(ch => set.has(ch));

function closingOnly(text: string): boolean {
  const chars = [...text].filter(ch => ch.trim());
  return chars.length > 0 && chars.every(ch => CLOSING.has(ch));
}

export function splitParagraph<T extends { hanzi: string }>(paragraph: T[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let pendingEnd = false;
  paragraph.forEach((token, i) => {
    const text = token.hanzi || '';
    if (pendingEnd && !closingOnly(text)) {
      if (current.length) out.push(current);
      current = [];
      pendingEnd = false;
    }
    current.push(token);
    const rest = paragraph.slice(i + 1).map(t => t.hanzi || '').join('');
    if (hasAny(text, FULL_STOP) || (hasAny(text, FINAL) && (!rest || closingOnly(rest)))) pendingEnd = true;
  });
  if (current.length) out.push(current);
  return out;
}

export function splitSentences<T extends { hanzi: string }>(paragraphs: T[][]): T[][] {
  return paragraphs.flatMap(p => splitParagraph(p));
}
