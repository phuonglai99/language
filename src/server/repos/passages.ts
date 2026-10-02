import { getDb } from '../db/connection';
import { isPunctToken } from '@/shared/text';
import type {
  MBAlignSummary, MBLesson, MBLessonCounts, MBLessonFilters, MBLessonListItem,
  MBLessonNeighbors, MBLessonNavItem, MBLessonWord, SentenceTimestamp,
} from '@/types/api';

/**
 * Reading passages. Rows live in passages + passage_sentences; this module rebuilds the
 * pre-v4 lesson shape (content[][] of tokens, sentence_timestamps, categories with the
 * Checked/Uncheck tag) so the reading, dictation and align screens work unchanged.
 */

interface PassageRow {
  id: number; slug: string; source_url: string | null; title_en: string | null; title_zh: string;
  title_zh_trad: string | null; hsk_level: number; category: string | null; audio_url: string | null;
  review_status: string; vocab_count: number;
}

interface Token { h: string; p?: string; s?: number }

const LIST_COLUMNS = `id, slug, source_url, title_en, title_zh, title_zh_trad, hsk_level, category,
  audio_url, review_status, vocab_count`;

function categories(r: PassageRow): string[] {
  return [...(r.category ? [r.category] : []), r.review_status === 'checked' ? 'Checked' : 'Uncheck'];
}

function toListItem(r: PassageRow): MBLessonListItem {
  return {
    slug: r.slug,
    url: r.source_url ?? '',
    title_en: r.title_en ?? '',
    title_zh_simplified: r.title_zh,
    title_zh_traditional: r.title_zh_trad ?? '',
    hsk_level: r.hsk_level,
    categories: categories(r),
    audio_url: r.audio_url,
    vocabCount: r.vocab_count,
  };
}

