import type Database from 'better-sqlite3';
import { getDb } from '../db/connection';
import { fetchFromHanzii, type HanziiCharacter } from '../third-party-service/hanzii';
import {
  BOTU_FROM_ROLE, formationLabel, normalizeStrokeData, parseFormation, parseFrequency, parseRadical,
} from '@/shared/hanzi';
import type { CharacterDetailDTO, StrokeData } from '@/types/api';

interface CharacterRow {
  char: string; han_viet: string | null; pinyin: string | null; stroke_count: number | null;
  formation: string | null; formation2: string | null; structure: string | null; stroke_order: string | null;
  frequency: number | null; hv_meanings: string | null; hv_compounds: string | null; hv_dictionary: string | null;
  crawl_status: string; radical_form: string | null; radical_hv: string | null; strokes: string | null;
}

const parseList = (json: string | null): string[] => (json ? (JSON.parse(json) as string[]) : []);

function readCharacter(db: Database.Database, char: string): CharacterRow | undefined {
  return db.prepare(`
    SELECT c.*, r.form AS radical_form, r.han_viet AS radical_hv, s.data AS strokes
    FROM characters c
    LEFT JOIN radicals r ON r.id = c.radical_id
    LEFT JOIN character_strokes s ON s.char = c.char
    WHERE c.char = ?
  `).get(char) as CharacterRow | undefined;
}

function toDetail(db: Database.Database, r: CharacterRow): CharacterDetailDTO {
  const dictionary = parseList(r.hv_dictionary);
  // First dictionary entry starts with the part of speech: "(Tính) Tốt, lành, …"
  const pos = dictionary[0]?.match(/^\(([^)]+)\)/)?.[1] ?? null;
  const parts = db.prepare(
    'SELECT component, role, note FROM character_components WHERE char = ? ORDER BY position',
  ).all(r.char) as { component: string; role: string; note: string | null }[];
  return {
    char: r.char,
    cnVi: r.han_viet,
    pinyin: r.pinyin,
    strokes: r.stroke_count,
    radical: r.radical_form ? `${r.radical_hv} ${r.radical_form}` : null,
    lucthu: formationLabel(r.formation, r.formation2),
    hinhthai: r.structure,
    netbut: r.stroke_order,
    popular: r.frequency,
    pos,
    meansTdpt: parseList(r.hv_meanings),
    meansTg: parseList(r.hv_compounds),
    meansTdtd: dictionary,
    strokesSvg: r.strokes ? (JSON.parse(r.strokes) as StrokeData) : null,
    botu: parts.length ? parts.map(p => ({ t: BOTU_FROM_ROLE[p.role], ph: p.component, n: p.note ?? '' })) : null,
    botuSource: parts.length ? 'claude' : null,
  };
}

function radicalId(db: Database.Database, raw: string | undefined): number | null {
  const parsed = parseRadical(raw);
  if (!parsed) return null;
  const byForm = parsed.form
    ? db.prepare('SELECT id FROM radicals WHERE form = ?').pluck().get(parsed.form) as number | undefined
    : db.prepare('SELECT id FROM radicals WHERE han_viet = ? ORDER BY kangxi_no IS NULL, id LIMIT 1').pluck().get(parsed.hanViet) as number | undefined;
  if (byForm != null) return byForm;
  if (!parsed.form) return null;
  // A form the seed does not know yet: keep it, flagged as coming from Hanzii and unreviewed.
  return Number(db.prepare(
    "INSERT INTO radicals (form, han_viet, source, verified) VALUES (?, ?, 'hanzii', 0)",
  ).run(parsed.form, parsed.hanViet).lastInsertRowid);
}

/** Stores a character fetched from Hanzii (insert, or fill a 'pending' stub). */
export function saveCrawledCharacter(db: Database.Database, h: HanziiCharacter): void {
  const [formation, formation2] = (() => {
    try { return parseFormation(h.lucthu); } catch { return [null, null] as const; }
  })();
  const frequency = parseFrequency(h.popular) ?? null;
  const list = (items: string[]) => (items.length ? JSON.stringify(items) : null);
  db.transaction(() => {
    db.prepare(`
      INSERT INTO characters
        (char, radical_id, han_viet, pinyin, stroke_count, formation, formation2, structure, stroke_order,
         frequency, hv_meanings, hv_compounds, hv_dictionary, crawl_status, crawl_error, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(char) DO UPDATE SET
        radical_id = excluded.radical_id, han_viet = excluded.han_viet, pinyin = excluded.pinyin,
        stroke_count = excluded.stroke_count, formation = excluded.formation, formation2 = excluded.formation2,
        structure = excluded.structure, stroke_order = excluded.stroke_order, frequency = excluded.frequency,
        hv_meanings = excluded.hv_meanings, hv_compounds = excluded.hv_compounds, hv_dictionary = excluded.hv_dictionary,
        crawl_status = 'ok', crawl_error = NULL, crawled_at = excluded.crawled_at
    `).run(
      h.char, radicalId(db, h.radical), h.cn_vi ?? null, h.pinyin ?? null, h.strokes ?? null,
      formation, formation2, h.hinhthai || null, h.netbut || null, frequency,
      list(h.means_tdpt), list(h.means_tg), list(h.means_tdtd),
    );
    const strokes = (() => {
      try { return normalizeStrokeData(h.strokes_svg ?? null); } catch { return null; }
    })();
    if (strokes) {
      db.prepare(`
        INSERT INTO character_strokes (char, data, has_medians, source) VALUES (?, ?, ?, 'hanzii')
        ON CONFLICT(char) DO UPDATE SET data = excluded.data, has_medians = excluded.has_medians
      `).run(h.char, JSON.stringify(strokes.data), strokes.hasMedians ? 1 : 0);
    }
  })();
}

/**
 * Character detail for the kanji panel. Characters never crawled (missing, or 'pending'
 * stubs) are fetched from Hanzii once and cached.
 */
export async function getCharacterDetail(char: string): Promise<CharacterDetailDTO | null> {
  const db = getDb();
  let row = readCharacter(db, char);
  if (!row || row.crawl_status !== 'ok') {
    const fetched = await fetchFromHanzii(char).catch(() => null);
    if (fetched) {
      saveCrawledCharacter(db, fetched);
      row = readCharacter(db, char);
    }
  }
  return row && row.crawl_status === 'ok' ? toDetail(db, row) : null;
}

/** HanziWriter stroke data for several characters at once; null when the DB has none. */
export async function getStrokes(chars: string[]): Promise<Record<string, StrokeData | null>> {
  const unique = [...new Set(chars)].slice(0, 50);
  const out: Record<string, StrokeData | null> = Object.fromEntries(unique.map(c => [c, null]));
  if (!unique.length) return out;
  const rows = getDb().prepare(
    `SELECT char, data FROM character_strokes WHERE char IN (${unique.map(() => '?').join(',')})`,
  ).all(...unique) as { char: string; data: string }[];
  for (const r of rows) out[r.char] = JSON.parse(r.data) as StrokeData;
  return out;
}

/** Records a failed crawl so the character is retried later (status 'error'). */
export function markCrawlError(db: Database.Database, char: string, message: string): void {
  db.prepare(`
    INSERT INTO characters (char, crawl_status, crawl_error) VALUES (?, 'error', ?)
    ON CONFLICT(char) DO UPDATE SET crawl_status = 'error', crawl_error = excluded.crawl_error
    WHERE characters.crawl_status <> 'ok'
  `).run(char, message.slice(0, 500));
}
