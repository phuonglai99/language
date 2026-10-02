# Pipeline dữ liệu bài khóa Mandarin Bean

> Viết dựa trên code ở working tree ngày 2026-10-01. Không chạy script nào. Số liệu lấy từ `data/lessons.db` (`SELECT`, chỉ đọc), từ `data/mandarin-bean-lessons.json` (đọc cấu trúc bằng Python) và từ các file log trong `data/`.

## Mục đích

Đưa bài đọc của mandarinbean.com (HSK 1–5) vào bảng `mb_lessons`. Bảng này phục vụ 3 tính năng: đọc bài (`reading.md`), chép chính tả (`dictation.md`) và căn audio (`dictation-align.md`).

## Màn hình & route

Pipeline không có UI riêng; nó chạy hoàn toàn bằng script CLI. Dữ liệu tạo ra được dùng ở:
- `/reading`, `/dictation`, `/dictation/align`: đọc DB.
- `/lessons`: đọc thẳng file JSON qua `src/lib/lessons.ts:5`.

## Luồng xử lý (thứ tự chạy)

```
1 crawl-mandarin-bean.mjs ──► data/mandarin-bean-lessons.json (734 bài, 3501 đoạn)
        (tiến độ tạm: data/crawl-progress.json, bị xóa khi xong)
2 import-mandarin-bean.mjs ──► mb_lessons (729 bài hợp lệ; vocab_count/sentence_count = NULL)
3 (app) ensureMBTable/backfillMBCounts ──► điền vocab_count, sentence_count lần đầu có request
4 patch-audio-urls.mjs ──► mb_lessons.audio_url (chỉ những bài đang thiếu)
5 migrate-mb-split-sentences.mjs --apply ──► content/content_text tách theo câu (6629 câu),
        đặt NULL cho sentence_timestamps, vocab_count, sentence_count
6 align-whisper.py ──► mb_lessons.sentence_timestamps
7 (UI) /dictation/align/[slug] ──► sửa sentence_timestamps (+ content khi gắn lại text)
8 (?) "Checked"/"Uncheck" thêm vào categories ── không có script trong repo
```

Thứ tự bước 4 và 5 có thể đổi cho nhau vì hai bước ghi vào các cột khác nhau. **Bước 5 phải chạy trước bước 6**, nếu không mốc Whisper sẽ bị xóa. **Chạy lại bước 2 sau bước 5** sẽ ghi đè `content` bằng bản chưa tách câu (xem mục Vấn đề phát hiện).

### Bước 1: Crawl (`scripts/crawl-mandarin-bean.mjs`, `npm run crawl`)
1. Với mỗi HSK 1..5, duyệt `https://mandarinbean.com/tag/hsk{N}/` và `/page/{p}/` (dòng 102-154).
   - Lấy mọi `a[href]` khớp `mandarinbean.com/<slug>/`, trừ các link khớp `SKIP_PATTERN` (dòng 124-137).
   - Dừng khi một trang không có link bài nào, khi không còn trang kế, hoặc khi fetch lỗi.
2. Bỏ qua URL đã có trong `crawledUrls`, tức đã crawl ở HSK trước hoặc ở lần chạy trước (dòng 268).
3. `parseLessonPage(url)` (dòng 157-247):
   - `title_en` = `h1` đầu tiên.
   - `title_zh_simplified` / `title_zh_traditional`: lấy `.si` / `.tr` trong `h2,h3`. Fallback là text của heading có chữ Hán.
   - `hsk_level`: lấy từ link `/tag/` có text `HSK\d`. Nếu không có thì tìm trong `[class*=tag|category|label]`. Nếu vẫn không có, `main` gán bằng HSK của trang tag đang duyệt (dòng 278).
   - `categories`: text của các link `/tag/` không phải HSK, trừ danh sách loại (`Beginner`, `Intermediate`, `Advanced`, …), đã khử trùng (dòng 183-191, 233).
   - `audio_url` (`extractAudioUrl`, dòng 26-50): lần lượt thử `audio[src]`, `data-mb-audio-src`, `audio source`, `[class*=audio]`. Nếu không có, thử link tải `download.mandarinbean.com/audio`; nếu link có tham số `source` thì decode base64. URL tương đối được chuẩn hóa thành tuyệt đối.
   - `content`: duyệt từng `<p>` có `<ruby>`. Mỗi `<br>` là một ranh giới đoạn (dòng 207-225).
     - `<ruby>` → `{hanzi (.si), pinyin (data-mb-pinyin | rt), hsk (data-mb-newhsk), definition (data-mb-definition), wordId (data-mb-word-id)}`.
     - Text node (dấu câu, số, chữ Latin) → `{hanzi: text bỏ khoảng trắng, pinyin:'', hsk:null, definition:null, wordId:null}`.
   - `content_text` = nối hanzi của từng đoạn, các đoạn cách nhau `\n\n`.
   - `slug` = phần path của URL.
