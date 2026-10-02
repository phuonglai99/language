/**
 * P6 — Reconciliation report: data/lessons.db (read-only) vs data/hsk.db.
 *
 *   npm run migrate:v4:report   → docs/migration-review/p6-report.md
 *
 * Every check compares a number computed from the old DB with the same fact in the new
 * one. Samples are picked with a fixed seed so two runs on the same data are identical.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { isPunctToken } from '../../src/shared/text';

const ROOT = path.resolve(__dirname, '../..');
const OLD = path.join(ROOT, 'data/lessons.db');
const NEW = path.join(ROOT, 'data/hsk.db');
const OUT = path.join(ROOT, 'docs/migration-review/p6-report.md');

const old = new Database(OLD, { readonly: true, fileMustExist: true });
const db = new Database(NEW, { fileMustExist: true });

const one = <T = number>(conn: Database.Database, sql: string, ...args: unknown[]) =>
  conn.prepare(sql).pluck().get(...args) as T;
const fmt = (n: number) => n.toLocaleString('vi-VN');

interface Check { area: string; what: string; old: number; new: number; expect: string; ok: boolean }
const checks: Check[] = [];
function check(area: string, what: string, oldN: number, newN: number, expectedNew = oldN, note = '') {
  checks.push({
    area, what, old: oldN, new: newN,
    expect: expectedNew === oldN ? (note || 'bằng nhau') : `${fmt(expectedNew)}${note ? ` (${note})` : ''}`,
    ok: newN === expectedNew,
  });
}

// ── Characters ───────────────────────────────────────────────────────────────
const kanji = one(old, 'SELECT COUNT(*) FROM kanji');
const corrupt = one(old, 'SELECT COUNT(*) FROM kanji WHERE length(char) <> 1');
check('Chữ Hán', 'kanji → characters (crawl_status = ok)', kanji,
  one(db, "SELECT COUNT(*) FROM characters WHERE crawl_status = 'ok'"), kanji - corrupt, `bỏ ${corrupt} dòng hỏng`);
check('Chữ Hán', 'Chữ có dữ liệu nét', one(old, "SELECT COUNT(*) FROM kanji WHERE strokes_svg <> ''"),
  one(db, 'SELECT COUNT(*) FROM character_strokes'));
const oldComponentChars = one(old,
  "SELECT COUNT(*) FROM kanji WHERE json_valid(botu_claude) AND json_array_length(botu_claude) > 0 AND length(char) = 1");
check('Chữ Hán', 'Chữ có phân tích Ý/Âm', oldComponentChars, one(db, 'SELECT COUNT(DISTINCT char) FROM character_components'));
const oldComponentRows = one(old,
  "SELECT SUM(json_array_length(botu_claude)) FROM kanji WHERE json_valid(botu_claude) AND length(char) = 1");
check('Chữ Hán', 'Dòng phân tích Ý/Âm', oldComponentRows, one(db, 'SELECT COUNT(*) FROM character_components'));
check('Chữ Hán', 'Chữ có bộ thủ', one(old, "SELECT COUNT(*) FROM kanji WHERE radical <> '' AND length(char) = 1"),
  one(db, "SELECT COUNT(*) FROM characters WHERE radical_id IS NOT NULL"));

// ── Vocabulary ───────────────────────────────────────────────────────────────
const vocabRows = old.prepare(
  "SELECT json_extract(v.value, '$.zh') AS zh FROM lessons, json_each(lessons.data, '$.vocab') v",
).pluck().all() as string[];
const strip = (s: string) => s.replace(/[（(][^）)]*[）)]/g, '').trim();
const vocabHanzi = new Set(vocabRows.filter(Boolean).map(strip));
const missingVocab = [...vocabHanzi].filter(h => !one(db, 'SELECT COUNT(*) FROM words WHERE hanzi = ?', h));
check('Từ vựng', 'Chữ trong vocab import có trong words', vocabHanzi.size, vocabHanzi.size - missingVocab.length);
check('Từ vựng', 'Ví dụ của vocab → sense_examples', vocabRows.length, one(db, 'SELECT COUNT(*) FROM sense_examples'));
const mbPairs = one(old, `
  SELECT COUNT(*) FROM (SELECT DISTINCT json_extract(w.value, '$.wordId'), json_extract(w.value, '$.definition'), json_extract(w.value, '$.hanzi')
  FROM mb_lessons, json_each(mb_lessons.content) p, json_each(p.value) w WHERE json_extract(w.value, '$.wordId') IS NOT NULL)`);
check('Từ vựng', '(wordId, definition) Mandarin Bean → nghĩa en', mbPairs,
  one(db, "SELECT COUNT(*) FROM word_senses WHERE source = 'mandarin_bean'"));
check('Từ vựng', 'Chữ trong word_characters thiếu ở characters', 0,
  one(db, 'SELECT COUNT(*) FROM word_characters wc LEFT JOIN characters c ON c.char = wc.char WHERE c.char IS NULL'));

// ── Passages ─────────────────────────────────────────────────────────────────
check('Bài khóa', 'mb_lessons → passages', one(old, 'SELECT COUNT(*) FROM mb_lessons'), one(db, 'SELECT COUNT(*) FROM passages'));
check('Bài khóa', 'Câu', one(old, 'SELECT SUM(json_array_length(content)) FROM mb_lessons'),
  one(db, 'SELECT COUNT(*) FROM passage_sentences'));
check('Bài khóa', 'Token', one(old, `SELECT COUNT(*) FROM mb_lessons, json_each(mb_lessons.content) p, json_each(p.value) w`),
  one(db, 'SELECT SUM(json_array_length(tokens)) FROM passage_sentences'));
check('Bài khóa', 'Token có wordId → token có nghĩa (s)',
  one(old, `SELECT COUNT(*) FROM mb_lessons, json_each(mb_lessons.content) p, json_each(p.value) w WHERE json_extract(w.value, '$.wordId') IS NOT NULL`),
  one(db, `SELECT COUNT(*) FROM passage_sentences, json_each(passage_sentences.tokens) t WHERE json_extract(t.value, '$.s') IS NOT NULL`));
const oldMarks = one(old, `SELECT COUNT(*) FROM mb_lessons, json_each(mb_lessons.sentence_timestamps) t
  WHERE json_extract(t.value, '$.start') IS NOT NULL AND json_extract(t.value, '$.end') IS NOT NULL`);
const zeroMarks = one(old, `SELECT COUNT(*) FROM mb_lessons, json_each(mb_lessons.sentence_timestamps) t
  WHERE json_extract(t.value, '$.start') IS NOT NULL AND json_extract(t.value, '$.start') >= json_extract(t.value, '$.end')`);
check('Bài khóa', 'Câu có mốc audio', oldMarks,
  one(db, 'SELECT COUNT(*) FROM passage_sentences WHERE audio_start IS NOT NULL AND audio_end IS NOT NULL'),
  oldMarks - zeroMarks, `bỏ ${zeroMarks} mốc dài 0 giây`);
check('Bài khóa', 'Bài "Checked" → review_status = checked',
  one(old, `SELECT COUNT(*) FROM mb_lessons WHERE categories LIKE '%"Checked"%'`),
  one(db, "SELECT COUNT(*) FROM passages WHERE review_status = 'checked'"));
// Text must survive the split: sentences joined == old content_text.
let textMismatch = 0;
const oldText = new Map(old.prepare('SELECT slug, content_text FROM mb_lessons').all().map(r => {
  const row = r as { slug: string; content_text: string };
  return [row.slug, row.content_text.replace(/\s+/g, '')];
}));
for (const p of db.prepare('SELECT id, slug FROM passages').all() as { id: number; slug: string }[]) {
  const joined = (db.prepare('SELECT zh FROM passage_sentences WHERE passage_id = ? ORDER BY idx').pluck().all(p.id) as string[])
    .join('').replace(/\s+/g, '');
  if (joined !== oldText.get(p.slug)) textMismatch++;
}
check('Bài khóa', 'Bài có văn bản khác content_text cũ', 0, textMismatch);

// ── Grammar ──────────────────────────────────────────────────────────────────
const lessonGrammar = one(old, "SELECT COUNT(*) FROM lessons, json_each(lessons.data, '$.grammar')");
check('Ngữ pháp', 'hanzii_grammar + ngữ pháp bài upload → grammar_points',
  one(old, 'SELECT COUNT(*) FROM hanzii_grammar') + lessonGrammar, one(db, 'SELECT COUNT(*) FROM grammar_points'));
check('Ngữ pháp', 'hsk = "Khác" → nhóm Chưa xếp cấp', one(old, "SELECT COUNT(*) FROM hanzii_grammar WHERE hsk = 'Khác'"),
  one(db, 'SELECT COUNT(*) FROM grammar_points WHERE hsk_level IS NULL'));
check('Ngữ pháp', 'Bài tập', one(old,
  "SELECT COUNT(*) FROM lessons, json_each(lessons.data, '$.grammar') g, json_each(g.value, '$.exercises')"),
  one(db, 'SELECT COUNT(*) FROM grammar_exercises'));
check('Ngữ pháp', 'Điểm có formula trùng title', 0, one(db, 'SELECT COUNT(*) FROM grammar_points WHERE formula = title'));

// ── Notes ────────────────────────────────────────────────────────────────────
check('Ghi chú', 'note_folders', one(old, 'SELECT COUNT(*) FROM note_folders'), one(db, 'SELECT COUNT(*) FROM note_folders'));
check('Ghi chú', 'note_items', one(old, 'SELECT COUNT(*) FROM note_items'), one(db, 'SELECT COUNT(*) FROM note_items'));

// ── Integrity ────────────────────────────────────────────────────────────────
const integrity = one<string>(db, 'PRAGMA integrity_check');
const fkErrors = (db.pragma('foreign_key_check') as unknown[]).length;
const sizeMb = (f: string) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);

// ── Samples (fixed seed) ─────────────────────────────────────────────────────
let seed = 20261002;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function sampleIds(sql: string, n: number): number[] {
  const ids = db.prepare(sql).pluck().all() as number[];
  const out: number[] = [];
  while (out.length < Math.min(n, ids.length)) {
    const id = ids[Math.floor(rand() * ids.length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

const lines: string[] = [];
lines.push('# Báo cáo đối chiếu P6 — DB cũ ↔ DB v4', '');
lines.push(`Sinh bởi \`npm run migrate:v4:report\` lúc ${new Date().toISOString()}.`, '');
lines.push('## 1. Tổng quan', '');
lines.push('| | DB cũ (`lessons.db`) | DB mới (`hsk.db`) |', '|---|---|---|');
lines.push(`| Dung lượng | ${sizeMb(OLD)} MB | ${sizeMb(NEW)} MB |`);
lines.push(`| \`integrity_check\` | | ${integrity} |`);
lines.push(`| \`foreign_key_check\` | | ${fkErrors === 0 ? 'không lỗi' : `${fkErrors} lỗi`} |`, '');
const failed = checks.filter(c => !c.ok);
lines.push(`## 2. Đối chiếu số liệu — ${checks.length - failed.length}/${checks.length} đạt`, '');
lines.push('| Nhóm | Kiểm tra | DB cũ | DB mới | Kỳ vọng | |', '|---|---|---|---|---|---|');
for (const c of checks) lines.push(`| ${c.area} | ${c.what} | ${fmt(c.old)} | ${fmt(c.new)} | ${c.expect} | ${c.ok ? '✅' : '❌'} |`);
if (missingVocab.length) lines.push('', `Vocab không tìm thấy trong \`words\`: ${missingVocab.join(', ')}`);
lines.push('');

lines.push('## 3. Mẫu ngẫu nhiên để xem tay', '');
lines.push('### 3.1 Chữ Hán (20)', '');
lines.push('| Chữ | Hán Việt | Bộ thủ | Lục thư | Phổ biến | Ý/Âm | Nét |', '|---|---|---|---|---|---|---|');
for (const rowid of sampleIds("SELECT rowid FROM characters WHERE crawl_status = 'ok'", 20)) {
  const c = db.prepare(`
    SELECT c.char, c.han_viet, r.form || ' ' || r.han_viet AS radical, c.formation, c.formation2, c.frequency,
           (SELECT group_concat(component || '(' || role || ')', ' + ') FROM character_components WHERE char = c.char) AS comp,
           (SELECT has_medians FROM character_strokes WHERE char = c.char) AS strokes
    FROM characters c LEFT JOIN radicals r ON r.id = c.radical_id WHERE c.rowid = ?`).get(rowid) as Record<string, unknown>;
  lines.push(`| ${esc(c.char)} | ${esc(c.han_viet)} | ${esc(c.radical)} | ${esc([c.formation, c.formation2].filter(Boolean).join(' + '))} | ${esc(c.frequency)} | ${esc(c.comp)} | ${c.strokes == null ? '—' : c.strokes ? 'có' : 'mảng trần'} |`);
}
lines.push('', '### 3.2 Từ vựng (20)', '');
lines.push('| Từ | Pinyin | HSK | Chủ đề | Nguồn | Nghĩa |', '|---|---|---|---|---|---|');
for (const id of sampleIds('SELECT id FROM words', 20)) {
  const w = db.prepare('SELECT hanzi, pinyin, hsk_level, topic, source FROM words WHERE id = ?').get(id) as Record<string, unknown>;
  const senses = (db.prepare(`SELECT COALESCE(pos, '?') || ': ' || COALESCE(meaning_vi, meaning_en) FROM word_senses WHERE word_id = ? ORDER BY position`)
    .pluck().all(id) as string[]).join(' · ');
  lines.push(`| ${esc(w.hanzi)} | ${esc(w.pinyin)} | ${esc(w.hsk_level)} | ${esc(w.topic)} | ${esc(w.source)} | ${esc(senses.slice(0, 200))} |`);
}
lines.push('', '### 3.3 Bài khóa (5 bài × 3 câu đầu)', '');
for (const id of sampleIds('SELECT id FROM passages', 5)) {
  const p = db.prepare('SELECT slug, title_zh, hsk_level, category, review_status, sentence_count, vocab_count FROM passages WHERE id = ?').get(id) as Record<string, unknown>;
  lines.push(`**${esc(p.title_zh)}** (\`${esc(p.slug)}\`, HSK${esc(p.hsk_level)}, ${esc(p.category)}, ${esc(p.review_status)}, ${esc(p.sentence_count)} câu, ${esc(p.vocab_count)} từ)`, '');
  lines.push('| # | Câu | Mốc audio | Token → nghĩa |', '|---|---|---|---|');
  const sents = db.prepare('SELECT idx, zh, tokens, audio_start, audio_end FROM passage_sentences WHERE passage_id = ? ORDER BY idx LIMIT 3').all(id) as
    { idx: number; zh: string; tokens: string; audio_start: number | null; audio_end: number | null }[];
  for (const s of sents) {
    const toks = (JSON.parse(s.tokens) as { h: string; s?: number }[]).filter(t => !isPunctToken(t.h)).slice(0, 4).map(t => {
      const m = t.s ? one<string>(db, 'SELECT COALESCE(meaning_vi, meaning_en) FROM word_senses WHERE id = ?', t.s) : '—';
      return `${t.h}: ${String(m).slice(0, 40)}`;
    }).join(' · ');
    lines.push(`| ${s.idx} | ${esc(s.zh)} | ${s.audio_start ?? '—'}–${s.audio_end ?? '—'} | ${esc(toks)} |`);
  }
  lines.push('');
}
lines.push('### 3.4 Ngữ pháp (10)', '');
lines.push('| Tiêu đề | Nguồn | HSK | Loại | Formula | Ví dụ đầu |', '|---|---|---|---|---|---|');
for (const id of sampleIds('SELECT id FROM grammar_points', 10)) {
  const g = db.prepare('SELECT title, source_data, hsk_level, category, formula FROM grammar_points WHERE id = ?').get(id) as Record<string, unknown>;
  const ex = db.prepare('SELECT zh || COALESCE(\' /\' || pinyin || \'/\', \'\') || COALESCE(\' \' || vi, \'\') FROM grammar_examples WHERE grammar_id = ? ORDER BY position LIMIT 1').pluck().get(id);
  lines.push(`| ${esc(g.title)} | ${esc(g.source_data)} | ${esc(g.hsk_level ?? 'chưa xếp cấp')} | ${esc(g.category)} | ${esc(g.formula)} | ${esc(ex)} |`);
}
lines.push('', '## 4. Danh sách cần duyệt từng phase', '');
lines.push('- [P2 — Từ vựng](p2-words.md)', '- [P3 — Bài khóa](p3-passages.md)', '');

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`${checks.length - failed.length}/${checks.length} checks passed; integrity ${integrity}; FK errors ${fkErrors}`);
for (const c of failed) console.log(`FAIL ${c.area} — ${c.what}: old ${c.old}, new ${c.new}, expected ${c.expect}`);
console.log(`→ ${path.relative(ROOT, OUT)}`);
old.close();
db.close();
if (failed.length || fkErrors || integrity !== 'ok') process.exitCode = 1;
