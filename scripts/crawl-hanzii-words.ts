/** Fill missing Vietnamese compound entries. Safe to resume: completed words are skipped.
 * npm run crawl:words -- [--limit 20] [--concurrency 3] [--report data/hanzii-words-report.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, dbPath } from '../src/server/db/connection';
import { matchesHanziiWord, missingVietnameseCompounds, saveHanziiWord } from '../src/server/repos/hanziiWords';
import { searchHanziiWords } from '../src/server/third-party-service/hanzii';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1] ?? '';
}

async function main() {
  const limit = Number(option('limit', 'Infinity'));
  const concurrency = Number(option('concurrency', '3'));
  if (!(limit > 0) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new Error('Invalid limit/concurrency (1–5)');
  const db = getDb();
  const reportPath = option('report', 'data/hanzii-words-report.json');
  const words = missingVietnameseCompounds(db).slice(0, limit);
  const backup = `${dbPath()}.before-hanzii-${Date.now()}.db`;
  await db.backup(backup);
  console.log(`Backup: ${backup}\nMissing compounds to check: ${words.length}`);
  const report = { startedAt: new Date().toISOString(), completedAt: '', checked: 0, saved: 0,
    missing: [] as typeof words, errors: [] as { word: string; message: string }[] };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const flush = () => { fs.writeFileSync(`${reportPath}.tmp`, JSON.stringify(report, null, 2)); fs.renameSync(`${reportPath}.tmp`, reportPath); };
  for (let i = 0; i < words.length; i += concurrency) {
    await Promise.all(words.slice(i, i + concurrency).map(async word => {
      try {
        let entries;
        for (let attempt = 0; ; attempt++) {
          try { entries = await searchHanziiWords(word.hanzi); break; }
          catch (error) { if (attempt >= 2) throw error; await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
        }
        const matches = entries.filter(entry => matchesHanziiWord(word, entry));
        if (!matches.length) report.missing.push(word);
        else { db.transaction(() => { for (const entry of matches) saveHanziiWord(db, entry, word.id); })(); report.saved++; }
      } catch (error) { report.errors.push({ word: word.hanzi, message: String(error) }); }
      report.checked++;
    }));
    flush();
    console.log(`${report.checked}/${words.length}: saved=${report.saved}, missing=${report.missing.length}, errors=${report.errors.length}`);
    if (i + concurrency < words.length) await new Promise(r => setTimeout(r, 400));
  }
  report.completedAt = new Date().toISOString();
  flush();
  console.log(`Done. Remaining without Vietnamese: ${missingVietnameseCompounds(db).length}. Report: ${reportPath}`);
  if (report.errors.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
