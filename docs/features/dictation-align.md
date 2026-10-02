# Căn chỉnh audio theo câu (Dictation Align)

> Viết dựa trên code ở working tree ngày 2026-10-01. Số liệu DB lấy từ `data/lessons.db` bằng `SELECT` chỉ đọc.

## Mục đích

Gắn mốc thời gian `start`/`end` trong file audio cho từng câu của bài Mandarin Bean. Có các mốc này thì trang chép chính tả mới phát được đúng đoạn audio gốc; câu chưa có mốc phải dùng TTS. Có hai cách căn:
1. Tự động bằng Whisper: `scripts/align-whisper.py`.
2. Chỉnh tay trên UI `/dictation/align/[slug]`. UI cũng cho phép gắn lại text, thêm câu hoặc xóa câu. Khi đó `content` được dựng lại.

## Màn hình & route

| Route | File | Loại |
|---|---|---|
| `/dictation/align` | `src/app/dictation/align/page.tsx` | Client (bọc `Suspense`), fetch API; danh sách bài kèm số câu thiếu mốc |
| `/dictation/align/[slug]` | `src/app/dictation/align/[slug]/page.tsx` | Client; trình chỉnh mốc |

Các điểm vào:
- Sidebar: `GlobalShell.tsx` có link `/dictation/align`.
- Nút "Cắt thủ công" ở header `/dictation` (`dictation/page.tsx:119-125`).
- Header `/dictation/[slug]` có link sang trang chỉnh khi bài còn câu thiếu mốc (`dictation/[slug]/page.tsx:400-408`).

## Luồng xử lý

### A. Danh sách `/dictation/align`
1. Đọc `hsk`, `unmatched`, `q`, `status` từ URL (`align/page.tsx:50-53`).
2. `GET /api/dictation/align?hsk=&status=|unmatched=1&q=` (dòng 60-70). `status` và `unmatched` loại trừ nhau: khi có `status` thì không gửi `unmatched` (dòng 64-65, 79-80).
3. API gọi `getMBAlignSummaries()` (`db.ts:498-531`), rồi **lọc trong JS** (`api/dictation/align/route.ts:13-25`):
   - `hsk`: `hsk_level === Number(hsk)`.
   - `unmatched=1`: `unmatchedCount > 0`.
   - `status=checked`: `unmatchedCount === 0`; `status=uncheck|unchecked`: `unmatchedCount > 0`.
   - `q`: `title_en.toLowerCase()`, `title_zh_simplified` hoặc `slug` chứa `q` (q đã lowercase).
4. Mỗi thẻ hiện badge **tính từ `unmatchedCount`** (`align/page.tsx:191`), kèm "x/y thiếu mốc" hoặc "y câu ✓".

### B. Chỉnh một bài `/dictation/align/[slug]`
1. Lúc mount: `GET /api/dictation/align/[slug]` (`[slug]/page.tsx:133-151`). API trả về:
   - `lesson`: meta, `content_text`, và `content` chỉ gồm `{hanzi,pinyin}`.
   - `sentences[{index,hanzi,pinyin,wordCount,start,end}]`, dựng bằng `extractSentences` + ghép timestamp theo `index` (`api/dictation/align/[slug]/route.ts:15-26`).
