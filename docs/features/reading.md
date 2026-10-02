# Đọc bài khóa (Reading)

> Viết dựa trên code ở working tree ngày 2026-10-01 (branch `main`, có thay đổi chưa commit). Số liệu DB lấy từ `data/lessons.db` bằng `SELECT` chỉ đọc.

## Mục đích

Hiển thị danh sách và nội dung các bài khóa Mandarin Bean (729 bài, HSK 1–5) đã lưu trong bảng `mb_lessons`. Người học đọc theo từng từ, có pinyin, bấm vào từ để xem nghĩa và lưu ghi chú, nghe audio cả bài, chuyển sang bài trước hoặc bài sau trong cùng cấp HSK.

## Màn hình & route

| Route | File | Loại | Ghi chú |
|---|---|---|---|
| `/reading` | `src/app/reading/page.tsx` | Server Component | Danh sách bài, lọc `hsk`, `q`, `status` |
| `/reading/[slug]` | `src/app/reading/[slug]/page.tsx` → `LessonReader.tsx` | Server, render Client Component | Đọc 1 bài |
| (component) | `src/app/reading/ReadingFilters.tsx` | Client | `ReadingSearch` (ô tìm, debounce) và `ReadingFilterPills` (HSK + trạng thái) |
| (component) | `src/app/reading/ReadingBreadcrumb.tsx` | Server/Client dùng chung | Breadcrumb |
| Sidebar | `src/app/components/GlobalShell.tsx:83` | Client | Gọi `/api/reading/counts` để hiện số bài theo HSK, link `/reading?hsk=N` |

**`/lessons` và `/lessons/[slug]` KHÔNG dùng DB.** Hai trang này cũng hiển thị bài Mandarin Bean nhưng đọc thẳng file `data/mandarin-bean-lessons.json` qua `src/lib/lessons.ts:5,10-32`. Đây là bản dữ liệu thô của crawler, trước khi tách câu và trước khi gắn "Checked"/"Uncheck" (xem `mandarin-bean-pipeline.md`). Trong `src/` không có link nào trỏ tới `/lessons`, ngoài các link nội bộ của chính 2 trang này (`src/app/lessons/page.tsx:67,79,96`, `src/app/lessons/[slug]/page.tsx:62`, `src/app/lessons/[slug]/not-found.tsx:9`). Sidebar chỉ trỏ tới `/reading`. Như vậy `/lessons` là route cũ, vẫn truy cập được nếu gõ URL.

## Luồng xử lý

### A. Danh sách `/reading`
1. Người dùng mở `/reading?hsk=&q=&status=`. Server đọc `searchParams` (`src/app/reading/page.tsx:36-40`):
   - `hsk`: `Number(...)`, nếu không hữu hạn thì thành `null`. Giá trị `0` cũng thành `null`, vì phép kiểm tra `hskParam && ...` ở dòng 38.
   - `status`: `checked` → `Checked`; `uncheck` hoặc `unchecked` → `Uncheck`; giá trị khác bỏ qua (dòng 12-17).
2. Server gọi thẳng `queryMBLessons({ hsk, q, status })` (`page.tsx:44`). Không có fetch phía client.
3. `queryMBLessons` (`src/lib/db.ts:367-399`) dựng câu SQL trên `mb_lessons`, sắp xếp `ORDER BY hsk_level, slug`. Chỉ lấy các cột của thẻ (`MB_LIST_COLUMNS`, dòng 341-342), không lấy `content`.
4. Render lưới thẻ (`page.tsx:77-110`). Mỗi thẻ gồm: HSK, badge trạng thái, icon 🎧 nếu có `audio_url`, tiêu đề zh/en, tối đa 3 category (đã loại "Checked"/"Uncheck"), `vocabCount` từ.
5. Đổi bộ lọc:
   - Gõ tìm kiếm: `ReadingSearch` đợi 250 ms (`ReadingFilters.tsx:10,44-51`) rồi `router.replace(buildHref(...))`. Server render lại.
   - Bấm pill HSK hoặc trạng thái: `router.replace` ngay (`ReadingFilters.tsx:76-78`). Bấm lại pill đang chọn thì bỏ lọc (dòng 97, 118).
