/**
 * P4 — Grammar: grammar_points, grammar_examples, grammar_exercises.
 * Mapping: docs/db/README.md §2.4.
 *
 * Hanzii `contents` (array of lines) is parsed once here instead of on every read:
 *   - a line becomes an example only when it is one ("- 我是老师。 /Wǒ shì lǎoshī./ Tôi là thầy giáo.",
 *     or a "- 中文 tiếng Việt" bullet right after a "Ví dụ:" header);
 *   - every other line stays in `explanation`, verbatim — the old reader dropped any bullet
 *     containing Hanzi, which lost structure lines such as "- Khẳng định: Chủ ngữ + 需 + …";
 *   - `formula` comes only from a "Cấu trúc: …" line (it used to fall back to keywords and
 *     duplicate the title).
 */
import type { MigrationStep } from '../index';
import { CEFR, HANZII_HSK as HSK, parseHanziiContents } from '../../../src/shared/grammarParse';

interface LessonGrammar {
  title?: string;
  titleVn?: string;
  formula?: string;
  explanation?: string;
  examples?: { zh?: string; vn?: string; note?: string }[];
  exercises?: { type?: string; question?: string; blank?: string; options?: string[]; answer?: string; explanation?: string }[];
  comparisons?: unknown[];
}

export const p4Grammar: MigrationStep = {
  name: 'P4 grammar',
  run({ old, db, log }) {
    const insertPoint = db.prepare(`
      INSERT INTO grammar_points
        (source_data, external_uid, title, title_vi, formula, explanation, use_for, keywords,
         hsk_level, cefr, category, comparisons, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertExample = db.prepare(
      'INSERT INTO grammar_examples (grammar_id, position, zh, pinyin, vi, note) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertExercise = db.prepare(`
      INSERT INTO grammar_exercises (grammar_id, position, type, question, blank, options, answer, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // ── P4.1 / P4.2 Hanzii ──────────────────────────────────────────────────
    const rows = old.prepare(`
      SELECT id, uid, title, use_for, keywords, level, hsk, contents, crawled_at
      FROM hanzii_grammar ORDER BY id
    `).all() as {
      id: number; uid: string | null; title: string; use_for: string | null; keywords: string | null;
      level: string | null; hsk: string | null; contents: string; crawled_at: string;
    }[];

    let hanziiExamples = 0;
    let noFormula = 0;
    const samples: string[] = [];
    for (const r of rows) {
      if (!(r.hsk ?? '') || !((r.hsk ?? '') in HSK)) throw new Error(`Unknown hsk "${r.hsk}" (id ${r.id})`);
      const level = r.level?.trim() ?? '';
      const cefr = CEFR.has(level) ? level : null;
      const category = !cefr && level && level !== '高等' ? level : null;
      const parsed = parseHanziiContents(JSON.parse(r.contents) as string[]);
      if (!parsed.formula) noFormula++;

      const { lastInsertRowid } = insertPoint.run(
        'hanzii', r.uid, r.title.trim(), null, parsed.formula, parsed.explanation || null,
        r.use_for?.trim() || null, r.keywords?.trim() || null,
        HSK[r.hsk!], cefr, category, null, r.crawled_at,
      );
      const id = Number(lastInsertRowid);
      parsed.examples.forEach((e, i) => insertExample.run(id, i, e.zh, e.pinyin, e.vi, null));
      hanziiExamples += parsed.examples.length;
      if (samples.length < 3 && parsed.examples.length && parsed.explanation.includes('\n')) {
        samples.push(`#${id} ${r.title}: formula=${parsed.formula ?? '-'}; ${parsed.examples.length} ví dụ`);
      }
    }
    log(`hanzii: ${rows.length} points, ${hanziiExamples} examples, ${noFormula} without a "Cấu trúc:" line`);

    // ── P4.3 grammar from uploaded lessons ──────────────────────────────────
    const lessons = old.prepare('SELECT title, level, created_at, data FROM lessons').all() as
      { title: string; level: string | null; created_at: string; data: string }[];
    let points = 0;
    let examples = 0;
    let exercises = 0;
    let comparisons = 0;
    for (const lesson of lessons) {
      const level = /^HSK([1-6])$/.exec(lesson.level ?? '');
      for (const g of (JSON.parse(lesson.data) as { grammar?: LessonGrammar[] }).grammar ?? []) {
        if (!g.title?.trim()) throw new Error(`Grammar point without title in "${lesson.title}"`);
        const cmp = g.comparisons?.length ? JSON.stringify(g.comparisons) : null;
        const { lastInsertRowid } = insertPoint.run(
          'import', null, g.title.trim(), g.titleVn?.trim() || null, g.formula?.trim() || null,
          g.explanation?.trim() || null, null, null,
          level ? Number(level[1]) : null, null, null, cmp, lesson.created_at,
        );
        const id = Number(lastInsertRowid);
        points++;
        if (cmp) comparisons += g.comparisons!.length;
        (g.examples ?? []).filter(e => e.zh?.trim()).forEach((e, i) => {
          insertExample.run(id, i, e.zh!.trim(), null, e.vn?.trim() || null, e.note?.trim() || null);
          examples++;
        });
        (g.exercises ?? []).forEach((x, i) => {
          if (x.type !== 'fill' && x.type !== 'choice') throw new Error(`Exercise type "${x.type}" in "${g.title}"`);
          insertExercise.run(
            id, i, x.type, x.question ?? '', x.blank ?? null,
            x.options ? JSON.stringify(x.options) : null, x.answer ?? '', x.explanation ?? null,
          );
          exercises++;
        });
      }
    }
    log(`import: ${points} points, ${examples} examples, ${exercises} exercises, ${comparisons} comparisons`);

    const byLevel = db.prepare(
      'SELECT hsk_level, COUNT(*) AS n FROM grammar_points GROUP BY hsk_level ORDER BY hsk_level',
    ).all() as { hsk_level: number | null; n: number }[];
    log(`by hsk_level: ${byLevel.map(r => `${r.hsk_level ?? 'chưa xếp cấp'}=${r.n}`).join(' ')}`);
    const byCategory = db.prepare(
      'SELECT category, COUNT(*) AS n FROM grammar_points WHERE category IS NOT NULL GROUP BY category',
    ).all() as { category: string; n: number }[];
    log(`by category: ${byCategory.map(r => `${r.category}=${r.n}`).join(' ')}`);
    if (samples.length) log(`samples: ${samples.join('; ')}`);
  },
};
