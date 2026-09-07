/**
 * Patch missing audio_url for MB lessons already in the DB.
 * Fetches each lesson page and extracts audio URL, then updates DB.
 * Usage: node scripts/patch-audio-urls.mjs [--limit N] [--slug SLUG]
 */

import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'lessons.db');
const DELAY_MS = 600;

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;
const slugIdx = args.indexOf('--slug');
const ONLY_SLUG = slugIdx >= 0 ? args[slugIdx + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HSK-Web-Crawler/1.0; educational use)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractAudioUrl($) {
  return (
    $('audio[src]').first().attr('src') ||
    $('audio').first().attr('data-mb-audio-src') ||
    $('audio source').first().attr('src') ||
    null
  );
}

const db = new Database(DB_PATH);

let rows;
if (ONLY_SLUG) {
  rows = db.prepare('SELECT slug, url FROM mb_lessons WHERE slug = ?').all(ONLY_SLUG);
} else {
  rows = db.prepare(
    'SELECT slug, url FROM mb_lessons WHERE audio_url IS NULL OR audio_url = \'\' ORDER BY hsk_level, slug'
  ).all();
}

if (LIMIT) rows = rows.slice(0, LIMIT);

console.log(`Patching audio URLs for ${rows.length} lessons…`);

const update = db.prepare('UPDATE mb_lessons SET audio_url = ? WHERE slug = ?');

let ok = 0, missing = 0, failed = 0;

for (let i = 0; i < rows.length; i++) {
  const { slug, url } = rows[i];
  process.stdout.write(`[${i + 1}/${rows.length}] ${slug} … `);
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const audioUrl = extractAudioUrl($);
    if (audioUrl) {
      update.run(audioUrl, slug);
      console.log(`✓ ${audioUrl}`);
      ok++;
    } else {
      console.log('— no audio');
      missing++;
    }
  } catch (err) {
    console.log(`✗ ${err.message}`);
    failed++;
  }
  if (i < rows.length - 1) await sleep(DELAY_MS);
}

db.close();
console.log(`\nDone. updated=${ok} no_audio=${missing} failed=${failed}`);