6. Breadcrumb chỉ hiện khi có `hsk` hoặc `q` (`page.tsx:64-70`).

### B. Đọc bài `/reading/[slug]`
1. `generateMetadata` gọi `getMBLesson(slug)` để lấy title và 150 ký tự đầu của `content_text` (`[slug]/page.tsx:5-13`).
2. Page gọi lại `getMBLesson(slug)` (dòng 19). Không thấy bài thì render khối "Không tìm thấy bài đọc" (dòng 21-26). Trang này trả HTTP 200, không gọi `notFound()`.
3. `getAdjacentMBLessons(slug, hsk_level)` (`db.ts:419-433`) lấy mọi bài cùng HSK, `ORDER BY slug`, rồi tìm vị trí để ra `prev`, `next`, `index` (đếm từ 1) và `total`.
4. Render `<LessonReader lesson prev next position>` (client).
5. Trong `LessonReader`:
   - Header có nút ‹ ›, vị trí `index/total` và link `/notes` (`LessonReader.tsx:247-260`).
   - Breadcrumb: Đọc bài khoá › HSK N › category đầu tiên (link `/reading?hsk=N&q=<category>`) › tiêu đề (dòng 218-223).
   - Audio: một thẻ `<audio controls src=audio_url>` cho cả bài (dòng 292-297).
   - Nội dung: mỗi phần tử của `content` là một `<p>`, mỗi token là một `WordToken` (dòng 323-343).
6. Bấm vào một từ:
   1. `onOpen` lật `activeWordKey` = `"${pi}-${wi}"`. Tại một thời điểm chỉ mở 1 tooltip; bấm lại thì đóng (dòng 337).
   2. Lần đầu mở một token, `WordToken` gọi `onLookup(hanzi)` (dòng 83-89). Hàm này dùng cache `lookupCache` (useRef) theo hanzi. Chưa có trong cache thì gọi `GET /api/search?q=<hanzi>` (dòng 198-212).
   3. `/api/search` → `searchVocab` (`db.ts:825-847`) quét `lessons.data.vocab` (bài HSK người dùng import, không phải `mb_lessons`). Client chọn kết quả có `zh === hanzi`, nếu không có thì lấy `results[0]` (dòng 207).
   4. Tooltip hiển thị (dòng 105-155): pinyin của token, nghĩa tiếng Việt và từ loại (nếu tra được), `definition` tiếng Anh của Mandarin Bean, badge HSK, nút "📝 Ghi chú".