2. Client dựng `raw` = nối mọi `hanzi` của `content` (`flattenRawHanzi`, dòng 66-68). Hàm `locateSentenceSpans(raw, sentences)` (`dictation.ts:206-227`) tìm vị trí ký tự của từng câu trong `raw` bằng `indexOf` tuần tự, để ra `textStart`/`textEnd`. Từ đó panel "raw text" tô màu các từ theo câu (`wordCells`, dòng 379-402).
3. Người dùng nghe và đặt mốc:
   - Space: play/pause. `[` hoặc `s`: **Start** = `currentTime` (làm tròn đến ms). `]` hoặc `e`: **End**. Enter: nghe thử đoạn của câu hiện tại. ↑/↓: chuyển câu (dòng 341-377).
   - `markStart` (dòng 202-208): đặt `start` cho câu hiện tại. Nếu câu trước chưa có `end` thì đặt `end` của câu trước bằng giá trị này.
   - `markEnd` (dòng 210-221): đặt `end` cho câu hiện tại. Nếu câu sau chưa có `start` thì đặt `start` của câu sau bằng giá trị này. Sau đó chuyển sang câu kế tiếp.
   - Nhập trực tiếp ô Start/End: `parseTime` nhận dạng `m:ss.xx` hoặc số giây (dòng 52-64). Nút ±0.1s gọi `nudge` (dòng 223-229), không cho xuống dưới 0.
   - Bấm vào thanh timeline để seek (dòng 507-512). Các đoạn đã có mốc được vẽ thành khối màu (dòng 515-526).
   - Tốc độ phát: 0.75 / 1 / 1.25x.
4. Gắn lại text cho câu:
   - Bôi đen một đoạn trên panel raw text, rồi bấm "Gắn đoạn đang chọn vào câu #n", phím `a`, hoặc Alt + nhả chuột (dòng 650, 656-658, 369-371).
   - `selectionOffsets` (dòng 85-104) quy vùng chọn về offset ký tự qua `data-start`/`data-len` của từng ô từ.
   - `assignSelection` (dòng 268-288):
     - `hanzi` = `rawText.slice(start,end).trim()`.
     - `pinyin` = nối pinyin các từ giao với vùng chọn.
     - Các câu khác có vùng text chồng lấn bị xóa `textStart`/`textEnd`, nhưng **không** bị xóa `hanzi`.
   - Có thể sửa tay `hanzi`/`pinyin` của câu trong textarea (dòng 620-633).
