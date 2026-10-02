/**
 * Crawl grammar points from Hanzii into the v4 database (grammar_points, grammar_examples).
 *
 *   npm run crawl:grammar -- [--extra] [--refresh]
 *
 * --extra    also search common words and grammar terms, which surfaces more points
 * --refresh  update points already in the DB (default: skip them, as before)
 *
 * Contents are parsed with the same rules as the migration (src/shared/grammarParse.ts).
 * DB_PATH selects the database (default data/hsk.db).
 */
import { getDb } from '../src/server/db/connection';
import { knownHanziiGrammarUids, saveHanziiGrammarPoint } from '../src/server/repos/grammar';
import { searchHanziiGrammar } from '../src/server/services/hanzii';

const LEVEL_KEYS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', '高等', 'Li hợp', 'Dịch', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'];
const EXTRA_SEEDS = ['的', '了', '是', '在', '不', '有', '把', '被', '得', '着', '过', '吗', '呢', '吧', '比', '从', '对', '给', '还', '很',
  '就', '都', '也', '再', '才', '会', '能', '要', '让', '如果', '虽然', '因为', '所以', '时候',
  'cấu trúc', 'câu', 'ngữ pháp', 'động từ', 'trợ từ', 'phó từ', 'giới từ', 'bổ ngữ'];
const PAGE_SIZE = 50;
const DELAY_MS = 350;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const refresh = process.argv.includes('--refresh');
  const queries = process.argv.includes('--extra') ? [...LEVEL_KEYS, ...EXTRA_SEEDS] : LEVEL_KEYS;
  const db = getDb();
  const known = knownHanziiGrammarUids(db);
  console.log(`In DB: ${known.size}; queries: ${queries.length}${refresh ? '; refreshing existing points' : ''}`);

  const seen = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  for (const key of queries) {
    console.log(`\nQuery "${key}"`);
    for (let page = 1, total = Infinity; (page - 1) * PAGE_SIZE < total; page++) {
      try {
        const res = await searchHanziiGrammar(key, page, PAGE_SIZE);
        total = res.total;
        for (const item of res.result) {
          const uid = String(item._id ?? item.id);
          if (seen.has(uid) || (!refresh && known.has(uid))) { skipped++; continue; }
          seen.add(uid);
          if (saveHanziiGrammarPoint(db, item) === 'inserted') inserted++;
          else updated++;
        }
        console.log(`  page ${page}: ${res.result.length}/${total}  +${inserted} ~${updated}`);
        if (!res.result.length) break;
        await sleep(DELAY_MS);
      } catch (err) {
        errors++;
        console.error(`  ERR ${key} p${page}: ${err instanceof Error ? err.message : err}`);
        await sleep(DELAY_MS * 2);
        break;
      }
    }
  }

  const byLevel = db.prepare(
    "SELECT hsk_level, COUNT(*) AS n FROM grammar_points WHERE source_data = 'hanzii' GROUP BY hsk_level ORDER BY hsk_level IS NULL, hsk_level",
  ).all() as { hsk_level: number | null; n: number }[];
  console.log(`\nDone. inserted=${inserted} updated=${updated} skipped=${skipped} errors=${errors}`);
  for (const r of byLevel) console.log(`  ${r.hsk_level ?? 'chưa xếp cấp'}: ${r.n}`);
}

main().catch(err => { console.error(err); process.exit(1); });