7. Bấm "📝 Ghi chú" mở `NoteModal` (`src/app/components/NoteModal.tsx`). Modal gọi `/api/notes/folders` và `/api/notes/items` (`NoteModal.tsx:16,24,35`).
8. Nút "拼 Ẩn/Hiện pinyin" lật `showPinyin`. Khi ẩn, dòng pinyin phía trên mỗi từ biến mất, `lineHeight` đổi (dòng 304-317, 326).

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/reading` | query `hsk`, `q`, `status` | `{ lessons: MBLessonListItem[] }` | `src/app/api/reading/route.ts:4-15` |
| GET | `/api/reading/[slug]` | path `slug` | `{ lesson: MBLesson }` hoặc 404 `{error}` | `src/app/api/reading/[slug]/route.ts:4-9` |
| GET | `/api/reading/counts` | — | `{ total, byHsk: {1: n, ...} }` | `src/app/api/reading/counts/route.ts:4-6` |
| GET | `/api/search` | query `q` | `{ results: SearchResult[] }` (tra từ cho tooltip) | `src/app/api/search/route.ts:6-11` |

Hai trang `/reading` render trên server và gọi thẳng `db.ts`. Trong `src/` không có chỗ nào gọi `/api/reading` hoặc `/api/reading/[slug]`; chỉ có một comment nhắc tới ở `[slug]/page.tsx:18`. Chỉ `/api/reading/counts` có người gọi (GlobalShell).

## Dữ liệu

| Dùng cho | DB cũ (`mb_lessons`) | DB mới v4 |
|---|---|---|
| Khóa, link | `slug`, `url` | `passages.slug`, `passages.source_url` |
| Tiêu đề | `title_en`, `title_zh_simplified`, `title_zh_traditional` | `passages.title_en`, `title_zh`, `title_zh_trad` (+ `title_vi` mới) |
| Cấp | `hsk_level` | `passages.hsk_level` |
| Danh mục | `categories` (JSON, lẫn cả "Checked"/"Uncheck") | `passages.category` (1 giá trị) |
| Trạng thái căn audio | phần tử "Checked"/"Uncheck" trong `categories` | `passages.review_status` (`checked`/`unchecked`) |
| Audio | `audio_url` | `passages.audio_url`, `audio_source` |
| Số từ trên thẻ | `vocab_count` (cache, `COALESCE(...,0)`) | `passages.vocab_count` |
| Nội dung | `content` JSON `[[{hanzi,pinyin,hsk,definition,wordId}]]` | `passage_sentences` sắp theo `idx`; `tokens` = `[{h,p,s}]` |
| Nghĩa en / HSK của token | `content[][].definition`, `.hsk` | qua `tokens[].s` → `word_senses.meaning_en`, `word_senses.hsk_level` (hoặc `words.hsk_level`) |
| Mô tả SEO | `content_text.slice(0,150)` | ghép `passage_sentences.zh` |
| Nghĩa tiếng Việt trong tooltip | `lessons.data.vocab[]` qua `searchVocab` | `word_senses.meaning_vi` (qua `s`), không cần gọi `/api/search` |
| Đếm cho sidebar | `GROUP BY hsk_level` trên `mb_lessons` | `GROUP BY hsk_level` trên `passages` |

Trang đọc không ghi gì vào DB. `ensureMBTable` (`db.ts:237-269`) có ghi: chạy DDL/ALTER một lần mỗi connection, và `backfillMBCounts` cập nhật `vocab_count`, `sentence_count` cho những dòng đang NULL (dòng 277-288). Bước backfill chạy mỗi lần gọi bất kỳ hàm MB nào, kể cả các trang chỉ đọc.

## Logic chi tiết

**Lọc (`queryMBLessons`, `db.ts:367-399`)**
- `hsk`: `hsk_level = ?`, chỉ áp dụng khi là số hữu hạn.
- `status`: `checked` → `categories LIKE '%"Checked"%'`; `uncheck` hoặc `unchecked` → `categories LIKE '%"Uncheck"%'`. Lọc theo chuỗi trong JSON, không phải theo cột riêng.
- `q`: trim, escape `\ % _` rồi `LIKE '%q%' ESCAPE '\'` OR trên `title_en`, `title_zh_simplified`, `categories`. Thêm `content_text` khi `searchContentText` bật; reading không bật, dictation thì có. Với ASCII, `LIKE` của SQLite không phân biệt hoa thường.
- Các điều kiện nối bằng `AND`. Sắp xếp `hsk_level, slug`.

**Phân trang:** không có. `/reading` render toàn bộ kết quả, tối đa 729 thẻ, trong 1 response. GlobalShell tắt prefetch link `/reading` vì lý do này (`GlobalShell.tsx:294-296`, comment).

**Prev/next (`getAdjacentMBLessons`)**
- Chỉ trong cùng `hsk_level`, sắp theo `slug`. Thứ tự này trùng với thứ tự danh sách khi không lọc.
- Bỏ qua bộ lọc `q`/`status` mà người dùng đang dùng ở danh sách, vì URL bài đọc không mang theo filter.
- Không tìm thấy slug → `{prev:null,next:null,index:0,total}`. Ở bài đầu hoặc cuối, nút hiện trạng thái disabled "Đầu HSK N" / "Hết HSK N" (`LessonReader.tsx:354-371`).

**Badge trạng thái:** `getAlignmentStatus` ưu tiên `Uncheck` nếu `categories` chứa cả hai (`page.tsx:6-10`, `LessonReader.tsx:34-38`). Category hiển thị đã lọc bỏ "Checked"/"Uncheck".

