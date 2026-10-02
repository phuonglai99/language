/**
 * P1 — Characters: radicals, characters (+ pending stubs), components, strokes.
 * Mapping: docs/db/README.md §2.1.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MigrationStep } from '../index';
import { hanChars } from '../../../src/shared/text';

interface SeedRadical {
  no: number;
  form: string;
  hv: string;
  meaning: string;
  strokes: number;
  variants: { form: string; strokes: number }[];
}

interface KanjiRow {
  char: string;
  cn_vi: string | null;
  pinyin: string | null;
  strokes: number | null;
  radical: string | null;
  lucthu: string | null;
  hinhthai: string | null;
  netbut: string | null;
  popular: string | null;
  means_tdpt: string | null;
  means_tg: string | null;
  means_tdtd: string | null;
  strokes_svg: string | null;
  botu_claude: string | null;
  crawled_at: string;
}

const SEED = path.join(__dirname, '../seed/radicals.json');

const FORMATION: Record<string, string> = {
  'tượng hình': 'pictograph',
  'chỉ sự': 'ideograph',
  'hội ý': 'compound',
  'hình thanh': 'phono_semantic',
  'giả tá': 'loan',
  'chuyển chú': 'derivative',
};
/** Canonical order, so "hội ý & hình thanh" and "hình thanh & hội ý" store the same way. */
const FORMATION_ORDER = ['pictograph', 'ideograph', 'compound', 'phono_semantic', 'loan', 'derivative'];

const FREQUENCY: Record<string, number> = { 'rất thấp': 1, 'thấp': 2, 'trung bình': 3, 'cao': 4, 'rất cao': 5 };

const ROLE: Record<string, string> = { y: 'meaning', am: 'sound', solo: 'self' };

function parseFormation(raw: string | null): [string | null, string | null] {
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

/** JSON array text → same text, or NULL when empty / missing. */
function jsonArrayOrNull(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`Expected JSON array, got ${raw.slice(0, 40)}`);
  return parsed.length ? JSON.stringify(parsed) : null;
}

