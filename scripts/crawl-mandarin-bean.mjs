/**
 * Crawler for Mandarin Bean reading lessons (HSK 1-5)
 * Extracts: title (EN/ZH), HSK level, categories, audio URL, and annotated content
 */

import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const DELAY_MS = 800; // polite delay between requests
const HSK_LEVELS = [1, 2, 3, 4, 5];
const OUTPUT_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'mandarin-bean-lessons.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HSK-Web-Crawler/1.0; educational use)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.warn(`  Attempt ${attempt} failed for ${url}: ${err.message}`);
      if (attempt < retries) await sleep(2000 * attempt);
      else throw err;
    }
  }
}

/** Get all lesson URLs from a tag archive page (paginated) */
async function getLessonUrlsForHsk(hskLevel) {
  const urls = new Set();
  let page = 1;

  while (true) {
    const pageUrl =
      page === 1
        ? `https://mandarinbean.com/tag/hsk${hskLevel}/`
        : `https://mandarinbean.com/tag/hsk${hskLevel}/page/${page}/`;

    console.log(`  Fetching index: ${pageUrl}`);
    let html;
    try {
      html = await fetchPage(pageUrl);
    } catch {
      console.log(`  No more pages at ${pageUrl}`);
      break;
    }

    const $ = cheerio.load(html);

    // Extract lesson links (exclude nav/category/tag links)
    const SKIP_PATTERN =
      /(all-lessons|grammar|blog|pricing|login|category|\/tag\/|pinyin|hsk-chinese|yct-|premium|confusing|chinese-grammar|chinese-grammar-test|online-yct|hsk-chinese-test)/;

    let found = 0;
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (
        href.match(/mandarinbean\.com\/[a-z][a-z0-9-]+\/$/) &&
        !href.match(SKIP_PATTERN)
      ) {
        urls.add(href);
        found++;
      }
    });

    if (found === 0) {
      console.log(`  No lessons found on page ${page}, stopping`);
      break;
    }

    // Check if there's a next page
    const hasNext = $('a.next, .nav-previous a, [class*="next"] a').length > 0 ||
      $(`a[href*="/page/${page + 1}/"]`).length > 0;
    if (!hasNext) break;

    page++;
    await sleep(DELAY_MS);
  }

  return [...urls];
}