**Dấu câu trong bài đọc:** `isPunct` (`LessonReader.tsx:59-60`) coi token là dấu câu nếu rỗng hoặc chỉ gồm các ký tự `，。！？、：；""''「」【】（）…—-·`. Token dấu câu render thành `<span>` thường, không bấm được.

**Số từ vựng:** trên thẻ danh sách lấy từ cột `vocab_count`. Trong trang đọc thì tính lại phía client bằng `useMemo` (`LessonReader.tsx:225-228`): số hanzi khác nhau, sau khi bỏ token dấu câu.

**Audio:** chỉ phát cả bài qua `<audio controls>`. **Trang đọc không phát audio theo câu.** `getMBLesson` có trả `sentence_timestamps` (`db.ts:323-335`), nhưng `LessonReader` không dùng: kiểu `MBLesson` ở `LessonReader.tsx:12-19` không có trường này, và `audioRef` (dòng 195) chỉ được gắn vào thẻ audio, không dùng cho việc khác.

## Trạng thái phía client

| State | Vị trí | Ý nghĩa |
|---|---|---|
| `value`, `lastQ` | `ReadingFilters.tsx:32,35` | Nội dung ô tìm; đồng bộ lại khi URL đổi (nút back, bấm pill) |
| `showPinyin` | `LessonReader.tsx:192` | Mặc định `true`; không lưu |
| `activeWordKey` | `LessonReader.tsx:193` | Token đang mở tooltip |
| `noteWord` | `LessonReader.tsx:194` | Từ đang mở NoteModal |
| `lookupCache` (useRef) | `LessonReader.tsx:196` | Cache kết quả `/api/search` theo hanzi, mất khi rời trang |
| `vnResult` | `LessonReader.tsx:72` | Trạng thái tra từng token: `'none' \| 'loading' \| kết quả \| null` |

Không dùng `localStorage`/`sessionStorage` (đã grep `src/app/reading`). Filter nằm hoàn toàn trên URL.

## Script liên quan

Không có script riêng cho trang đọc. Dữ liệu đến từ pipeline trong `mandarin-bean-pipeline.md`. Trạng thái "Checked"/"Uncheck" được mô tả ở `dictation-align.md`.

## Vấn đề phát hiện

1. **Dấu ngoặc kép cong không được coi là dấu câu.** Regex `isPunct` (`LessonReader.tsx:60`), `MB_WORD_PUNCT` (`db.ts:478`) và regex trong `countContentSentences` (`db.ts:494`) chứa `"` (U+0022) và `'` (U+0027) dạng ASCII, không chứa `“ ” ‘ ’`. Đã kiểm tra từng byte. Dữ liệu có 248 token `“`, 178 token `”`, 276 token `。”`… (đếm token không có pinyin trong `mb_lessons.content`). Hậu quả:
   - Token chỉ gồm `“` hoặc `”` bị render thành từ bấm được, mở tooltip rỗng và gọi `/api/search`.
   - `vocab_count` đếm cả các token này là "từ vựng".