4. Sau mỗi bài, ghi `data/crawl-progress.json` = `{crawledUrls, lessons}` để chạy tiếp được nếu bị ngắt (dòng 283-286). Delay 800 ms giữa các request, retry 3 lần với backoff `2000·attempt` ms.
5. Khi xong: ghi `data/mandarin-bean-lessons.json` = `{crawled_at, total_lessons, by_hsk_level:{hsk1..hsk5}, lessons}`, rồi xóa file progress (dòng 300-314).

Cấu trúc file hiện tại (đọc bằng Python):
- `crawled_at = 2026-09-07T06:09:15.943Z`, `total_lessons = 734`, `by_hsk_level = {hsk1:60, hsk2:137, hsk3:183, hsk4:182, hsk5:172}`.
- Mỗi bài có các khóa `audio_url, categories, content, content_text, hsk_level, slug, title_en, title_zh_simplified, title_zh_traditional, url`.
- 5 bài không hợp lệ (thiếu `title_en`, `content` hoặc `hsk_level`); 5 bài không có audio.
- 0 slug trùng; 0 bài có "Checked"/"Uncheck".
- Tổng số đoạn: 3501.
- Log `data/crawl-mandarin-bean.log` kết thúc bằng "Done! 734 lessons".

### Bước 2: Import (`scripts/import-mandarin-bean.mjs`, `npm run import:mb`)
- **Input:** `argv[2]`, mặc định `data/mandarin-bean-lessons.json`. **Output:** `data/lessons.db`.
- Lọc `isValid`: phải có `title_en`, `content` là mảng không rỗng, và `hsk_level` (dòng 32-36). Kết quả 734 → 729.
- `CREATE TABLE IF NOT EXISTS mb_lessons (...)` gồm 11 cột, **không có** `vocab_count`/`sentence_count`. Sau đó `ALTER ... ADD COLUMN sentence_timestamps` (dòng 41-58).
- UPSERT theo `slug` trong một transaction:
  - Ghi `url, title_*, hsk_level, categories (JSON), audio_url, content (JSON), content_text`.
  - Khi trùng slug: ghi đè các cột trên và đặt `vocab_count=NULL, sentence_count=NULL` (dòng 60-76; phần này chưa commit, xem `git diff`).
  - **Không** động tới `sentence_timestamps`.
- In ra tổng số bài và số bài theo HSK.

### Bước 3: Backfill counts (trong app)
`ensureMBTable` (`src/lib/db.ts:237-269`):
- Chạy `CREATE TABLE IF NOT EXISTS`, rồi `ALTER ADD COLUMN sentence_timestamps|vocab_count|sentence_count`, rồi tạo partial index `mb_lessons_missing_counts`. Phần này chạy một lần cho mỗi connection.
- **Mọi lần** gọi một hàm MB đều chạy `backfillMBCounts` (dòng 277-288). Hàm này tìm dòng có `vocab_count IS NULL`, tính:
  - `countLessonVocab`: số hanzi khác nhau, bỏ dấu câu (dòng 480-490).
  - `countContentSentences`: số đoạn có ít nhất 1 token không phải dấu câu (dòng 492-496).
- Dòng nào vừa được import hoặc migrate đều có count NULL, nên sẽ được điền ở request đầu tiên sau đó.

