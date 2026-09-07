#!/usr/bin/env node
/**
 * Split Mandarin Bean lesson content into sentence-sized segments.
 *
 * Dry-run by default:
 *   node scripts/migrate-mb-split-sentences.mjs
 *
 * Apply changes:
 *   node scripts/migrate-mb-split-sentences.mjs --apply
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'lessons.db');
const APPLY = process.argv.includes('--apply');
const SAMPLE_SLUGS = new Set(['be-late-again', 'avoid-being-late']);

const FULL_STOP_PUNCT = new Set(['。']);
const FINAL_PUNCT = new Set(['？', '！', '?', '!']);
const CLOSING_PUNCT = new Set(['”', '’', '」', '』', '）', '】', ')', ']']);

function textOfSegment(segment) {
  return segment.map((word) => word.hanzi || '').join('');
}

function hasFullStop(text) {
  return [...(text || '')].some((char) => FULL_STOP_PUNCT.has(char));
}

function hasFinalPunctuation(text) {
  return [...(text || '')].some((char) => FINAL_PUNCT.has(char));
}

function isClosingPunctuationOnly(text) {
  const chars = [...(text || '')].filter((char) => char.trim());
  return chars.length > 0 && chars.every((char) => CLOSING_PUNCT.has(char));
}

function splitSegment(segment) {
  const out = [];
  let current = [];
  let pendingEnd = false;

  function flush() {
    if (current.length > 0) out.push(current);
    current = [];
    pendingEnd = false;
  }

  for (let index = 0; index < segment.length; index++) {
    const word = segment[index];
    const hanzi = word.hanzi || '';
    if (pendingEnd && !isClosingPunctuationOnly(hanzi)) {
      flush();
    }

    current.push(word);
    const remaining = segment.slice(index + 1).map((item) => item.hanzi || '').join('');
    const isSegmentFinalPunctuation =
      hasFinalPunctuation(hanzi) && (!remaining || isClosingPunctuationOnly(remaining));

    if (hasFullStop(hanzi) || isSegmentFinalPunctuation) {
      pendingEnd = true;
    }
  }

  flush();
  return out;
}

function splitContent(content) {
  return content.flatMap((segment) => splitSegment(segment));
}

function contentText(content) {
  return content.map(textOfSegment).join('\n\n');
}

const db = new Database(DB_PATH);
const rows = db
  .prepare('SELECT slug, content, content_text FROM mb_lessons ORDER BY hsk_level, slug')
  .all();

const changes = [];
for (const row of rows) {
  const oldContent = JSON.parse(row.content);
  const newContent = splitContent(oldContent);
  const newContentText = contentText(newContent);
  const changed =
    JSON.stringify(newContent) !== row.content ||
    newContentText !== row.content_text;

  if (changed) {
    changes.push({
      slug: row.slug,
      oldCount: oldContent.length,
      newCount: newContent.length,
      oldPreview: oldContent.slice(0, 5).map(textOfSegment),
      newPreview: newContent.slice(0, 8).map(textOfSegment),
      content: newContent,
      content_text: newContentText,
    });
  }
}

console.log(`Mode: ${APPLY ? 'apply' : 'dry-run'}`);
console.log(`Rows checked: ${rows.length}`);
console.log(`Rows changed: ${changes.length}`);
console.log(
  `Segments: ${changes.reduce((sum, c) => sum + c.oldCount, 0)} -> ${changes.reduce((sum, c) => sum + c.newCount, 0)}`,
);

for (const change of changes.filter((c) => SAMPLE_SLUGS.has(c.slug))) {
  console.log(`\n${change.slug}: ${change.oldCount} -> ${change.newCount}`);
  console.log('Before:');
  for (const line of change.oldPreview) console.log(`  - ${line}`);
  console.log('After:');
  for (const line of change.newPreview) console.log(`  - ${line}`);
}

if (APPLY) {
  const update = db.prepare(
    'UPDATE mb_lessons SET content = ?, content_text = ?, sentence_timestamps = NULL WHERE slug = ?',
  );
  const applyChanges = db.transaction((items) => {
    for (const item of items) {
      update.run(JSON.stringify(item.content), item.content_text, item.slug);
    }
  });
  applyChanges(changes);
  console.log(`\nUpdated ${changes.length} rows and cleared their sentence_timestamps.`);
} else {
  console.log('\nDry-run only. Re-run with --apply to update DB.');
}

db.close();