2. **Tooltip có thể hiện sai nghĩa.** `searchVocab` so khớp bằng `v.zh.includes(query)` (`db.ts:836`). Nếu không có kết quả trùng chính xác, client lấy `results[0]` (`LessonReader.tsx:207`). Ví dụ bấm `会` có thể nhận nghĩa của `机会`. Nghĩa tiếng Việt cũng chỉ có khi từ đó nằm trong bài HSK đã import vào bảng `lessons`.
3. **Gửi dữ liệu thừa xuống client.** Page truyền nguyên object `lesson` (có `sentence_timestamps`, `content_text`, `url`, `definition` của mọi token) vào Client Component (`[slug]/page.tsx:30-35`), trong khi `LessonReader` không dùng `sentence_timestamps` và `content_text`.
4. **Gọi `getMBLesson` 2 lần mỗi request**: một lần trong `generateMetadata`, một lần trong page (`[slug]/page.tsx:7,19`). Mỗi lần parse JSON `content`, khoảng 17 KB mỗi bài theo comment ở `db.ts:265`.
5. **Không trả 404 thật khi không tìm thấy bài.** Trang render khối thông báo với status 200 (`[slug]/page.tsx:21-26`), không dùng `notFound()`.
6. **Lọc "status" bằng `LIKE` trên JSON**, và `q` cũng tìm trong `categories` (`db.ts:381-389`). Hệ quả: tìm `q=check` sẽ khớp mọi bài có "Checked" hoặc "Uncheck".
7. **Không phân trang**: một trang có thể render 729 thẻ (`page.tsx:77-110`).
8. **Code thừa:**
   - `/api/reading` và `/api/reading/[slug]` không có ai gọi.
   - `getMBLessonsByHsk`, `getAllMBLessons`, `getMBLessonCount` (`db.ts:401,435,460`) không có ai gọi trong `src/` (đã grep).
   - Hàm `getAlignmentStatus`, `isAlignmentStatus`, `AlignmentStatusBadge` bị copy ở `reading/page.tsx`, `LessonReader.tsx`, `dictation/page.tsx`, `dictation/[slug]/page.tsx`. `LEVEL_COLOR` cũng bị copy ở nhiều file.
9. **`/lessons` là route trùng chức năng, đọc file JSON thô** (`src/lib/lessons.ts`). File này có 734 bài, chưa tách câu, còn DB có 729 bài đã tách. Ngoài ra `getLessonsByHsk` (`lessons.ts:46-48`) không lọc `isValidLesson` như `getAllLessons`, nên khi lọc theo HSK có thể hiện bài thiếu `title_en` hoặc thiếu content.
10. **Prev/next bỏ qua filter đang dùng** (`db.ts:422-424`). Đây là hành vi đã xác minh; chưa rõ có phải ý đồ thiết kế hay không.

## Ảnh hưởng khi chuyển DB v4

1. `queryMBLessons`:
   - `FROM mb_lessons` → `FROM passages`.
   - `status` → `review_status = 'checked' | 'unchecked'`, dùng được index `passages_list(hsk_level, review_status, category)`. Bỏ `LIKE` trên JSON.
   - `q` tìm trên `title_en`, `title_zh`, `category` (+ `title_vi`). Nếu cần tìm trong nội dung thì dùng `passage_sentences.zh`, vì không còn `content_text`.
   - `vocabCount` lấy từ `passages.vocab_count`. Bỏ `categories.filter(!isAlignmentStatus)` ở UI.
2. `getMBLesson`:
   - Đổi sang `passages` JOIN `passage_sentences ORDER BY idx`.
   - Muốn giữ kiểu trả về `content: Word[][]` (kế hoạch Phase 7 ở `docs/db/README.md`, mục 4) thì phải dựng lại `{hanzi,pinyin,hsk,definition}` từ `tokens{h,p,s}` JOIN `word_senses` (lấy `meaning_en`, `hsk_level`) và `words`.
   - `content_text` (dùng cho metadata) ghép từ `zh`.
3. `getAdjacentMBLessons`: chỉ đổi tên bảng/cột (`passages`, `title_zh`).
4. `getMBLessonCounts`: đổi sang `passages`.
5. `LessonReader`:
   - Có thể bỏ việc gọi `/api/search` vì `tokens[].s` đã trỏ đúng nghĩa (`meaning_vi`/`meaning_en`).
   - Nếu muốn phát audio theo câu thì dùng `audio_start`/`audio_end` của từng dòng.
   - Badge lấy từ `review_status`.
6. Thứ tự sắp xếp: hiện tại là `hsk_level, slug`. Nếu muốn giữ đúng thứ tự cũ thì không sắp theo `passages.id`.
7. Bỏ `ensureMBTable`/`backfillMBCounts`. Theo `DESIGN.md:37`, `db.ts` không tự tạo bảng nữa, và `vocab_count`/`sentence_count` chỉ được ghi ở một chỗ.
8. Quyết định giữ hay xóa `/lessons` cùng `src/lib/lessons.ts`. Route này không phụ thuộc DB nên không tự hỏng, nhưng sẽ lệch dữ liệu với `/reading`.
