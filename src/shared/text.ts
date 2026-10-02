/**
 * Text helpers shared by the app, the migration and the import scripts.
 * Pure functions only — no DB, no Node/browser APIs — so both sides can import them.
 *
 * Punctuation is defined by Unicode general category, not by a hand-kept list,
 * so the Python side can match it exactly:
 *   unicodedata.category(ch)[0] in ("P", "Z") or unicodedata.category(ch) in ("Sm", "So") or ch.isspace()
 */

const PUNCT_CHAR = /[\p{P}\p{Z}\p{Sm}\p{So}\s]/u;
const PUNCT_CHARS = /[\p{P}\p{Z}\p{Sm}\p{So}\s]/gu;
const HAN_CHAR = /\p{Script=Han}/u;

export function isPunctChar(ch: string): boolean {
  return PUNCT_CHAR.test(ch);
}

/** True when the token has text and every character is punctuation/whitespace/symbol. */
export function isPunctToken(text: string): boolean {
  if (!text) return false;
  for (const ch of text) if (!PUNCT_CHAR.test(ch)) return false;
  return true;
}

export function stripPunct(text: string): string {
  return text.replace(PUNCT_CHARS, '');
}

export function hasHan(text: string): boolean {
  return HAN_CHAR.test(text);
}

/** Han characters of a string, in order (used for word → character links). */
export function hanChars(text: string): string[] {
  return [...text].filter(ch => HAN_CHAR.test(ch));
}

// ── Pinyin ────────────────────────────────────────────────────────────────────

/** Tone-sandhi spellings of 一 and 不 that dictionaries write as yī / bù. */
const SANDHI: Record<string, Record<string, string>> = {
  '一': { 'yí': 'yī', 'yì': 'yī' },
  '不': { 'bú': 'bù' },
};

/** Syllables starting with a, o, e take an apostrophe when written joined ("kě ài" → "kě'ài"). */
const VOWEL_INITIAL = /^[aāáǎàoōóǒòeēéěè]/i;

function joinSyllables(parts: string[]): string {
  return parts
    .map(p => p.replace(/’/g, "'"))
    .map((p, i) => (i > 0 && VOWEL_INITIAL.test(p) ? `'${p}` : p))
    .join('');
}

/** Removes tone marks but keeps ü ("lǜ" → "lü"), so neutral-tone variants can be compared. */
export function stripTones(pinyin: string): string {
  return pinyin.normalize('NFD').replace(/[̀́̄̌]/g, '').normalize('NFC');
}

/**
 * True when two spellings of the same word differ only by neutral tones
 * ("dōngxī" ~ "dōngxi", "chūlái" ~ "chulai"), never by two different tones
 * ("zhōng" vs "zhòng"). Spacing, apostrophes and case are ignored.
 */
export function neutralToneVariants(a: string, b: string): boolean {
  const norm = (s: string) => [...s.normalize('NFC').toLowerCase().replace(/[\s'’·-]/g, '')];
  const x = norm(a);
  const y = norm(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    const bx = stripTones(x[i]);
    const by = stripTones(y[i]);
    if (bx !== by) return false;
    if (x[i] !== bx && y[i] !== by) return false; // two different tones
  }
  return true;
}

/** Number of tone-marked vowels — a fuller citation form has more. */
export function toneMarkCount(pinyin: string): number {
  return [...pinyin.normalize('NFC')].filter(ch => stripTones(ch) !== ch).length;
}

function fixSandhi(char: string, syllable: string): string {
  const table = SANDHI[char];
  if (!table) return syllable;
  const lower = syllable.toLowerCase();
  return table[lower] ?? syllable;
}

/**
 * Dictionary form of a word's pinyin, used as part of the word identity:
 *  - NFC, trimmed, inner whitespace removed ("jǔ xíng" → "jǔxíng")
 *  - tone sandhi of 一 / 不 undone ("yí zài" → "yīzài", "bú kèqi" → "bùkèqi")
 *
 * Sandhi is only undone where the syllable can be tied to its character: when the
 * pinyin has one space-separated syllable per Han character, or for a leading 一/不.
 * Case is preserved (proper nouns: "Běijīng").
 */
export function normalizePinyin(hanzi: string, pinyin: string): string {
  const p = pinyin.normalize('NFC').trim();
  if (!p) return '';
  const chars = hanChars(hanzi);
  const parts = p.split(/\s+/);

  if (parts.length > 1 && parts.length === chars.length) {
    return joinSyllables(parts.map((syl, i) => fixSandhi(chars[i], syl)));
  }

  let joined = joinSyllables(parts);
  const first = chars[0];
  if (first && SANDHI[first]) {
    for (const [from, to] of Object.entries(SANDHI[first])) {
      if (joined.toLowerCase().startsWith(from)) {
        joined = to + joined.slice(from.length);
        break;
      }
    }
  }
  return joined;
}

/**
 * Tone-less, lowercase, no separators — for search ("lǜ" → "lv", "Běijīng" → "beijing").
 * ü (any tone) becomes v before diacritics are stripped, as pinyin keyboards type it.
 */
export function pinyinPlain(pinyin: string): string {
  return pinyin
    .normalize('NFC')
    .toLowerCase()
    .replace(/[üǖǘǚǜ]/g, 'v')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s'’·-]/g, '');
}

// ── Vietnamese ────────────────────────────────────────────────────────────────

/** Accent-free lowercase Vietnamese, for search ("Học" → "hoc", "đi" → "di"). */
export function stripVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