5. Thêm câu: "+ Thêm câu" chèn một câu rỗng sau câu hiện tại, `start` = `end` của câu trước (dòng 290-305). Xóa câu: ✕ (dòng 307-312), không cho xóa câu cuối cùng.
6. Lưu: nút "Lưu DB" hoặc Ctrl/Cmd+S.
   - `PUT /api/dictation/align/[slug]` với `{sentences:[{index,hanzi,start,end}]}` (dòng 314-339). **`pinyin` không được gửi.**
   - Server xử lý ở `api/dictation/align/[slug]/route.ts:61-122`:
     1. `asTime`: số hữu hạn và ≥ 0, làm tròn đến ms. Giá trị khác thành `null` (dòng 54-59).
     2. Nếu `start` và `end` đều có và `end <= start` → 400 "Câu n: end phải lớn hơn start" (dòng 80-82).
     3. `sameShape` = số câu bằng nhau **và** `cleanHanzi(hanzi)` của từng câu khớp với câu gốc (dòng 86-89).
     4. Trường hợp `sameShape`: `timestamps[i] = {index: original[i].index, start, end}`, gọi `saveMBLessonAlignment(slug, ts)`, chỉ ghi `sentence_timestamps` (`db.ts:547-548`).
     5. Trường hợp không `sameShape`:
        - Câu có `hanzi` rỗng → 400 "Câu n chưa gắn text".
        - Ngược lại: `content = remapContentToSentences(lesson.content, hanzis)`, `timestamps[i] = {index: i, ...}`.
        - Gọi `saveMBLessonAlignment(slug, ts, content)`. Hàm này ghi `sentence_timestamps`, `content`, `vocab_count`, `sentence_count` (`db.ts:543-545`).
     6. Trả về `{ok, timestamps, contentUpdated: !sameShape}`. Client báo "Đã lưu timestamps." hoặc "Đã lưu timestamps và gắn lại text."

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/dictation/align` | query `hsk`, `unmatched=1`, `status=checked\|uncheck\|unchecked`, `q` | `{lessons: MBAlignSummary[]}` = `{slug,title_en,title_zh_simplified,hsk_level,audio_url,sentenceCount,unmatchedCount,hasTimestamps}` | `src/app/api/dictation/align/route.ts:6-28` |
| GET | `/api/dictation/align/[slug]` | path `slug` | `{lesson:{slug,title_en,title_zh_simplified,hsk_level,audio_url,content_text,content:[[{hanzi,pinyin}]]}, sentences:[{index,hanzi,pinyin,wordCount,start,end}]}` hoặc 404 | `src/app/api/dictation/align/[slug]/route.ts:7-43` |
| PUT | `/api/dictation/align/[slug]` | JSON `{sentences:[{index?,hanzi,start,end}]}` | `{ok:true,timestamps,contentUpdated}`; 400 (rỗng / end≤start / câu chưa gắn text); 404; 500 | `src/app/api/dictation/align/[slug]/route.ts:61-122` |

## Dữ liệu

| Mục đích | DB cũ | DB mới v4 |
|---|---|---|
| Danh sách | `mb_lessons.slug, title_en, title_zh_simplified, hsk_level, audio_url, sentence_count, sentence_timestamps` (`db.ts:502`) | `passages` + `COUNT(*)`, `SUM(audio_start IS NULL OR audio_end IS NULL)` trên `passage_sentences` |
| Mốc câu | `sentence_timestamps` JSON `[{index,start,end}]`, `index` = vị trí trong `content` | `passage_sentences.audio_start`, `audio_end` |
| Text câu | `content[i][]` | `passage_sentences.zh`, `tokens` |
| Trạng thái duyệt | "Checked"/"Uncheck" trong `categories` (không do tính năng này ghi) | `passages.review_status` |
| Ghi khi lưu (cùng shape) | `UPDATE mb_lessons SET sentence_timestamps` | `UPDATE passage_sentences SET audio_start, audio_end WHERE passage_id, idx` |
| Ghi khi lưu (đổi shape) | `UPDATE mb_lessons SET sentence_timestamps, content, vocab_count, sentence_count` (**không** ghi `content_text`) | Xóa rồi chèn lại `passage_sentences` của bài (`zh`, `tokens`, mốc) + cập nhật `passages.sentence_count/vocab_count/updated_at`, trong 1 transaction |
| Whisper ghi | `UPDATE mb_lessons SET sentence_timestamps` (`align-whisper.py:326-330`) | `UPDATE passage_sentences SET audio_start/audio_end` |

Hiện trạng (SELECT, 2026-10-01):
- 729/729 bài có `sentence_timestamps` và số phần tử khớp `sentence_count`. Mọi `index` khớp vị trí.
- 864/6629 câu còn thiếu mốc, nằm trong 219 bài.

## Logic chi tiết

### Whisper (`scripts/align-whisper.py`)
1. Chọn bài (`load_lessons`, dòng 214-239):
   - `--slug X`: chỉ bài X.
   - `--force`: mọi bài.
   - Mặc định: bài có `audio_url` và `sentence_timestamps` đang NULL hoặc rỗng.
   - `--limit N` cắt danh sách.
2. `extract_sentences` (dòng 40-59) mô phỏng `extractSentences` của TS. Câu được giữ nếu có ít nhất 1 token không phải dấu câu, và `index` = vị trí đoạn.
3. Tải mp3 về thư mục tạm (`download_audio`, User-Agent `hsk-web-whisper-align/1.0`). Chạy `model.transcribe(language='zh', word_timestamps=True)` với model mặc định `small` (dòng 242-258). Xóa file tạm sau khi xong.
4. `flatten_words` (dòng 62-88) lấy danh sách word kèm `start`/`end`. Nếu segment không có `words` thì dùng cả segment làm một word.
5. `match_sentences` (dòng 146-190):
   - Tạo `chars` = mọi **chữ CJK** (U+4E00–9FFF) của transcript, mỗi chữ kèm chỉ số word chứa nó. `haystack` là chuỗi nối các chữ đó.
   - Với từng câu theo thứ tự, `needle` = chỉ phần chữ CJK của câu (bỏ số, Latin, dấu câu).
   - **Khớp chính xác** `haystack.find(needle, cursor)`:
     - `start` = `start` của word chứa chữ đầu, `end` = `end` của word chứa chữ cuối.
     - Cursor nhảy qua đoạn vừa khớp.
   - Không khớp chính xác thì dùng **`greedy_overlap`** (dòng 91-143):
     - Quét trong cửa sổ `[cursor, cursor + max(2·len, len+24))`.
     - Ký tự khớp thì cả hai con trỏ tiến lên.
     - Ký tự lệch thì thử bỏ tối đa 4 ký tự phía Whisper, rồi thử bỏ tối đa 4 ký tự phía câu. Nếu cả hai đều không được thì bỏ 1 ký tự Whisper.
     - Chấp nhận khi `coverage = matched/len(needle) ≥ 0.55`.
   - Câu có `needle` rỗng (chỉ có số hoặc Latin) hoặc transcript rỗng → `null`.
6. Ghi `sentence_timestamps = json.dumps([{index,start,end}])` và commit từng bài. `--dry-run` chỉ in kết quả, nhưng vẫn in dòng "saved in …s".
7. `ensure_column` có thể `ALTER TABLE mb_lessons ADD COLUMN sentence_timestamps` (dòng 193-198).
8. Log `data/align-whisper.log`:
   - Dòng cuối: `Done. ok=664 failed=0`.
   - Cộng các dòng `matched=` được 5495/6323 câu.
   - File có thể gộp nhiều lần chạy (có 2 dòng "Loading"/"Aligning"), nên số liệu này chưa xác minh là của một lần chạy duy nhất.

### Tách câu cho việc căn
- `scripts/migrate-mb-split-sentences.mjs` tách đoạn thành câu trước khi căn (xem `mandarin-bean-pipeline.md`). Khi `--apply`, script **đặt `sentence_timestamps = NULL`** cho các bài có thay đổi (dòng 126-128). Vì vậy phải chạy Whisper lại sau đó.
- Trên UI: `remapContentToSentences` (`dictation.ts:161-204`) dựng lại `content` theo danh sách hanzi mới:
  1. Làm phẳng toàn bộ token. Với mỗi câu, cộng dần token tới khi `normHanzi(acc)` (bỏ khoảng trắng) bằng `needle`, hoặc **bắt đầu bằng** `needle`.
  2. Nếu `needle` không còn bắt đầu bằng `acc` thì dừng và coi là không khớp.
  3. Không khớp: lùi con trỏ về chỗ cũ, tạo câu gồm **1 token duy nhất** `{hanzi, pinyin:'', hsk:null, definition:null}`. Câu này mất pinyin, nghĩa và wordId.
  4. `needle` rỗng: tạo token rỗng.
  5. Token còn thừa ở cuối được nối vào câu cuối cùng.
- `cleanHanzi` dùng để so `sameShape`. Vì vậy chỉ thay đổi dấu câu (theo `PUNCT_RE`) vẫn được coi là cùng shape, và `content` không bị viết lại.

### Review status "Checked"/"Uncheck"
- **Không có code nào trong repo ghi "Checked"/"Uncheck".** Grep `scripts/` và `src/` chỉ thấy chỗ đọc: `db.ts:381,383`, các trang reading và dictation, và nhãn UI ở trang align. Crawler (`crawl-mandarin-bean.mjs:183-191`) lấy category từ link `/tag/`. File `data/mandarin-bean-lessons.json` có 0 bài chứa "Checked" hoặc "Uncheck". Giá trị này được thêm vào `mb_lessons.categories` bằng cách khác, có thể là SQL tay. **Nguồn chưa xác minh.**
- Hai nơi hiểu "trạng thái" theo hai cách khác nhau:
  - `/reading`, `/dictation`: đọc chuỗi trong `categories` (`db.ts:379-384`).
  - `/dictation/align`: **tính** từ `unmatchedCount` (`api/dictation/align/route.ts:16-17`, `align/page.tsx:191`).
- Hiện trạng DB: 507 bài "Checked" (đều 0 câu thiếu mốc), 222 bài "Uncheck" (219 bài thiếu mốc). **3 bài "Uncheck" nhưng đã đủ mốc**: `shopping-story`, `distribute-watermelon`, `climb-mountain`. Trang align hiện chúng là Checked, còn reading và dictation hiện là Uncheck.
- Lưu căn chỉnh qua UI hoặc chạy Whisper **không** cập nhật "Checked"/"Uncheck".

## Trạng thái phía client

| State | Dòng (`align/[slug]/page.tsx`) | Ghi chú |
|---|---|---|
| `lesson`, `sentences` (`AlignSentence` có `key,index,hanzi,pinyin,start,end,textStart,textEnd`) | 108-109, 7-16 | `key` = `${index}-${i}`, câu mới dùng `new-${Date.now()}` |
| `currentIndex`, `currentTime`, `duration`, `isPlaying`, `clipPlaying`, `playbackRate` | 112-120 | `currentTime` cập nhật mỗi frame bằng `requestAnimationFrame` (dòng 173-180) |
| `dirty`, `saving`, `saveMsg` | 117-119 | Nút Lưu bị disable khi `!dirty` |
| refs `audioRef`, `rawRef`, `listRef`, `stopHandlerRef`, `rafRef` | 122-126 | |

Trang danh sách: `lessons`, `loading`, `searchVal`; filter nằm trên URL. Không dùng `localStorage`. Không có cảnh báo khi rời trang mà còn thay đổi chưa lưu: không thấy `beforeunload`.

## Script liên quan

| Script | Vai trò | Ghi DB |
|---|---|---|
| `scripts/align-whisper.py` | Căn tự động | `mb_lessons.sentence_timestamps` (+ có thể ALTER) |
| `scripts/migrate-mb-split-sentences.mjs` | Tách câu | `content`, `content_text`, đặt NULL cho `sentence_timestamps`, `vocab_count`, `sentence_count` |
| `scripts/requirements-whisper.txt`, `scripts/venv/` | Môi trường Python cho Whisper | — |

## Vấn đề phát hiện

1. **Hai định nghĩa Checked/Uncheck mâu thuẫn**: chuỗi trong `categories` và `unmatchedCount`, như đã mô tả ở trên. Có 3 bài đang lệch. Không có code nào cập nhật `categories` sau khi căn xong.
2. **Pinyin sửa tay bị mất.** Payload PUT chỉ có `index,hanzi,start,end` (`align/[slug]/page.tsx:322-327`). Server lấy pinyin từ token gốc qua `remapContentToSentences`, và câu không khớp thì pinyin rỗng. Textarea Pinyin (dòng 631-633) vì thế không có tác dụng lưu.
3. **Lưu khi đổi shape không cập nhật `content_text`** (`db.ts:543-545`). `content_text` lệch với `content`, ảnh hưởng tìm kiếm của dictation (`searchContentText`) và metadata của trang đọc. Ngoài ra `migrate-mb-split-sentences.mjs` so `newContentText !== row.content_text` (dòng 93-95). Nếu chạy lại `--apply`, các bài này bị coi là "changed" và **mốc sẽ bị xóa** (dòng 127). Hiện DB chưa có bài nào lệch: đã kiểm tra 729/729 bài, `content_text` bằng nối `content`.
4. **`remapContentToSentences` dễ làm mất chú thích từ.** Chỉ khớp tiền tố liên tiếp. Nếu ranh giới câu rơi vào giữa một token, câu sau sẽ không khớp và thành 1 token trần (mất pinyin, definition, wordId). Token thừa bị dồn vào câu cuối (`dictation.ts:200-202`), nên chép chính tả câu cuối sẽ đòi gõ thêm những từ đó.
5. **Python và TS không đồng bộ bộ dấu câu.** `_WORD_PUNCT` trong `align-whisper.py:28` có `“”‘’` nhưng không có `"` `'` ASCII. `PUNCT_RE` trong TS thì ngược lại. Một câu chỉ gồm `“` sẽ bị Python bỏ nhưng TS vẫn giữ, làm lệch tập `index`. Hiện chưa xảy ra vì không có câu chỉ gồm dấu câu, nhưng comment "Keep in sync" đã sai.
6. **Whisper bỏ qua số và Latin** (`only_cjk`). Câu chỉ gồm số hoặc chữ Latin luôn không có mốc. Câu lẫn số thì ít ký tự khớp hơn.
7. **PUT không kiểm tra thứ tự hoặc chồng lấn giữa các câu**, và không kiểm tra `end ≤ duration`. Chỉ kiểm tra `end > start` trong cùng một câu (`route.ts:80-82`).
8. **`--dry-run` vẫn in "saved in"** (`align-whisper.py:331-332`). Chỉ là log gây hiểu nhầm, DB không bị ghi.
9. **Lọc danh sách align trong JS sau khi tải toàn bộ** (`route.ts:13-25`). `getMBAlignSummaries` parse JSON `sentence_timestamps` của cả 729 bài ở mỗi request.
10. **Không có cảnh báo rời trang khi `dirty`.**

