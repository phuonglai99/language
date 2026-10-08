import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { searchWords } from '../repos/vocab';
import { saveHanziiWord } from '../repos/hanziiWords';
import { searchHanziiWords, type HanziiWord } from '../third-party-service/hanzii';
import { hanChars, pinyinPlain, stripVietnamese } from '@/shared/text';
import type { SearchResultDTO } from '@/types/api';

function characterResults(db: Database.Database, query: string, limit: number): SearchResultDTO[] {
  const chinese = hanChars(query).length > 0;
  if (chinese && [...query].length !== 1) return [];
  // Character data has no FTS index; normalize its multiple readings in memory.
  const rows = db.prepare(`SELECT char, pinyin, hv_meanings, hv_dictionary FROM characters
    WHERE (hv_meanings IS NOT NULL OR hv_dictionary IS NOT NULL) AND (? = 0 OR char = ?)
    ORDER BY frequency DESC, char`).all(chinese ? 1 : 0, query) as {
      char: string; pinyin: string | null; hv_meanings: string | null; hv_dictionary: string | null;
    }[];
  const plain = pinyinPlain(query);
  const vi = stripVietnamese(query).toLowerCase();
  return rows.flatMap(r => {
    const meanings = JSON.parse(r.hv_meanings ?? '[]') as string[];
    const dictionary = JSON.parse(r.hv_dictionary ?? '[]') as string[];
    // Dictionary entries include classical examples after the first line. Keep
    // these in character details, not in the quick translation/search preview.
    const concise = meanings.filter(m => m.trim());
    const meaning = (concise.length ? concise : dictionary.map(entry =>
      entry.replace(/\\n/g, '\n').trim().split('\n')[0].replace(/^\([^)]+\)\s*/, '').trim(),
    )).filter(Boolean).join('; ');
    if (!meaning.trim()) return [];
    const readings = (r.pinyin ?? '').split(/[,，;；/、\s]+/).filter(Boolean);
    if (chinese ? r.char !== query : !readings.some(p => pinyinPlain(p).startsWith(plain))
      && !stripVietnamese(meaning).toLowerCase().includes(vi)) return [];
    return [{ lessonId: null, lessonTitle: '', level: '', zh: r.char, py: r.pinyin ?? '', vn: meaning, pos: '' }];
  }).sort((a, b) => Number(b.zh === query) - Number(a.zh === query)
    || Number(pinyinPlain(b.py) === plain) - Number(pinyinPlain(a.py) === plain)
  ).slice(0, limit);
}

function mergeResults(chars: SearchResultDTO[], words: SearchResultDTO[], limit: number): SearchResultDTO[] {
  // Keep lesson links when a character is also taught as a word.
  const result = chars.map(c => {
    const word = words.find(w => w.zh === c.zh);
    return word ? { ...word, vn: c.vn } : c;
  });
  return [...result, ...words.filter(w => !chars.some(c => c.zh === w.zh))].slice(0, limit);
}

const states = new WeakMap<Database.Database, {
  misses: Map<string, number>; pending: Map<string, Promise<void>>;
}>();

/** DB Vietnamese → Hanzii (persist) → DB English → empty results. */
export async function lookupDictionary(query: string, options: {
  db?: Database.Database;
  fetchWords?: (query: string) => Promise<HanziiWord[]>;
  limit?: number;
} = {}): Promise<SearchResultDTO[]> {
  const q = query.trim();
  if (!q || q.length > 100) return [];
  const db = options.db ?? getDb();
  const limit = options.limit ?? 40;
  const chars = characterResults(db, q, limit);
  const local = await searchWords(q, limit, db, true);
  const chinese = hanChars(q).length > 0;
  // Related/prefix hits must not prevent lookup of a missing exact Chinese word.
  if (chinese ? [...chars, ...local].some(r => r.zh === q) : chars.length || local.length) {
    return mergeResults(chars, local, limit);
  }
  let state = states.get(db);
  if (!state) { state = { misses: new Map(), pending: new Map() }; states.set(db, state); }
  if ((state.misses.get(q) ?? 0) < Date.now()) {
    let pending = state.pending.get(q);
    if (!pending) {
      const current = state;
      if (current.misses.size >= 500) current.misses.delete(current.misses.keys().next().value!);
      pending = (async () => {
        try {
          const entries = await (options.fetchWords ?? searchHanziiWords)(q);
          db.transaction(() => { for (const entry of entries) saveHanziiWord(db, entry); })();
          // Bound cache size; misses expire so new dictionary entries can be discovered.
          current.misses.set(q, Date.now() + 5 * 60_000);
        } catch (error) {
          console.warn('Hanzii lookup failed:', error instanceof Error ? error.message : error);
          current.misses.set(q, Date.now() + 15_000);
        }
      })();
      current.pending.set(q, pending);
    }
    try { await pending; } finally { state.pending.delete(q); }
  }
  const enriched = await searchWords(q, limit, db, true);
  const vietnamese = mergeResults(chars, enriched, limit);
  if (chinese ? vietnamese.some(r => r.zh === q) : vietnamese.length) return vietnamese;
  const fallback = await searchWords(q, limit, db);
  // Exact English hit precedes unrelated Vietnamese suggestions.
  return [...fallback.filter(r => r.zh === q && r.vn.trim()), ...vietnamese,
    ...fallback.filter(r => r.zh !== q && r.vn.trim() && !vietnamese.some(v => v.zh === r.zh && v.py === r.py))].slice(0, limit);
}
