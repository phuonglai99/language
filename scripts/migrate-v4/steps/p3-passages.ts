/**
 * P3 — Reading passages: passages + passage_sentences (text, tokens, audio marks).
 * Mapping: docs/db/README.md §2.3. Needs the TEMP table mb_sense_map from P2.
 *
 * Each element of mb_lessons.content is one sentence (content was split per sentence on
 * 2026-09-07), and sentence_timestamps[i] belongs to content[i].
 */
import type { MigrationStep } from '../index';
import { isPunctToken } from '../../../src/shared/text';

interface MBToken {
  hanzi: string;
  pinyin: string;
  definition: string | null;
  wordId?: string | null;
}

interface Timestamp { index: number; start: number | null; end: number | null }

interface Token { h: string; p?: string; s?: number }

const REVIEW_TAGS = new Set(['Checked', 'Uncheck']);

export const p3Passages: MigrationStep = {
  name: 'P3 passages',
  run({ old, db, log }) {
    const rows = old.prepare(`
      SELECT slug, url, title_en, title_zh_simplified, title_zh_traditional, hsk_level,
             categories, audio_url, content, sentence_timestamps, vocab_count
      FROM mb_lessons ORDER BY hsk_level, slug
    `).all() as {
      slug: string; url: string; title_en: string; title_zh_simplified: string; title_zh_traditional: string;
      hsk_level: number; categories: string; audio_url: string | null; content: string;
      sentence_timestamps: string | null; vocab_count: number | null;
    }[];

    const insertPassage = db.prepare(`
      INSERT INTO passages
        (slug, source, source_url, title_zh, title_zh_trad, title_en, hsk_level, category,
         audio_url, audio_source, review_status, translation_status)
      VALUES (?, 'mandarin_bean', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none')
    `);
    const insertSentence = db.prepare(`
      INSERT INTO passage_sentences (passage_id, idx, zh, tokens, audio_start, audio_end)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateCounts = db.prepare('UPDATE passages SET sentence_count = ?, vocab_count = ? WHERE id = ?');
    const senseOf = db.prepare(
      'SELECT sense_id FROM mb_sense_map WHERE mb_word_id = ? AND definition = ? AND hanzi = ?',
    ).pluck();

    let sentences = 0;
    let tokens = 0;
    let linked = 0;
    let unlinkedHan = 0;
    let unaligned = 0;
    const zeroLength: string[] = [];
    const multiCategory: string[] = [];
    const vocabCountChanges: string[] = [];
    const statusMismatch: string[] = [];

    for (const r of rows) {
      const tags = JSON.parse(r.categories) as string[];
      const topics = tags.filter(t => !REVIEW_TAGS.has(t));
      if (topics.length > 1) multiCategory.push(`${r.slug}: ${topics.join(', ')} → ${topics[0]}`);
      const reviewStatus = tags.includes('Checked') ? 'checked' : 'unchecked';

      const { lastInsertRowid } = insertPassage.run(
        r.slug, r.url, r.title_zh_simplified, r.title_zh_traditional || null, r.title_en || null,
        r.hsk_level, topics[0] ?? null, r.audio_url, r.audio_url ? 'crawl' : null, reviewStatus,
      );
      const passageId = Number(lastInsertRowid);

      const content = JSON.parse(r.content) as MBToken[][];
      const marks = r.sentence_timestamps ? (JSON.parse(r.sentence_timestamps) as Timestamp[]) : [];
      if (marks.length && marks.length !== content.length) {
        throw new Error(`${r.slug}: ${marks.length} timestamps for ${content.length} sentences`);
      }

      const vocab = new Set<string>();
      let passageUnaligned = 0;
      content.forEach((para, idx) => {
        const out: Token[] = para.map(t => {
          tokens++;
          const h = t.hanzi ?? '';
          const tok: Token = { h };
          if (t.pinyin?.trim()) tok.p = t.pinyin.trim();
          if (isPunctToken(h)) return tok;
          vocab.add(h.trim());
          if (t.wordId && t.definition) {
            const s = senseOf.get(t.wordId, t.definition, h.trim()) as number | undefined;
            if (s == null) throw new Error(`${r.slug}#${idx}: no sense for ${h} (${t.wordId})`);
            tok.s = s;
            linked++;
          } else if (/\p{Script=Han}/u.test(h)) {
            unlinkedHan++;
          }
          return tok;
        });

        const mark = marks[idx];
        if (mark && mark.index !== idx) throw new Error(`${r.slug}: timestamp ${mark.index} at position ${idx}`);
        let start = mark?.start ?? null;
        let end = mark?.end ?? null;
        if (start != null && end != null && !(start < end)) {
          zeroLength.push(`${r.slug} câu ${idx}: ${start}–${end}`);
          start = null;
          end = null;
        }
        if (start == null || end == null) passageUnaligned++;

        insertSentence.run(passageId, idx, para.map(t => t.hanzi ?? '').join(''), JSON.stringify(out), start, end);
        sentences++;
      });
      unaligned += passageUnaligned;
      updateCounts.run(content.length, vocab.size, passageId);
      if (r.vocab_count != null && r.vocab_count !== vocab.size) {
        vocabCountChanges.push(`${r.slug}: ${r.vocab_count} → ${vocab.size}`);
      }
      // Align page derives its own status from missing marks; show where the two disagree.
      const fullyAligned = passageUnaligned === 0;
      if ((reviewStatus === 'checked') !== fullyAligned) {
        statusMismatch.push(`${r.slug}: ${reviewStatus}, ${passageUnaligned} câu chưa có mốc`);
      }
    }

    log(`passages: ${rows.length}; sentences: ${sentences}; tokens: ${tokens}`);
    log(`tokens linked to a sense: ${linked}; Han tokens without sense: ${unlinkedHan}`);
    log(`sentences without audio marks: ${unaligned}`);
    log(`REVIEW zero-length audio marks set to NULL (${zeroLength.length}): ${zeroLength.join('; ')}`);
    log(`REVIEW passages with several categories (${multiCategory.length}): ${multiCategory.join('; ')}`);
    log(`REVIEW review_status vs audio marks disagree (${statusMismatch.length}): ${statusMismatch.join('; ')}`);
    log(`vocab_count changed in ${vocabCountChanges.length} passages (curly quotes etc. no longer counted)`);
  },
};
