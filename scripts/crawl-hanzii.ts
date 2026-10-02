/**
 * Crawl character data from Hanzii into the v4 database (characters, character_strokes).
 *
 *   npm run crawl:kanji -- [--limit 100] [--concurrency 3]
 *
 * Resume-safe: characters already crawled (crawl_status 'ok') are skipped; 'pending' stubs
 * and earlier errors are retried. DB_PATH selects the database (default data/hsk.db).
 */
import { getDb } from '../src/server/db/connection';
import { markCrawlError, saveCrawledCharacter } from '../src/server/repos/characters';
import { fetchFromHanzii } from '../src/server/services/hanzii';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const limit = arg('limit', Infinity);
  const concurrency = arg('concurrency', 3);
  const delayMs = 400;

  console.log('Fetching character list from hanzi.json...');
  const list = await (await fetch('https://hanzii.net/db/hanzi.json')).json() as Record<string, unknown>;
  const db = getDb();
  const done = new Set(db.prepare("SELECT char FROM characters WHERE crawl_status = 'ok'").pluck().all() as string[]);
  let chars = Object.keys(list).filter(c => !done.has(c));
  if (Number.isFinite(limit)) chars = chars.slice(0, limit);
  console.log(`Total ${Object.keys(list).length}, already crawled ${done.size}, to crawl ${chars.length} (concurrency ${concurrency})`);

  let saved = 0;
  let missing = 0;
  let errors = 0;
  async function crawl(char: string) {
    try {
      const data = await fetchFromHanzii(char);
      if (!data) { missing++; return; } // Hanzii has nothing: leave it for a later run
      saveCrawledCharacter(db, data);
      saved++;
      if (saved % 50 === 0 || saved <= 5) console.log(`[${saved + missing + errors}/${chars.length}] saved=${saved} missing=${missing} errors=${errors}`);
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ERR ${char}: ${message}`);
      markCrawlError(db, char, message);
    }
  }

  for (let i = 0; i < chars.length; i += concurrency) {
    await Promise.all(chars.slice(i, i + concurrency).map(crawl));
    if (i + concurrency < chars.length) await sleep(delayMs);
  }
  console.log(`\nDone. saved=${saved} missing=${missing} errors=${errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
