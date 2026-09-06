/**
 * Crawl kanji data from Hanzii API and store in SQLite.
 * Usage: node scripts/crawl-hanzii.mjs [--limit 100] [--concurrency 3]
 *
 * Resume-safe: skips characters already in DB.
 * Stores data in data/lessons.db, table `kanji`.
 */

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/lessons.db');

// ─── Decryption ──────────────────────────────────────────────────────────────

const SECRET_KEY = 'I2F6a0dYSRcybhgOVA9aM1o+ByE4GAd+Vx4MMzQWH2cDCgFlWzYWGE5bHEBRAHNSXys7Jjl/XFFSFmQaBhUJPzU0H0tdaBABMR4MBx0eBkgNHFAfBwd7GlRFAFw6UQYlMBobBg==';
const PEPPER = 'myPepper123';

function decodeSecret(b64Key, pepper) {
  const bytes = Buffer.from(b64Key, 'base64');
  bytes.reverse();
  const pepperBytes = Buffer.from(pepper, 'utf8');
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= pepperBytes[i % pepperBytes.length];
  return bytes.toString('utf8');
}

async function buildAesKey() {
  const decoded = decodeSecret(SECRET_KEY, PEPPER);
  const keyBytes = crypto.createHash('sha256').update(decoded, 'utf8').digest();
  return keyBytes; // 32-byte Buffer
}

function decryptResponse(b64Data, keyBuffer) {
  const bytes = Buffer.from(b64Data, 'base64');
  const iv = bytes.slice(0, 16);
  const cipher = bytes.slice(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

// ─── DB Setup ────────────────────────────────────────────────────────────────

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kanji (
      char        TEXT PRIMARY KEY,
      cn_vi       TEXT,
      pinyin      TEXT,
      strokes     INTEGER,
      radical     TEXT,
      lucthu      TEXT,
      hinhthai    TEXT,
      netbut      TEXT,
      popular     INTEGER,
      means_tdpt  TEXT,
      means_tg    TEXT,
      means_tdtd  TEXT,
      strokes_svg TEXT,
      raw         TEXT,
      crawled_at  TEXT NOT NULL
    );
  `);
}

function insertKanji(stmt, char, data) {
  if (!data.found || !data.result?.length) return false;
  const r = data.result[0];
  const content = r.content?.[0];
  const means = content?.means ?? {};
  stmt.run(
    char,
    r.cn_vi ?? null,
    r.pinyin ?? null,
    r.count ?? null,
    r.sets ?? null,
    r.lucthu ?? null,
    r.hinhthai ?? null,
    r.netbut ?? null,
    r.popular ?? null,
    JSON.stringify(means.tdpt ?? []),
    JSON.stringify(means.tg ?? []),
    JSON.stringify(means.tdtd ?? []),
    r.strokes ?? null,
    JSON.stringify(data),
    new Date().toISOString(),
  );
  return true;
}

// ─── Fetch + Decrypt ─────────────────────────────────────────────────────────

async function fetchKanji(char, aesKey) {
  const encoded = encodeURIComponent(char);
  const url = `https://api2.hanzii.net/api/search/all/vi/kanji/?key=${encoded}&page=1&limit=5`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Referer': 'https://hanzii.net/' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${char}`);
  const json = await res.json();
  if (!json.data || typeof json.data !== 'string') return { found: false };
  return decryptResponse(json.data, aesKey);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf('--limit');
  const concurrencyArg = args.indexOf('--concurrency');
  const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1]) : Infinity;
  const CONCURRENCY = concurrencyArg >= 0 ? parseInt(args[concurrencyArg + 1]) : 3;
  const DELAY_MS = 400; // delay between batches

  console.log('Building AES key...');
  const aesKey = await buildAesKey();

  console.log('Fetching character list from hanzi.json...');
  const hanziRes = await fetch('https://hanzii.net/db/hanzi.json');
  const hanziMap = await hanziRes.json();
  let chars = Object.keys(hanziMap);
  console.log(`Total chars in hanzi.json: ${chars.length}`);

  const db = new Database(DB_PATH);
  initDb(db);

  const already = new Set(
    db.prepare('SELECT char FROM kanji').all().map(r => r.char)
  );
  console.log(`Already crawled: ${already.size}`);

  chars = chars.filter(c => !already.has(c));
  if (LIMIT < Infinity) chars = chars.slice(0, LIMIT);
  console.log(`To crawl: ${chars.length} chars | concurrency=${CONCURRENCY}\n`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO kanji (char, cn_vi, pinyin, strokes, radical, lucthu, hinhthai, netbut, popular, means_tdpt, means_tg, means_tdtd, strokes_svg, raw, crawled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let done = 0;
  let errors = 0;

  async function processChar(char) {
    try {
      const data = await fetchKanji(char, aesKey);
      insertKanji(stmt, char, data);
      done++;
      if (done % 50 === 0 || done <= 5) {
        const pct = ((done / chars.length) * 100).toFixed(1);
        const eta = Math.round(((chars.length - done) * DELAY_MS) / CONCURRENCY / 1000);
        console.log(`[${done}/${chars.length}] ${pct}% | errors=${errors} | ETA ~${eta}s`);
      }
    } catch (err) {
      errors++;
      console.error(`  ERR ${char}: ${err.message}`);
      db.prepare('INSERT OR IGNORE INTO kanji (char, crawled_at) VALUES (?, ?)').run(char, `ERROR:${err.message}`);
    }
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < chars.length; i += CONCURRENCY) {
    const batch = chars.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processChar));
    if (i + CONCURRENCY < chars.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone. ${done} crawled, ${errors} errors.`);
  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