const likeArg = (q: string) => `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;

export async function queryPassages(filters: MBLessonFilters = {}): Promise<MBLessonListItem[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.hsk != null && Number.isFinite(filters.hsk)) {
    where.push('hsk_level = ?');
    args.push(filters.hsk);
  }
  const status = filters.status?.toLowerCase();
  if (status === 'checked') where.push("review_status = 'checked'");
  else if (status === 'uncheck' || status === 'unchecked') where.push("review_status = 'unchecked'");

  const q = filters.q?.trim();
  if (q) {
    const fields = ['title_en', 'title_zh', 'category'].map(f => `${f} LIKE ? ESCAPE '\\'`);
    args.push(likeArg(q), likeArg(q), likeArg(q));
    if (filters.searchContentText) {
      fields.push("EXISTS (SELECT 1 FROM passage_sentences s WHERE s.passage_id = passages.id AND s.zh LIKE ? ESCAPE '\\')");
      args.push(likeArg(q));
    }
    where.push(`(${fields.join(' OR ')})`);
  }

  const rows = getDb().prepare(
    `SELECT ${LIST_COLUMNS} FROM passages${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY hsk_level, slug`,
  ).all(...args) as PassageRow[];
  return rows.map(toListItem);
}

/** Full passage in the pre-v4 shape (plus the cached vocabCount), or null. */
export async function getPassage(slug: string): Promise<(MBLesson & { vocabCount: number }) | null> {
  const db = getDb();
  const p = db.prepare(`SELECT ${LIST_COLUMNS} FROM passages WHERE slug = ?`).get(slug) as PassageRow | undefined;
  if (!p) return null;

  const sentences = db.prepare(
    'SELECT idx, zh, tokens, audio_start, audio_end FROM passage_sentences WHERE passage_id = ? ORDER BY idx',
  ).all(p.id) as { idx: number; zh: string; tokens: string; audio_start: number | null; audio_end: number | null }[];

  // Every sense the passage refers to, in one query.
  const senses = new Map(
    (db.prepare(`
      SELECT s.id, s.mb_word_id, COALESCE(s.meaning_en, s.meaning_vi) AS definition,
             COALESCE(s.hsk_level, w.hsk_level) AS hsk
      FROM word_senses s JOIN words w ON w.id = s.word_id
      WHERE s.id IN (
        SELECT json_extract(t.value, '$.s') FROM passage_sentences ps, json_each(ps.tokens) t
        WHERE ps.passage_id = ? AND json_extract(t.value, '$.s') IS NOT NULL
      )
    `).all(p.id) as { id: number; mb_word_id: string | null; definition: string | null; hsk: number | null }[])
      .map(s => [s.id, s]),
  );

  const content: MBLessonWord[][] = sentences.map(row =>
    (JSON.parse(row.tokens) as Token[]).map(t => {
      const sense = t.s != null ? senses.get(t.s) : undefined;
      return {
        hanzi: t.h,
        pinyin: t.p ?? '',
        hsk: sense?.hsk ?? null,
        definition: sense?.definition ?? null,
        wordId: sense?.mb_word_id ?? null,
      };
    }),
  );

  return {
    ...toListItem(p),
    content,
    content_text: sentences.map(s => s.zh).join(''),
    sentence_timestamps: sentences.map(s => ({ index: s.idx, start: s.audio_start, end: s.audio_end })),
  };
}

/** Previous/next passage in the same HSK level, ordered like the reading list. */
export async function getAdjacentPassages(slug: string, hskLevel: number): Promise<MBLessonNeighbors> {
  const rows = getDb().prepare(
    'SELECT slug, title_en, title_zh FROM passages WHERE hsk_level = ? ORDER BY slug',
  ).all(hskLevel) as { slug: string; title_en: string | null; title_zh: string }[];
  const items: MBLessonNavItem[] = rows.map(r => ({ slug: r.slug, title_en: r.title_en ?? '', title_zh_simplified: r.title_zh }));
  const i = items.findIndex(r => r.slug === slug);
  if (i < 0) return { prev: null, next: null, index: 0, total: items.length };
  return { prev: items[i - 1] ?? null, next: items[i + 1] ?? null, index: i + 1, total: items.length };
}

export async function getPassageCounts(): Promise<MBLessonCounts> {
  const rows = getDb().prepare(
    'SELECT hsk_level, COUNT(*) AS n FROM passages GROUP BY hsk_level ORDER BY hsk_level',
  ).all() as { hsk_level: number; n: number }[];
  const byHsk: Record<number, number> = {};
  let total = 0;
  for (const r of rows) {
    byHsk[r.hsk_level] = r.n;
    total += r.n;
  }
  return { total, byHsk };
}

export async function getAlignSummaries(): Promise<MBAlignSummary[]> {
  const rows = getDb().prepare(`
    SELECT p.slug, p.title_en, p.title_zh, p.hsk_level, p.audio_url,
           COUNT(s.idx) AS sentence_count,
           SUM(s.audio_start IS NULL OR s.audio_end IS NULL) AS unmatched,
           SUM(s.audio_start IS NOT NULL AND s.audio_end IS NOT NULL) AS matched
    FROM passages p LEFT JOIN passage_sentences s ON s.passage_id = p.id
    GROUP BY p.id ORDER BY p.hsk_level, p.slug
  `).all() as { slug: string; title_en: string | null; title_zh: string; hsk_level: number; audio_url: string | null;
    sentence_count: number; unmatched: number | null; matched: number | null }[];
  return rows.map(r => ({
    slug: r.slug,
    title_en: r.title_en ?? '',
    title_zh_simplified: r.title_zh,
    hsk_level: r.hsk_level,
    audio_url: r.audio_url,
    sentenceCount: r.sentence_count,
    unmatchedCount: r.unmatched ?? 0,
    hasTimestamps: (r.matched ?? 0) > 0,
  }));
}

/** A mark is only kept when it is a real interval; anything else means "not aligned". */
function validMark(t: SentenceTimestamp | undefined): [number | null, number | null] {
  if (t?.start == null || t?.end == null || !(t.start < t.end)) return [null, null];
  return [t.start, t.end];
}

/**
 * Saves audio marks. With `content`, the sentences themselves changed (split/merge in the
 * align screen) and are rewritten; tokens are linked back to their senses by
 * (wordId, definition, hanzi). Returns false when the passage does not exist.
 */
export async function savePassageAlignment(
  slug: string, timestamps: SentenceTimestamp[], content?: MBLessonWord[][],
): Promise<boolean> {
  const db = getDb();
  const passage = db.prepare('SELECT id FROM passages WHERE slug = ?').pluck().get(slug) as number | undefined;
  if (passage == null) return false;
  const byIndex = new Map(timestamps.map(t => [t.index, t]));

  db.transaction(() => {
    if (!content) {
      const update = db.prepare('UPDATE passage_sentences SET audio_start = ?, audio_end = ? WHERE passage_id = ? AND idx = ?');
      const indexes = db.prepare('SELECT idx FROM passage_sentences WHERE passage_id = ?').pluck().all(passage) as number[];
      for (const idx of indexes) update.run(...validMark(byIndex.get(idx)), passage, idx);
    } else {
      const findSense = db.prepare(`
        SELECT s.id FROM word_senses s JOIN words w ON w.id = s.word_id
        WHERE s.mb_word_id = ? AND s.meaning_en = ? AND w.hanzi = ? LIMIT 1
      `).pluck();
      db.prepare('DELETE FROM passage_sentences WHERE passage_id = ?').run(passage);
      const insert = db.prepare(
        'INSERT INTO passage_sentences (passage_id, idx, zh, tokens, audio_start, audio_end) VALUES (?, ?, ?, ?, ?, ?)',
      );
      const vocab = new Set<string>();
      content.forEach((para, idx) => {
        const tokens: Token[] = para.map(w => {
          const t: Token = { h: w.hanzi };
          if (w.pinyin?.trim()) t.p = w.pinyin.trim();
          if (isPunctToken(w.hanzi)) return t;
          vocab.add(w.hanzi.trim());
          if (w.wordId && w.definition) {
            const s = findSense.get(w.wordId, w.definition.trim(), w.hanzi.trim()) as number | undefined;
            if (s != null) t.s = s;
          }
          return t;
        });
        insert.run(passage, idx, para.map(w => w.hanzi).join(''), JSON.stringify(tokens), ...validMark(byIndex.get(idx)));
      });
      db.prepare('UPDATE passages SET sentence_count = ?, vocab_count = ? WHERE id = ?').run(content.length, vocab.size, passage);
    }
    db.prepare("UPDATE passages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(passage);
  })();
  return true;
}
