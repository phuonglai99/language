import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import type { HanziiGrammarItem } from '../third-party-service/hanzii';
import { hanziiLevel, parseHanziiContents } from '@/shared/grammarParse';
import { grammarLevelLabel, parseGrammarLevel } from '@/shared/grammar';
import type { HanziiGrammar } from '@/types';

interface PointRow {
  id: number; source_data: string; title: string; title_vi: string | null; formula: string | null;
  explanation: string | null; use_for: string | null; keywords: string | null;
  hsk_level: number | null; cefr: string | null; category: string | null;
}

/** Points per level label, in sidebar order ("Chưa xếp cấp" last). */
export async function listGrammarCounts(): Promise<{ hsk: string; count: number }[]> {
  const rows = getDb().prepare(
    'SELECT hsk_level, COUNT(*) AS n FROM grammar_points GROUP BY hsk_level ORDER BY hsk_level IS NULL, hsk_level',
  ).all() as { hsk_level: number | null; n: number }[];
  return rows.map(r => ({ hsk: grammarLevelLabel(r.hsk_level), count: r.n }));
}

/**
 * Every grammar point of one level — Hanzii and imported lessons alike.
 * Keeps the pre-v4 HanziiGrammar shape the grammar page renders.
 */
export async function listGrammarByLevel(label: string): Promise<HanziiGrammar[]> {
  const level = parseGrammarLevel(label);
  if (level === undefined) return [];
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, source_data, title, title_vi, formula, explanation, use_for, keywords, hsk_level, cefr, category
    FROM grammar_points
    WHERE hsk_level IS ?
    ORDER BY category, id
  `).all(level) as PointRow[];

  const examples = db.prepare(
    'SELECT zh, pinyin, vi, note FROM grammar_examples WHERE grammar_id = ? ORDER BY position',
  );
  return rows.map(r => {
    const hanzii = r.source_data === 'hanzii';
    return {
      id: r.id,
      // Hanzii titles are Vietnamese; the page shows keywords (Chinese) as the heading.
      title: hanzii ? (r.keywords || r.title) : r.title,
      titleVn: hanzii ? r.title : (r.title_vi ?? ''),
      formula: r.formula ?? '',
      explanation: r.explanation ?? '',
      examples: (examples.all(r.id) as { zh: string; pinyin: string | null; vi: string | null; note: string | null }[])
        .map(e => ({ zh: e.zh, vn: e.vi ?? '', note: e.pinyin ?? e.note ?? undefined })),
      level: r.cefr ?? r.category ?? '',
      hsk: grammarLevelLabel(r.hsk_level),
      keywords: r.keywords ?? '',
      useFor: r.use_for ?? '',
    };
  });
}

/**
 * Upserts one crawled Hanzii grammar point (matched on its Hanzii uid); contents are parsed
 * the same way as in the migration. Returns 'inserted' | 'updated'.
 */
export function saveHanziiGrammarPoint(db: Database.Database, item: HanziiGrammarItem): 'inserted' | 'updated' {
  const uid = String(item._id ?? item.id);
  const parsed = parseHanziiContents(item.contents ?? []);
  const level = hanziiLevel(item.level);
  return db.transaction(() => {
    const existing = db.prepare('SELECT id FROM grammar_points WHERE external_uid = ?').pluck().get(uid) as number | undefined;
    const values = [
      (item.title ?? '').trim() || uid, parsed.formula, parsed.explanation || null,
      item.use_for?.trim() || null, item.keywords?.trim() || null, level.hskLevel, level.cefr, level.category,
    ];
    let id: number;
    if (existing != null) {
      db.prepare(`
        UPDATE grammar_points SET title = ?, formula = ?, explanation = ?, use_for = ?, keywords = ?,
          hsk_level = ?, cefr = ?, category = ? WHERE id = ?
      `).run(...values, existing);
      db.prepare('DELETE FROM grammar_examples WHERE grammar_id = ?').run(existing);
      id = existing;
    } else {
      id = Number(db.prepare(`
        INSERT INTO grammar_points (source_data, external_uid, title, formula, explanation, use_for, keywords, hsk_level, cefr, category)
        VALUES ('hanzii', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uid, ...values).lastInsertRowid);
    }
    const insert = db.prepare('INSERT INTO grammar_examples (grammar_id, position, zh, pinyin, vi) VALUES (?, ?, ?, ?, ?)');
    parsed.examples.forEach((e, i) => insert.run(id, i, e.zh, e.pinyin, e.vi));
    return existing != null ? 'updated' : 'inserted';
  })();
}

export function knownHanziiGrammarUids(db: Database.Database): Set<string> {
  return new Set(db.prepare("SELECT external_uid FROM grammar_points WHERE source_data = 'hanzii'").pluck().all() as string[]);
}