export const p1Characters: MigrationStep = {
  name: 'P1 characters',
  run({ old, db, log }) {
    // ── P1.1 radicals ────────────────────────────────────────────────────────
    const seed = JSON.parse(fs.readFileSync(SEED, 'utf8')) as SeedRadical[];
    // Forms that occur in the Hanzii data (kanji.radical = "nữ 女") keep source 'hanzii';
    // forms only present because the seed added them are 'ai'. Meaning, Kangxi number and
    // stroke count were written by AI for every row, hence verified = 0 throughout.
    const hanziiForms = new Set(
      (old.prepare("SELECT DISTINCT radical FROM kanji WHERE radical LIKE '% %'").all() as { radical: string }[])
        .map(r => r.radical.slice(r.radical.indexOf(' ') + 1).trim().normalize('NFKC')),
    );
    const insertRadical = db.prepare(
      'INSERT INTO radicals (form, han_viet, kangxi_no, meaning_vi, stroke_count, source, verified) VALUES (?, ?, ?, ?, ?, ?, 0)',
    );
    const radicalIdByForm = new Map<string, number>();
    const mainFormByHv = new Map<string, string>();
    for (const r of seed) {
      const rows = [{ form: r.form, strokes: r.strokes }, ...r.variants];
      for (const v of rows) {
        const source = hanziiForms.has(v.form) ? 'hanzii' : 'ai';
        const { lastInsertRowid } = insertRadical.run(v.form, r.hv, r.no, r.meaning, v.strokes, source);
        radicalIdByForm.set(v.form, Number(lastInsertRowid));
      }
      if (!mainFormByHv.has(r.hv)) mainFormByHv.set(r.hv, r.form);
    }
    const aiRows = (db.prepare("SELECT COUNT(*) AS n FROM radicals WHERE source = 'ai'").get() as { n: number }).n;
    log(`radicals: ${radicalIdByForm.size} rows (${seed.length} Kangxi + variants); source: ${radicalIdByForm.size - aiRows} hanzii, ${aiRows} ai`);

    const resolveRadical = (raw: string | null): number | null => {
      const value = raw?.trim();
      if (!value) return null;
      const space = value.indexOf(' ');
      // "nguyệt" (name only) → look up by Hán Việt name
      const form = space < 0
        ? mainFormByHv.get(value.toLowerCase())
        : value.slice(space + 1).normalize('NFKC'); // ⾎ (Kangxi block) → 血
      const id = form ? radicalIdByForm.get(form) : undefined;
      if (id == null) throw new Error(`Unmapped radical "${value}"`);
      return id;
    };

    // ── P1.2 characters ──────────────────────────────────────────────────────
    const kanji = old.prepare(`
      SELECT char, cn_vi, pinyin, strokes, radical, lucthu, hinhthai, netbut, popular,
             means_tdpt, means_tg, means_tdtd, strokes_svg, botu_claude, crawled_at
      FROM kanji
    `).all() as KanjiRow[];

    const insertChar = db.prepare(`
      INSERT INTO characters
        (char, radical_id, han_viet, pinyin, stroke_count, formation, formation2, structure, stroke_order,
         frequency, hv_meanings, hv_compounds, hv_dictionary, crawl_status, crawl_error, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const skipped: string[] = [];
    const kept: KanjiRow[] = [];
    for (const k of kanji) {
      if ([...k.char].length !== 1) {
        skipped.push(JSON.stringify(k.char));
        continue;
      }
      const [formation, formation2] = parseFormation(k.lucthu);
      const frequency = k.popular ? FREQUENCY[k.popular] : null;
      if (k.popular && frequency == null) throw new Error(`Unknown popular "${k.popular}" for ${k.char}`);
      const failed = k.crawled_at.startsWith('ERROR');
      insertChar.run(
        k.char, resolveRadical(k.radical), k.cn_vi, k.pinyin, k.strokes,
        formation, formation2, k.hinhthai || null, k.netbut || null, frequency,
        jsonArrayOrNull(k.means_tdpt), jsonArrayOrNull(k.means_tg), jsonArrayOrNull(k.means_tdtd),
        failed ? 'error' : 'ok', failed ? k.crawled_at.slice('ERROR:'.length) : null, failed ? null : k.crawled_at,
      );
      kept.push(k);
    }
    log(`characters: ${kept.length} from kanji; skipped ${skipped.length} invalid: ${skipped.join(', ')}`);

    // ── P1.3 pending stubs for characters referenced but never crawled ───────
    const known = new Set(kept.map(k => k.char));
    const needed = new Set<string>();
    for (const k of kept) {
      if (!k.botu_claude) continue;
      for (const part of JSON.parse(k.botu_claude) as { ph?: string }[]) {
        for (const ch of hanChars(part.ph ?? '')) needed.add(ch);
      }
    }
    const vocabRows = old.prepare(
      "SELECT json_extract(v.value, '$.zh') AS zh FROM lessons, json_each(lessons.data, '$.vocab') v",
    ).all() as { zh: string | null }[];
    for (const { zh } of vocabRows) for (const ch of hanChars(zh ?? '')) needed.add(ch);
    const tokenRows = old.prepare(`
      SELECT DISTINCT json_extract(w.value, '$.hanzi') AS h
      FROM mb_lessons, json_each(mb_lessons.content) p, json_each(p.value) w
    `).all() as { h: string | null }[];
    for (const { h } of tokenRows) for (const ch of hanChars(h ?? '')) needed.add(ch);
    const noteRows = old.prepare('SELECT zh FROM note_items').all() as { zh: string }[];
    for (const { zh } of noteRows) for (const ch of hanChars(zh)) needed.add(ch);

    const insertStub = db.prepare("INSERT INTO characters (char, crawl_status) VALUES (?, 'pending')");
    const stubs = [...needed].filter(ch => !known.has(ch)).sort();
    for (const ch of stubs) insertStub.run(ch);
    log(`characters: ${stubs.length} pending stubs: ${stubs.join(' ')}`);

    // ── P1.4 components (Ý / Âm) ─────────────────────────────────────────────
    const insertComponent = db.prepare(`
      INSERT INTO character_components (char, position, component, role, note, source, verified)
      VALUES (?, ?, ?, ?, ?, 'ai', 0)
    `);
    let componentRows = 0;
    let componentChars = 0;
    for (const k of kept) {
      if (!k.botu_claude || k.botu_claude === 'null') continue;
      const parts = JSON.parse(k.botu_claude) as { t?: string; ph?: string; n?: string }[];
      if (!Array.isArray(parts) || parts.length === 0) continue;
      componentChars++;
      parts.forEach((part, i) => {
        const role = ROLE[part.t ?? ''];
        if (!role) throw new Error(`Unknown component role "${part.t}" for ${k.char}`);
        const component = (part.ph ?? '').trim();
        if ([...component].length !== 1) throw new Error(`Component "${component}" of ${k.char} is not one character`);
        insertComponent.run(k.char, i, component, role, part.n?.trim() || null);
        componentRows++;
      });
    }
    log(`character_components: ${componentRows} rows for ${componentChars} characters`);

    // ── P1.5 strokes (HanziWriter data) ──────────────────────────────────────
    const insertStrokes = db.prepare(
      "INSERT INTO character_strokes (char, data, has_medians, source) VALUES (?, ?, ?, 'hanzii')",
    );
    let strokeRows = 0;
    let bareArrays = 0;
    for (const k of kept) {
      if (!k.strokes_svg) continue;
      const parsed = JSON.parse(k.strokes_svg) as unknown;
      // Most rows are HanziWriter objects {strokes, medians, radStrokes}; some are a bare
      // array of stroke paths. Store both as an object so data.strokes always exists.
      let data: { strokes?: unknown; medians?: unknown };
      if (Array.isArray(parsed)) {
        data = { strokes: parsed };
        bareArrays++;
      } else {
        data = parsed as typeof data;
      }
      if (!Array.isArray(data.strokes)) throw new Error(`Stroke data of ${k.char} has no strokes array`);
      const hasMedians = Array.isArray(data.medians) ? 1 : 0;
      insertStrokes.run(k.char, Array.isArray(parsed) ? JSON.stringify(data) : k.strokes_svg, hasMedians);
      strokeRows++;
    }
    log(`character_strokes: ${strokeRows} rows, ${bareArrays} converted from bare stroke arrays (no medians)`);
  },
};
