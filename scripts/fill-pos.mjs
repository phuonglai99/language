/**
 * Fill missing `pos` (part of speech) for vocab items in lessons.db.
 * Uses Claude API to classify words in batches of 50.
 * Usage: node scripts/fill-pos.mjs [--dry-run] [--batch 50]
 *
 * Resume-safe: skips vocab items that already have pos set.
 */

import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/lessons.db');

// Load .env.local if ANTHROPIC_API_KEY not already set
if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  }
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '50', 10);

// Vietnamese POS labels used in this project
const POS_LIST = [
  'Danh từ',       // noun
  'Động từ',       // verb
  'Tính từ',       // adjective
  'Phó từ',        // adverb
  'Đại từ',        // pronoun
  'Giới từ',       // preposition
  'Liên từ',       // conjunction
  'Lượng từ',      // measure word
  'Số từ',         // numeral
  'Thán từ',       // interjection / exclamation
  'Trợ từ',        // particle
  'Danh từ riêng', // proper noun
  'Cụm từ',        // set phrase / expression
];

const client = new Anthropic();
const db = new Database(DB_PATH);

// ── Collect all vocab items missing pos ──────────────────────────────────────

const rows = db.prepare('SELECT id, title, data FROM lessons ORDER BY created_at ASC').all();

/** @type {{ lessonId: string; vocabIdx: number; zh: string; py: string; vn: string }[]} */
const missing = [];

for (const row of rows) {
  let d;
  try { d = JSON.parse(row.data); } catch { continue; }
  for (let i = 0; i < (d.vocab ?? []).length; i++) {
    const v = d.vocab[i];
    if (!v.pos || v.pos.trim() === '') {
      missing.push({ lessonId: row.id, vocabIdx: i, zh: v.zh, py: v.py, vn: v.vn });
    }
  }
}

console.log(`Found ${missing.length} vocab items missing pos across ${rows.length} lessons.`);
if (DRY_RUN) {
  console.log('DRY RUN — no changes will be written.');
  console.log('Sample:', missing.slice(0, 5));
  process.exit(0);
}

// ── Classify in batches ───────────────────────────────────────────────────────

async function classifyBatch(words) {
  const wordList = words.map((w, i) =>
    `${i + 1}. ${w.zh} (${w.py}) — ${w.vn}`
  ).join('\n');

  const prompt = `Classify each Chinese word below with its part of speech in Vietnamese.
Return ONLY a JSON array of strings, one per word, in the same order.
Use exactly one of these labels: ${POS_LIST.join(', ')}.

Words:
${wordList}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0].text.trim();
  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${text}`);
  const result = JSON.parse(match[0]);
  if (!Array.isArray(result) || result.length !== words.length) {
    throw new Error(`Expected ${words.length} items, got ${result?.length}: ${text}`);
  }
  return result;
}

// ── Apply pos updates back to DB ──────────────────────────────────────────────

function applyUpdates(lessonId, updates) {
  // updates: Map<vocabIdx, pos>
  const row = db.prepare('SELECT data FROM lessons WHERE id = ?').get(lessonId);
  if (!row) return;
  const d = JSON.parse(row.data);
  for (const [idx, pos] of updates) {
    if (d.vocab[idx]) d.vocab[idx].pos = pos;
  }
  db.prepare('UPDATE lessons SET data = ? WHERE id = ?').run(JSON.stringify(d), lessonId);
}

// ── Main loop ─────────────────────────────────────────────────────────────────

let done = 0;
let errors = 0;

for (let i = 0; i < missing.length; i += BATCH_SIZE) {
  const batch = missing.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(missing.length / BATCH_SIZE);

  process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} words)... `);

  let labels;
  try {
    labels = await classifyBatch(batch);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    errors++;
    continue;
  }

  // Group updates by lessonId
  const byLesson = new Map();
  for (let j = 0; j < batch.length; j++) {
    const { lessonId, vocabIdx } = batch[j];
    if (!byLesson.has(lessonId)) byLesson.set(lessonId, new Map());
    byLesson.get(lessonId).set(vocabIdx, labels[j]);
  }

  for (const [lessonId, updates] of byLesson) {
    applyUpdates(lessonId, updates);
  }

  done += batch.length;
  console.log(`done. Total: ${done}/${missing.length}`);
}

console.log(`\nFinished. Updated ${done} items. Errors: ${errors}.`);
