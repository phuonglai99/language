/** Refresh imported senses from the word dictionary, including single characters.
 * Raw responses are cached so audits can be repeated offline. Existing IDs stay intact.
 */
import fs from 'node:fs';
import { getDb, dbPath } from '../src/server/db/connection';
import { searchHanziiWords, type HanziiWord } from '../src/server/third-party-service/hanzii';
import { reconcileStoredHanziiPos } from '../src/server/repos/storedHanziiPos';
import { reconcileCachedCharacterPos } from '../src/server/repos/hanziiCharacterPos';
import { reconcileHanziiWord } from '../src/server/repos/hanziiReconcile';

async function main() {
  const db = getDb();
  const fetchMissing = process.argv.includes('--fetch-missing');
  const replay = process.argv.includes('--replay-cache');
  const backup = `${dbPath()}.before-pos-${Date.now()}.db`;
  await db.backup(backup);
  fs.mkdirSync('data/hanzii-word-cache', { recursive: true });
  const cachedEntries = new Map<string, HanziiWord[]>();
  for (const file of fs.readdirSync('data/hanzii-word-cache').filter(file => file.endsWith('.json'))) {
    for (const entry of JSON.parse(fs.readFileSync(`data/hanzii-word-cache/${file}`, 'utf8')) as HanziiWord[]) {
      const list = cachedEntries.get(entry.word) ?? [];
      if (!list.some(saved => saved.id === entry.id && saved.pinyin === entry.pinyin)) list.push(entry);
      cachedEntries.set(entry.word, list);
    }
  }
  const words = db.prepare(`SELECT DISTINCT w.id, w.hanzi, w.pinyin FROM words w JOIN word_senses s ON s.word_id = w.id
    WHERE s.source = 'import' AND s.verified = 0 AND (? OR COALESCE(s.note, '') NOT LIKE '%Hanzii %')
    AND trim(COALESCE(s.meaning_vi, '')) <> ''
    ORDER BY w.hanzi = '过' DESC, w.hsk_level IS NULL, w.hsk_level, w.id
  `).all(replay ? 1 : 0) as { id: number; hanzi: string; pinyin: string }[];
  const reportFile = `data/hanzii-pos-report-${Date.now()}.json`;
  const report = { backup, startedAt: new Date().toISOString(), completedAt: '', checked: 0, results: [] as unknown[], errors: [] as unknown[] };
  const flush = () => {
    fs.writeFileSync(`${reportFile}.tmp`, JSON.stringify(report, null, 2));
    fs.renameSync(`${reportFile}.tmp`, reportFile);
  };
  console.log(`Backup: ${backup}; words: ${words.length}`);
  for (let i = 0; i < words.length; i += 3) {
    await Promise.all(words.slice(i, i + 3).map(async word => {
      try {
        const file = `data/hanzii-word-cache/${word.id}.json`;
        const storedWordChanges = db.transaction(() => reconcileStoredHanziiPos(db, word.id))();
        const cachedCharacterChanges = db.transaction(() => reconcileCachedCharacterPos(db, word))();
        let entries: HanziiWord[];
        if (fs.existsSync(file)) entries = JSON.parse(fs.readFileSync(file, 'utf8'));
        else if (cachedEntries.has(word.hanzi)) entries = cachedEntries.get(word.hanzi)!;
        else if (fetchMissing) {
          entries = await searchHanziiWords(word.hanzi);
          fs.writeFileSync(file, JSON.stringify(entries));
        }
        else entries = [];
        report.results.push({ ...word, storedWordChanges, cachedCharacterChanges, cacheAvailable: fs.existsSync(file) || cachedEntries.has(word.hanzi), ...reconcileHanziiWord(db, word, entries) });
      } catch (error) { report.errors.push({ ...word, error: String(error) }); }
      report.checked++;
    }));
    flush();
    if (i % 99 === 0) console.log(`${report.checked}/${words.length}, errors=${report.errors.length}`);
    if (report.errors.length >= 15 && report.results.length === 0) throw new Error('Dictionary unavailable; stopped without modifying senses');
    if (fetchMissing) await new Promise(resolve => setTimeout(resolve, 150));
  }
  report.completedAt = new Date().toISOString();
  flush();
  console.log(`Done: ${report.checked}, errors=${report.errors.length}; report=${reportFile}`);
  if (report.errors.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