## Ảnh hưởng khi chuyển DB v4

1. `getMBAlignSummaries`: thay việc parse JSON bằng `SELECT p.*, COUNT(s.idx) AS sentenceCount, SUM(s.audio_start IS NULL OR s.audio_end IS NULL) AS unmatchedCount FROM passages p LEFT JOIN passage_sentences s ... GROUP BY p.id`. Lọc `hsk`/`q`/`status` nên chuyển xuống SQL.
2. Quyết định **một** nguồn cho trạng thái:
   - `review_status` lưu trong DB (theo README v4: "Checked" → `checked`), hoặc
   - tính từ mốc.
   Nếu giữ `review_status` thì cần thêm thao tác UI hoặc quy tắc để đặt `checked`, chẳng hạn khi lưu mà `unmatchedCount = 0`, hoặc nút "Đánh dấu đã duyệt". Đồng thời trang align phải đọc cột này thay vì tự tính.
3. `GET /api/dictation/align/[slug]`: đọc `passage_sentences ORDER BY idx`. `content` cho panel raw text được dựng từ `tokens[].h/p`. `content_text` ghép từ `zh`.
4. `PUT`:
   - Cùng shape: `UPDATE passage_sentences SET audio_start=?, audio_end=? WHERE passage_id=? AND idx=?`. Ràng buộc `CHECK (audio_start < audio_end)` ở `schema.sql` trùng với kiểm tra hiện tại.
   - Đổi shape: viết lại các dòng `passage_sentences` (giữ `vi/en` nếu text không đổi, nếu không thì xóa hoặc đánh dấu cần dịch lại). `tokens` dựng lại phải giữ `s` (sense id). Cập nhật `passages.sentence_count`, `vocab_count`, `updated_at` ở **một chỗ** trong `db.ts` (`DESIGN.md:191`).
   - Có thể gửi và lưu `pinyin` vào `tokens[].p` để sửa vấn đề 2.
5. `saveMBLessonAlignment` → hàm mới nhận `passage_id`. Không còn `content_text` nên vấn đề 3 tự hết.
6. `align-whisper.py`: đổi `DB_PATH` sang `data/hsk.db`. Đọc câu từ `passage_sentences`, ghi `audio_start/audio_end` theo `idx`. Bỏ `ensure_column` (DDL chỉ nằm ở `schema.sql`, `DESIGN.md:37`). Điều kiện chọn bài mặc định đổi thành "có câu `audio_start IS NULL`".
7. `migrate-mb-split-sentences.mjs`: chỉ còn ý nghĩa với DB cũ. Phase 3 của migration đọc `content` đã tách (6629 câu).