### Bước 4: Vá audio (`scripts/patch-audio-urls.mjs`)
- Tham số: `--slug X` (bài X, kể cả khi đã có audio), `--limit N`. Mặc định chọn các bài có `audio_url IS NULL OR ''` (dòng 44-53).
- Fetch trang bài (delay 600 ms) và lấy `audio[src]`, `audio[data-mb-audio-src]` hoặc `audio source[src]` (dòng 33-40). Nếu tìm được thì `UPDATE mb_lessons SET audio_url`.
- Hiện DB: 729/729 bài có `audio_url`, tất cả dạng `https://traffic.libsyn.com/secure/learnchinese/<n>.mp3`. `audio_url` trong DB trùng hoàn toàn với file JSON (0 khác biệt). 5 bài thiếu audio trong JSON cũng chính là 5 bài không hợp lệ (`about`, `help`, `new-hsk-vocabulary`, `privacy-policy`, `terms-of-use`); đây là các trang phụ của site lọt vào danh sách, đều gán HSK1. Các bài này không được import, nên không có dấu hiệu `patch-audio-urls` đã sửa dòng nào trên dữ liệu hiện tại.

### Bước 5: Tách câu (`scripts/migrate-mb-split-sentences.mjs`)
- Mặc định chạy dry-run; có `--apply` thì ghi DB. Đọc mọi `slug, content, content_text`.
- `splitSegment` (dòng 43-73) duyệt token trong từng đoạn:
  - Token chứa `。` đánh dấu `pendingEnd`.
  - Token chứa `？ ！ ? !` cũng đánh dấu `pendingEnd`, nhưng chỉ khi đó là token cuối đoạn hoặc phần còn lại chỉ gồm dấu đóng (`” ’ 」 』 ） 】 ) ]`).
  - Khi đang `pendingEnd`, gặp token tiếp theo **không** phải dấu đóng thì cắt câu. Như vậy dấu đóng như `”` được giữ lại trong câu trước.
  - `？`/`！` nằm giữa đoạn **không** cắt câu. `，；：` không bao giờ cắt câu. Token gộp kiểu `。”` cắt sau chính token đó.
- `content_text` mới = nối các câu bằng `\n\n`.
- Một bài được coi là "changed" khi JSON `content` hoặc `content_text` khác giá trị cũ (dòng 93-95).
- Khi `--apply`: `UPDATE mb_lessons SET content, content_text, sentence_timestamps=NULL, vocab_count=NULL, sentence_count=NULL` trong một transaction (dòng 125-135).
- In ví dụ trước/sau của `be-late-again` và `avoid-being-late`.
- Kết quả hiện tại: tổng `json_array_length(content)` = 6629 câu (từ 3501 đoạn trong JSON).

### Bước 6–7: Căn audio
Xem `dictation-align.md`. Kết quả ghi vào `sentence_timestamps = [{index,start,end}]`, với `index` = vị trí trong `content`.

### Bước 8: Trạng thái duyệt
"Checked"/"Uncheck" có trong `mb_lessons.categories` (507/222 bài), nhưng không script nào trong repo ghi giá trị này. Xem `dictation-align.md`.

## API

Pipeline không có API. Các API đọc dữ liệu được liệt kê trong 3 tài liệu tính năng còn lại.

## Dữ liệu

| Cột `mb_lessons` | Ghi bởi | → DB v4 |
|---|---|---|
| `slug` (PK) | import | `passages.slug` |
| `url` | import | `passages.source_url` |
| `title_en`, `title_zh_simplified`, `title_zh_traditional` | import | `passages.title_en`, `title_zh`, `title_zh_trad` |
| `hsk_level` | import | `passages.hsk_level` |
| `categories` (JSON) | import; "Checked"/"Uncheck" không rõ nguồn | `passages.category` + `passages.review_status` |
| `audio_url` | import, patch-audio-urls | `passages.audio_url`, `audio_source='crawl'` |
| `content` (JSON `[[{hanzi,pinyin,hsk,definition,wordId}]]`) | import, migrate-split, UI align (đổi shape) | `passage_sentences(idx, zh, tokens[{h,p,s}])`; `wordId`+`definition` → `words.mb_word_id`, `word_senses.meaning_en`; `hsk` → `word_senses.hsk_level` |
| `content_text` | import, migrate-split | bỏ; ghép từ `passage_sentences.zh` |
| `sentence_timestamps` (JSON `[{index,start,end}]`) | align-whisper, UI align; đặt NULL bởi migrate-split | `passage_sentences.audio_start`, `audio_end` |
| `vocab_count`, `sentence_count` | `saveMBLesson`/`saveMBLessonAlignment`/`backfillMBCounts` (`db.ts`); đặt NULL bởi import và migrate-split | `passages.vocab_count`, `sentence_count` |