/** Parse a single lesson page and extract all content */
async function parseLessonPage(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  // Title (English)
  const titleEn = $('h1').first().text().trim();

  // Chinese title: h2 with .si (simplified) and .tr (traditional) spans
  let titleZhSimp = '';
  let titleZhTrad = '';
  $('h2, h3').each((_, el) => {
    const siSpan = $(el).find('.si').first();
    const trSpan = $(el).find('.tr').first();
    if (siSpan.length && /[一-鿿]/.test(siSpan.text())) {
      titleZhSimp = siSpan.text().trim();
      titleZhTrad = trSpan.text().trim() || titleZhSimp;
    } else {
      // Fallback: check raw text for Chinese
      const text = $(el).text().trim();
      if (/[一-鿿]/.test(text) && !titleZhSimp) titleZhSimp = text;
    }
  });

  // HSK level from tags
  let hskLevel = null;
  const categories = [];
  $('a[href*="/tag/"]').each((_, el) => {
    const text = $(el).text().trim();
    const hskMatch = text.match(/^HSK(\d+)$/i);
    if (hskMatch) {
      hskLevel = parseInt(hskMatch[1]);
    } else if (text && !['Beginner', 'Intermediate', 'Advanced', 'Learn more >>', 'Sign in', 'Cancel reply', 'Blog'].includes(text)) {
      categories.push(text);
    }
  });

  // Also check breadcrumbs/labels for level
  $('[class*="tag"], [class*="category"], [class*="label"]').each((_, el) => {
    const text = $(el).text().trim();
    const hskMatch = text.match(/HSK(\d+)/);
    if (hskMatch && !hskLevel) hskLevel = parseInt(hskMatch[1]);
  });

  // Audio URL
  const audioUrl =
    $('audio').attr('src') ||
    $('audio source').attr('src') ||
    $('[class*="audio"]').attr('src') ||
    null;

  // Content: ruby elements inside a single <p>, separated by <br> for paragraph breaks
  const contentParagraphs = [];

  // Find the <p> element(s) containing ruby elements
  $('p').each((_, pEl) => {
    const rubiesInP = $(pEl).find('ruby');
    if (rubiesInP.length === 0) return;

    // Split by <br> children to get paragraph segments
    let currentParagraph = [];
    $(pEl).contents().each((_, node) => {
      if (node.type === 'tag' && node.name === 'br') {
        // Line break = paragraph boundary
        if (currentParagraph.length > 0) {
          contentParagraphs.push(currentParagraph);
          currentParagraph = [];
        }
      } else if (node.type === 'tag' && node.name === 'ruby') {
        const rubyEl = node;
        const hanzi = $(rubyEl).find('.si').text().trim() || $(rubyEl).find('span').first().text().trim();
        const pinyin = $(rubyEl).attr('data-mb-pinyin') || $(rubyEl).find('rt').text().trim();
        const hsk = $(rubyEl).attr('data-mb-newhsk') ? parseInt($(rubyEl).attr('data-mb-newhsk')) : null;
        const definition = $(rubyEl).attr('data-mb-definition') || null;
        const wordId = $(rubyEl).attr('data-mb-word-id') || null;
        if (hanzi) currentParagraph.push({ hanzi, pinyin, hsk, definition, wordId });
      }
    });
    if (currentParagraph.length > 0) contentParagraphs.push(currentParagraph);
  });

  // Build plain text content for each paragraph
  const contentText = contentParagraphs
    .map((words) => words.map((w) => w.hanzi).join(''))
    .join('\n\n');

  // Deduplicate categories
  const uniqueCategories = [...new Set(categories)];

  return {
    slug: url.replace('https://mandarinbean.com/', '').replace(/\/$/, ''),
    url,
    title_en: titleEn,
    title_zh_simplified: titleZhSimp,
    title_zh_traditional: titleZhTrad,
    hsk_level: hskLevel,
    categories: uniqueCategories,
    audio_url: audioUrl,
    content: contentParagraphs,
    content_text: contentText,
  };
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load existing progress if any
  let allLessons = [];
  const progressFile = path.join(OUTPUT_DIR, 'crawl-progress.json');
  let crawledUrls = new Set();
  if (fs.existsSync(progressFile)) {
    const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    crawledUrls = new Set(progress.crawledUrls || []);
    allLessons = progress.lessons || [];
    console.log(`Resuming from previous run: ${crawledUrls.size} already crawled`);
  }

  for (const hsk of HSK_LEVELS) {
    console.log(`\n=== Collecting HSK${hsk} lesson URLs ===`);
    const lessonUrls = await getLessonUrlsForHsk(hsk);
    console.log(`  Found ${lessonUrls.length} unique lessons for HSK${hsk}`);

    const remaining = lessonUrls.filter((u) => !crawledUrls.has(u));
    console.log(`  ${remaining.length} not yet crawled`);

    for (let i = 0; i < remaining.length; i++) {
      const url = remaining[i];
      console.log(`  [${i + 1}/${remaining.length}] HSK${hsk}: ${url}`);

      try {
        const lesson = await parseLessonPage(url);
        // Override HSK level with the tag page HSK if lesson's own detection failed
        if (!lesson.hsk_level) lesson.hsk_level = hsk;
        allLessons.push(lesson);
        crawledUrls.add(url);

        // Save progress after each lesson
        fs.writeFileSync(
          progressFile,
          JSON.stringify({ crawledUrls: [...crawledUrls], lessons: allLessons }, null, 2)
        );

        console.log(
          `    ✓ "${lesson.title_en}" | HSK${lesson.hsk_level} | ${lesson.content.length} paragraphs | audio: ${!!lesson.audio_url}`
        );
      } catch (err) {
        console.error(`    ✗ Failed: ${err.message}`);
      }

      await sleep(DELAY_MS);
    }
  }

  // Write final output
  const output = {
    crawled_at: new Date().toISOString(),
    total_lessons: allLessons.length,
    by_hsk_level: HSK_LEVELS.reduce((acc, hsk) => {
      acc[`hsk${hsk}`] = allLessons.filter((l) => l.hsk_level === hsk).length;
      return acc;
    }, {}),
    lessons: allLessons,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Done! ${allLessons.length} lessons saved to ${OUTPUT_FILE}`);

  // Cleanup progress file
  if (fs.existsSync(progressFile)) fs.unlinkSync(progressFile);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
