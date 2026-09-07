/**
 * Crawl Chinese grammar points from Hanzii and store in SQLite, grouped by HSK.
 * Usage: node scripts/crawl-hanzii-grammar.mjs
 *
 * Resume-safe: skips ids already in DB.
 * Stores data in data/lessons.db, table `hanzii_grammar`.
 */

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/lessons.db');

const SECRET_KEY = 'I2F6a0dYSRcybhgOVA9aM1o+ByE4GAd+Vx4MMzQWH2cDCgFlWzYWGE5bHEBRAHNSXys7Jjl/XFFSFmQaBhUJPzU0H0tdaBABMR4MBx0eBkgNHFAfBwd7GlRFAFw6UQYlMBobBg==';
const PEPPER = 'myPepper123';

const LEVEL_KEYS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', '高等', 'Li hợp', 'Dịch', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'];
const EXTRA_SEEDS = ['的', '了', '是', '在', '不', '有', '把', '被', '得', '着', '过', '吗', '呢', '吧', '比', '从', '对', '给', '还', '很', '就', '都', '也', '再', '才', '会', '能', '要', '让', '如果', '虽然', '因为', '所以', '时候', 'cấu trúc', 'câu', 'ngữ pháp', 'động từ', 'trợ từ', 'phó từ', 'giới từ', 'bổ ngữ'];

const HSK_MAP = {
  A1: 'HSK1',
  A2: 'HSK2',
  B1: 'HSK3',
  B2: 'HSK4',
  C1: 'HSK5',
  C2: 'HSK6',
  高等: 'HSK7-9',
  'Li hợp': 'Khác',
  Dịch: 'Khác',
};

const PAGE_SIZE = 50;
const DELAY_MS = 350;
const HEADERS = {
  Accept: 'application/json',
  Referer: 'https://hanzii.net/',
  Origin: 'https://hanzii.net',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'X-Client-Id': 'hzw_ba07c148af1713c1e1290501',
};

function decodeSecret(b64Key, pepper) {
  const bytes = Buffer.from(b64Key, 'base64');
  bytes.reverse();
  const pepperBytes = Buffer.from(pepper, 'utf8');
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= pepperBytes[i % pepperBytes.length];
  return bytes.toString('utf8');
}

function buildAesKey() {
  const decoded = decodeSecret(SECRET_KEY, PEPPER);
  return crypto.createHash('sha256').update(decoded, 'utf8').digest();
}

function decryptResponse(b64Data, keyBuffer) {
  const bytes = Buffer.from(b64Data, 'base64');
  const iv = bytes.subarray(0, 16);
  const cipher = bytes.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function mapHsk(level) {
  return HSK_MAP[level] || 'Khác';
}

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hanzii_grammar (
      id INTEGER PRIMARY KEY,
      uid TEXT,
      title TEXT NOT NULL,
      use_for TEXT,
      keywords TEXT,
      level TEXT,
      hsk TEXT,
      contents TEXT NOT NULL,
      examples TEXT,
      raw TEXT,
      crawled_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS hanzii_grammar_hsk ON hanzii_grammar(hsk);
    CREATE INDEX IF NOT EXISTS hanzii_grammar_level ON hanzii_grammar(level);
  `);
}

async function searchGrammar(key, page, aesKey) {
  const url = `https://api2.hanzii.net/api/search/all/vi/grammar/?key=${encodeURIComponent(key)}&page=${page}&limit=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${key} p${page}`);
  const json = await res.json();
  if (!json.data || typeof json.data !== 'string') {
    return { result: [], total: 0 };
  }
  const data = decryptResponse(json.data, aesKey);
  return { result: data.result || [], total: data.total || 0 };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('Building AES key...');
  const aesKey = buildAesKey();

  const db = new Database(DB_PATH);
  initDb(db);

  const already = new Set(
    db.prepare('SELECT id FROM hanzii_grammar').all().map(r => r.id)
  );
  console.log(`Already in DB: ${already.size}`);

  const stmt = db.prepare(`
    INSERT INTO hanzii_grammar (id, uid, title, use_for, keywords, level, hsk, contents, examples, raw, crawled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      uid=excluded.uid,
      title=excluded.title,
      use_for=excluded.use_for,
      keywords=excluded.keywords,
      level=excluded.level,
      hsk=excluded.hsk,
      contents=excluded.contents,
      examples=excluded.examples,
      raw=excluded.raw,
      crawled_at=excluded.crawled_at
  `);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const seenThisRun = new Set(already);

  function saveItems(items) {
    for (const it of items) {
      const id = Number(it.id);
      if (!Number.isFinite(id)) continue;
      if (seenThisRun.has(id)) {
        skipped++;
        continue;
      }
      seenThisRun.add(id);
      stmt.run(
        id,
        it._id ?? null,
        it.title ?? '',
        it.use_for ?? null,
        it.keywords ?? null,
        it.level ?? null,
        mapHsk(it.level),
        JSON.stringify(it.contents ?? []),
        JSON.stringify(it.examples ?? []),
        JSON.stringify(it),
        new Date().toISOString(),
      );
      inserted++;
    }
  }

  const extra = process.argv.includes('--extra');
  const queries = extra ? [...LEVEL_KEYS, ...EXTRA_SEEDS] : LEVEL_KEYS;
  console.log(`Queries: ${queries.length}${extra ? ' (with extra seeds)' : ''}`);
  for (const key of queries) {
    let page = 1;
    let total = Infinity;
    console.log(`\nQuery "${key}"`);
    while ((page - 1) * PAGE_SIZE < total) {
      try {
        const { result, total: t } = await searchGrammar(key, page, aesKey);
        total = t;
        console.log(`  page ${page}  got ${result.length}/${total}  db+${inserted}`);
        saveItems(result);
        if (!result.length) break;
        page++;
        await sleep(DELAY_MS);
      } catch (err) {
        errors++;
        console.error(`  ERR ${key} p${page}: ${err.message}`);
        await sleep(DELAY_MS * 2);
        break;
      }
    }
  }

  const counts = db.prepare(
    'SELECT hsk, COUNT(*) as n FROM hanzii_grammar GROUP BY hsk ORDER BY hsk'
  ).all();
  const totalRows = db.prepare('SELECT COUNT(*) as n FROM hanzii_grammar').get();

  console.log(`\nDone. inserted/updated=${inserted} skipped=${skipped} errors=${errors}`);
  console.log(`Total in DB: ${totalRows.n}`);
  for (const row of counts) console.log(`  ${row.hsk}: ${row.n}`);
  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