`saveMBLesson` (`db.ts:290-317`) có ghi count, nhưng không có ai gọi hàm này trong `src/` (đã grep). Pipeline thực tế đi qua script.

Số liệu hiện tại:
- 729 bài; HSK1 55, HSK2 137, HSK3 183, HSK4 182, HSK5 172.
- 0 dòng có `vocab_count` NULL.
- `content_text` khớp với nối `content` ở 729/729 bài.
- 0 bài có số phần tử `sentence_timestamps` lệch `sentence_count`.

## Logic chi tiết

- **Token text** (dấu câu, số, Latin) lấy từ text node và gộp nguyên cụm, ví dụ `。”`, `：“`, `A：`. Thống kê token không có pinyin: `，` 8219, `。` 5100, `：` 1438, `。”` 276, `“` 248, `：“` 229, `”` 178, `A：` 78, `AI` 50…
- **Ranh giới đoạn** của crawler là `<br>` trong `<p>`. Ranh giới câu do bước 5 tạo ra.
- **HSK của bài**: nếu một bài xuất hiện ở nhiều trang tag HSK, `crawledUrls` chỉ giữ lần crawl đầu tiên, theo thứ tự HSK1→5. `hsk_level` vẫn lấy từ tag trong chính trang bài. HSK1 trong JSON có 60 bài, trong DB có 55 bài. Đã đối chiếu: 5 bài chênh lệch chính là 5 trang phụ không hợp lệ kể trên. `SKIP_PATTERN` (dòng 124-125) không loại được các trang `about`, `help`, `privacy-policy`, `terms-of-use`, `new-hsk-vocabulary`.

## Trạng thái phía client

Không áp dụng. File tiến độ phía script là `data/crawl-progress.json`; `src/lib/lessons.ts:15` cũng đọc file này khi chưa có file JSON cuối.

## Script liên quan

| Script | Lệnh | Input | Output / bảng ghi |
|---|---|---|---|
| `scripts/crawl-mandarin-bean.mjs` | `npm run crawl` | mandarinbean.com | `data/mandarin-bean-lessons.json`, `data/crawl-progress.json` |
| `scripts/import-mandarin-bean.mjs` | `npm run import:mb [json]` | JSON | `mb_lessons` (UPSERT) |
| `scripts/patch-audio-urls.mjs` | `node … [--limit N] [--slug S]` | `mb_lessons.url` + trang web | `mb_lessons.audio_url` |
| `scripts/migrate-mb-split-sentences.mjs` | `node … [--apply]` | `mb_lessons.content` | `content`, `content_text`; NULL cho `sentence_timestamps`, `vocab_count`, `sentence_count` |
| `scripts/align-whisper.py` | `python … [--slug] [--model] [--limit] [--force] [--dry-run] [--language]` | `mb_lessons.audio_url, content` + mp3 | `mb_lessons.sentence_timestamps` |

## Vấn đề phát hiện

1. **Chạy lại import sau khi đã tách câu và căn audio sẽ làm hỏng dữ liệu** (`import-mandarin-bean.mjs:64-76`):
   - `content` bị ghi đè bằng bản chưa tách (3501 đoạn), nhưng `sentence_timestamps` vẫn giữ nguyên với `index` theo 6629 câu. Mốc sẽ trỏ sai đoạn.
   - `categories` bị ghi đè, làm mất "Checked"/"Uncheck".
   - Script không cảnh báo về việc này.
