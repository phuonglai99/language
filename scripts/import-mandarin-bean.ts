/**
 * Import crawled Mandarin Bean passages into the v4 database.
 *
 *   npm run import:mb -- [path/to/mandarin-bean-lessons.json]
 *
 * New passages are split into sentences and their tokens linked to dictionary senses.
 * Passages already in the DB only get metadata refreshed — sentences, audio marks and
 * review status are never overwritten. DB_PATH selects the database (default data/hsk.db).
 */
import fs from 'node:fs';
import path from 'node:path';
import { importPassages, isValidCrawledPassage } from '../src/server/services/mandarinBean';

const jsonPath = process.argv[2] ?? path.join(process.cwd(), 'data', 'mandarin-bean-lessons.json');
if (!fs.existsSync(jsonPath)) {
  console.error(`File not found: ${jsonPath}\nRun "npm run crawl" first.`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { lessons?: unknown[] };
const all = (data.lessons ?? []) as Parameters<typeof isValidCrawledPassage>[0][];
const valid = all.filter(isValidCrawledPassage);
console.log(`${valid.length} valid passages (${all.length - valid.length} skipped)`);
const { added, updated } = importPassages(valid);
console.log(`Done. added=${added} updated=${updated}`);
