/**
 * Fill in missing audio URLs by reading each passage's Mandarin Bean page.
 *
 *   npm run patch:audio -- [--limit N] [--slug SLUG]
 *
 * DB_PATH selects the database (default data/hsk.db).
 */
import * as cheerio from 'cheerio';
import { passagesWithoutAudio, setPassageAudio } from '../src/server/services/mandarinBean';

const DELAY_MS = 600;
const argOf = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const limit = Number(argOf('limit') ?? 0);
  let rows = passagesWithoutAudio(argOf('slug'));
  if (limit) rows = rows.slice(0, limit);
  console.log(`Patching audio URLs for ${rows.length} passages…`);
  let ok = 0, missing = 0, failed = 0;
  for (const [i, { slug, url }] of rows.entries()) {
    process.stdout.write(`[${i + 1}/${rows.length}] ${slug} … `);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HSK-Web-Crawler/1.0; educational use)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const $ = cheerio.load(await res.text());
      const audio = $('audio[src]').first().attr('src') || $('audio').first().attr('data-mb-audio-src') || $('audio source').first().attr('src');
      if (audio) { setPassageAudio(slug, audio); console.log(`✓ ${audio}`); ok++; }
      else { console.log('— no audio'); missing++; }
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message : err}`);
      failed++;
    }
    if (i < rows.length - 1) await sleep(DELAY_MS);
  }
  console.log(`\nDone. updated=${ok} no_audio=${missing} failed=${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