2. **Import trên DB mới hoàn toàn có thể lỗi.** `CREATE TABLE` trong script không có `vocab_count`/`sentence_count` (dòng 41-56), nhưng câu UPSERT lại `SET vocab_count=NULL, sentence_count=NULL` (dòng 74-75). Nếu bảng do chính script tạo, tức app chưa từng chạy `ensureMBTable`, thì `prepare` sẽ báo "no such column". Kết luận này rút ra từ việc đọc code; chưa chạy thử.
3. **`migrate-mb-split-sentences --apply` xóa mốc của mọi bài "changed"** (dòng 127). Nếu `content_text` lệch với `content` (UI align đổi shape có thể gây ra, xem `dictation-align.md`), bài đó sẽ bị coi là changed và mất mốc, kể cả khi việc tách câu không đổi gì.
4. **Ba bản DDL của `mb_lessons` nằm ở ba nơi** và không giống nhau: `db.ts:243-266`, `import-mandarin-bean.mjs:41-58`, `align-whisper.py:193-198`. Script nào chạy trước sẽ quyết định cấu trúc bảng.
5. **Hàm lấy audio của `patch-audio-urls` yếu hơn của crawler.** Nó không chuẩn hóa URL tương đối và không xử lý link tải kèm `source` base64 (`patch-audio-urls.mjs:33-40` so với `crawl-mandarin-bean.mjs:26-50`). Ngoài ra, khi `--slug` làm đổi `audio_url`, script không xóa `sentence_timestamps` cũ.
6. **Không có nguồn ghi "Checked"/"Uncheck"** trong repo (đã grep `scripts/`, `src/`).
7. **`/lessons` vẫn đọc file JSON thô** (`src/lib/lessons.ts`), nên dữ liệu ở đó lệch với DB. Chi tiết ở `reading.md`.
8. **Crawler bỏ qua lỗi từng bài** (dòng 291-293) mà không ghi lại để thử lại sau; muốn thử lại chỉ có cách chạy lại cả quy trình. Nếu fetch một trang index lỗi sau 3 lần, crawler hiểu là "hết trang" (dòng 116-119), nên có thể bỏ sót cả các trang sau đó.

## Ảnh hưởng khi chuyển DB v4

1. Theo `docs/db/README.md:236-251`, migration đọc `lessons.db` ở chế độ chỉ đọc và ghi sang `data/hsk.db`.
   - Phase 3 tạo `passages` (729 bài) và `passage_sentences` (6629 câu) từ `content` đã tách.
   - `audio_start/end` lấy từ `sentence_timestamps[idx]`.
   - `review_status` lấy từ `categories`.
   - `category` = phần tử đầu tiên không phải trạng thái. Có 1 bài mang 2 danh mục (`["Lifestyle","News","Checked"]`) cần chọn tay.
2. Phải viết lại các script cho schema mới:
   - **import**: ghi `passages` + `passage_sentences`. Token phải tra hoặc tạo `words` (theo `mb_word_id`) và `word_senses` (theo cặp `wordId, definition`) để lấy `s`. Việc tách câu nên làm ngay trong lúc import (gộp logic `splitSegment`), để không còn bước 5 riêng.
   - **patch-audio-urls**: `UPDATE passages SET audio_url`.
   - **align-whisper.py**: đọc và ghi `passage_sentences`. Bỏ `ensure_column`.
   - **migrate-mb-split-sentences**: không còn cần.
   - **crawl**: không đổi, vì chỉ ghi JSON.
3. Một nguồn DDL duy nhất (`schema.sql` + `schema_migrations`). Xóa các `CREATE TABLE`/`ALTER` trong script và trong `db.ts` (`DESIGN.md:37`).
4. Re-import không được ghi đè `review_status`, `audio_start/end` hay bản dịch `vi/en` đã có. UPSERT cần liệt kê rõ các cột được phép cập nhật. Khi `zh` của một câu đổi thì phải xóa mốc và bản dịch của câu đó.
5. Đếm `vocab_count`/`sentence_count` ở một chỗ duy nhất, ngay khi ghi. Bỏ `backfillMBCounts` và partial index `mb_lessons_missing_counts`.
6. Sửa bộ dấu câu dùng chung (TS + Python) trước khi tính `vocab_count`, để các token `“ ”` không bị đếm là từ.
