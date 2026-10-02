import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { findOrCreateMbSense } from '../repos/words';
import { hanChars, isPunctToken } from '@/shared/text';
import { splitSentences } from '@/shared/sentences';
import type { MBLessonWord } from '@/types/api';

/** One lesson as written by scripts/crawl-mandarin-bean.mjs. */
export interface CrawledPassage {
  slug: string;
  url: string;
  title_en: string;
  title_zh_simplified?: string;
  title_zh_traditional?: string;
  hsk_level: number;
  categories?: string[];
  audio_url?: string | null;
  content: MBLessonWord[][];
}

const REVIEW_TAGS = new Set(['Checked', 'Uncheck']);

export function isValidCrawledPassage(l: Partial<CrawledPassage>): l is CrawledPassage {
  return !!l.slug && !!l.title_en && Array.isArray(l.content) && l.content.length > 0 && !!l.hsk_level;
}

function insertSentences(db: Database.Database, passageId: number, content: MBLessonWord[][]): void {
  const ensureChar = db.prepare("INSERT OR IGNORE INTO characters (char, crawl_status) VALUES (?, 'pending')");
  const insert = db.prepare(
    'INSERT INTO passage_sentences (passage_id, idx, zh, tokens) VALUES (?, ?, ?, ?)',
  );
  const vocab = new Set<string>();
  const sentences = splitSentences(content);
  sentences.forEach((sentence, idx) => {
    const tokens = sentence.map(w => {
      const t: { h: string; p?: string; s?: number } = { h: w.hanzi ?? '' };
      if (w.pinyin?.trim()) t.p = w.pinyin.trim();
      if (isPunctToken(t.h)) return t;
      vocab.add(t.h.trim());
      if (w.wordId && w.definition) {
        for (const ch of hanChars(t.h)) ensureChar.run(ch);
        t.s = findOrCreateMbSense(db, { hanzi: t.h, pinyin: w.pinyin ?? '', wordId: w.wordId, definition: w.definition, hsk: w.hsk ?? null });
      }
      return t;
    });
    insert.run(passageId, idx, sentence.map(w => w.hanzi ?? '').join(''), JSON.stringify(tokens));
  });
  db.prepare('UPDATE passages SET sentence_count = ?, vocab_count = ? WHERE id = ?').run(sentences.length, vocab.size, passageId);
}

/**
 * Adds crawled passages. A passage already in the DB only gets its metadata refreshed
 * (titles, level, category, URLs): its sentences, audio marks and review status are never
 * overwritten — re-running the old importer replaced split sentences and broke the marks.
 */
export function importPassages(passages: CrawledPassage[]): { added: number; updated: number } {
  const db = getDb();
  let added = 0;
  let updated = 0;
  db.transaction(() => {
    for (const p of passages) {
      const category = (p.categories ?? []).find(c => !REVIEW_TAGS.has(c)) ?? null;
      const existing = db.prepare('SELECT id FROM passages WHERE slug = ?').pluck().get(p.slug) as number | undefined;
      if (existing != null) {
        db.prepare(`
          UPDATE passages SET source_url = ?, title_en = ?, title_zh = ?, title_zh_trad = ?, hsk_level = ?,
            category = COALESCE(?, category), audio_url = COALESCE(NULLIF(?, ''), audio_url),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(p.url, p.title_en, p.title_zh_simplified ?? '', p.title_zh_traditional || null, p.hsk_level,
          category, p.audio_url ?? null, existing);
        updated++;
        continue;
      }
      const id = Number(db.prepare(`
        INSERT INTO passages (slug, source, source_url, title_zh, title_zh_trad, title_en, hsk_level, category,
                              audio_url, audio_source, review_status, translation_status)
        VALUES (?, 'mandarin_bean', ?, ?, ?, ?, ?, ?, ?, ?, 'unchecked', 'none')
      `).run(p.slug, p.url, p.title_zh_simplified ?? '', p.title_zh_traditional || null, p.title_en, p.hsk_level,
        category, p.audio_url || null, p.audio_url ? 'crawl' : null).lastInsertRowid);
      insertSentences(db, id, p.content);
      added++;
    }
  })();
  return { added, updated };
}

/** Passages still without an audio URL (for scripts/patch-audio-urls.ts). */
export function passagesWithoutAudio(slug?: string): { slug: string; url: string }[] {
  const db = getDb();
  return (slug
    ? db.prepare('SELECT slug, source_url AS url FROM passages WHERE slug = ?').all(slug)
    : db.prepare("SELECT slug, source_url AS url FROM passages WHERE audio_url IS NULL OR audio_url = '' ORDER BY hsk_level, slug").all()
  ) as { slug: string; url: string }[];
}

export function setPassageAudio(slug: string, audioUrl: string): void {
  getDb().prepare(`
    UPDATE passages SET audio_url = ?, audio_source = 'crawl', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug = ?
  `).run(audioUrl, slug);
}
