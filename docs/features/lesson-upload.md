# Tạo bài học từ file (upload `.docx` / `.xlsx`)

## Mục đích

Người dùng tải file lên trang chủ để tạo "bài" trong bảng `lessons`:
- `.xlsx` / `.xls`: đọc trực tiếp bảng từ vựng HSK, mỗi sheet thành một bài. Không gọi AI.
- `.docx`: trích text, tách phần TỪ VỰNG / NGỮ PHÁP, gửi Claude để sinh vocab (kèm bộ thủ, ví dụ) và ngữ pháp (kèm bài tập, so sánh).

Dữ liệu hiện có: 6 bài HSK1–HSK6 từ Excel (5.002 từ) và 6 bài từ docx (65 từ, 10 điểm ngữ pháp, 27 bài tập).

## Màn hình & route

| Route | File | Ghi chú |
|---|---|---|
| `/` (trang chủ) | `src/app/page.tsx:89-99, 136-140` | Nút "+ Import bài học" và nút ở trạng thái rỗng, `accept=".docx,.xlsx,.xls"` |
| `POST /api/upload` | `src/app/api/upload/route.ts` | `runtime = 'nodejs'`, `maxDuration = 120` |

Không có trang chỉnh sửa / duyệt bài sau khi upload. Xoá bài bằng nút × trên thẻ bài ở trang chủ (`src/app/page.tsx:54-58, 254-262`).

## Luồng xử lý

1. Người dùng chọn file → `handleUpload` (`src/app/page.tsx:34-52`): hiện thông báo tiến trình, gửi `FormData{file}` tới `POST /api/upload`.
2. API kiểm tra có file và đuôi `.docx` / `.xlsx` / `.xls` (so sánh phân biệt hoa thường, `route.ts:17-21`).
3. **Nhánh Excel** (`route.ts:26-35`):
   1. `parseHskXlsx(buffer)` (`src/lib/parse-docx.ts:63-95`) → mảng bài nháp, mỗi sheet có ≥ 1 từ thành một bài.
   2. Mỗi bài: `id = nanoid(12)`, `createdAt` = cùng một timestamp → `saveLesson` (`db.ts:64-70`, `INSERT OR REPLACE`).
   3. Trả `{lessons}`.
4. **Nhánh docx** (`route.ts:38-46`):
   1. `extractSegmentsFromDocx` (`parse-docx.ts:18-41`) dùng `mammoth.extractRawText` → `{full, vocab, grammar}`.
   2. `full` < 50 ký tự → 400.
   3. `analyzeLesson(segments, tên file bỏ .docx)` (`src/lib/claude.ts:101-134`) gọi Claude, parse JSON.
   4. Gán `id = nanoid(12)`, `createdAt` → `saveLesson` → trả `{lesson}`.
5. Lỗi bất kỳ → 500 `"Phân tích thất bại. Kiểm tra ANTHROPIC_API_KEY."` (`route.ts:47-50`).
6. Client thành công → `fetchLessons()` lại danh sách trang chủ. Sidebar **không** được làm mới (xem Vấn đề).

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| POST | `/api/upload` | `multipart/form-data`, field `file` | xlsx: `{lessons: Lesson[]}`; docx: `{lesson: Lesson}`; lỗi: `{error}` 400/500 | `src/app/api/upload/route.ts` |
| DELETE | `/api/lessons/[id]` | `id` | `{ok:true}` | `src/app/api/lessons/[id]/route.ts:13-17` |

Gọi ngoài: Anthropic Messages API (`client.messages.create`), key từ `process.env.ANTHROPIC_API_KEY` (`claude.ts:6`).

## Dữ liệu

Ghi: một dòng `lessons(id, title, subtitle, level, topic, created_at, data)`, `data` = toàn bộ object `Lesson` dạng JSON (`db.ts:64-70`). `topic` luôn `NULL` vì cả hai nhánh không đặt `topic`.

| Trường sinh ra | DB cũ | DB mới v4 |
|---|---|---|
| `title`, `subtitle`, `level` | `lessons.*` | Không có bảng `lessons`. `level` → `words.hsk_level` / `word_senses.hsk_level` / `grammar_points.hsk_level`; tiêu đề bài chủ đề → `words.topic` |
| `vocab[].zh, py` | `lessons.data` | `words.hanzi`, `words.pinyin` (+ `pinyin_plain`, `word_characters`) |
| `vocab[].pos, vn` | `lessons.data` | `word_senses.pos` (mã), `meaning_vi`, `source='ai'` hoặc `'import'` |
| `vocab[].ex` | `lessons.data` | `sense_examples(zh, vi)` |
| `vocab[].botu` | `lessons.data` (rồi được copy sang `kanji.botu_claude` khi server khởi động) | `character_components(source='ai')` |
| `grammar[]` (title, titleVn, formula, explanation, comparisons) | `lessons.data` | `grammar_points(source='ai')` |
| `grammar[].examples[]` | `lessons.data` | `grammar_examples` |
| `grammar[].exercises[]` | `lessons.data` | `grammar_exercises(type, question, blank, options, answer, explanation)` |

Kiểu dữ liệu ở `src/types/index.ts:1-60`. (`src/types/lesson.ts` là kiểu của bài Mandarin Bean, không dùng ở đây.)

## Logic chi tiết

### Excel (`parseHskXlsx`, `parse-docx.ts:58-95`)
- Cột mong đợi: `STT | Từ mới | Phiên âm | Giải thích | Ví dụ (chữ hán) | Phiên âm | Dịch` (`parse-docx.ts:58`).
- Dòng hợp lệ: ≥ 4 ô và ô đầu là **số** > 0 (`isHskRow`). Dòng tiêu đề / STT dạng chuỗi bị bỏ.
- Mỗi dòng → `VocabCard{id: nanoid(10), zh=col1, py=col2, pos: '', vn=col3, botu: [], ex: {zh=col4, vn=col6}}`. Cột 5 (pinyin ví dụ) bị bỏ. `zh` rỗng thì bỏ.
- Mỗi sheet thành 1 bài: `title = level = tên sheet`, `subtitle = "<n> từ vựng <tên sheet>"`, `grammar: []`.
- Không kiểm trùng: upload lại cùng file tạo thêm bài mới (id mới).
- **`pos` để trống và `botu` rỗng** → `pos` được điền sau bằng script (xem dưới).

### docx: tách phần (`extractSegmentsFromDocx`, `parse-docx.ts:18-41`)
- Tiêu đề phần phải có số hoặc số La Mã đứng đầu: `/^\s*(?:[IVXLCDM]+|\d+)[.\s]+\s*(TỪ\s*VỰNG|TỪ\s*MỚI|VOCABULARY|词汇|词语)\s*$/i`; ngữ pháp: `NGỮ\s*PHÁP|GRAMMAR|语法|语言点`.
- Lấy dòng khớp **đầu tiên** cho mỗi loại. Phần từ vựng = sau tiêu đề TỪ VỰNG tới tiêu đề NGỮ PHÁP (hoặc hết file); phần ngữ pháp = sau tiêu đề NGỮ PHÁP tới hết file.
- Không tìm thấy tiêu đề từ vựng → `vocab = full` (cả file). Không tìm thấy ngữ pháp → `grammar = ''`.
- Nếu tiêu đề NGỮ PHÁP đứng **trước** TỪ VỰNG thì `slice(vocabStart+1, grammarStart)` cho rỗng → `vocab = full`.

### docx: prompt Claude (`src/lib/claude.ts`)
- Model `claude-sonnet-4-6`, `max_tokens: 8192`, không đặt temperature, 1 lượt, không dùng tool / structured output (`claude.ts:110-115`).
- System prompt (`claude.ts:8-16`): vai trò trợ lý phân tích tài liệu HSK; vocab chỉ lấy từ phần TỪ VỰNG, grammar chỉ lấy từ phần NGỮ PHÁP; quy ước bộ thủ `y` = ý, `am` = âm (thanh bàng), `solo` = độc thể; tên bộ thủ viết theo âm Hán Việt.
- User prompt (`claude.ts:18-99`): gửi `=== PHẦN TỪ VỰNG ===` và `=== PHẦN NGỮ PHÁP ===`, kèm một **JSON mẫu** làm schema và yêu cầu "Chỉ trả về JSON". Nhánh `=== NỘI DUNG ĐẦY ĐỦ ===` chỉ chạy khi cả `vocab` và `grammar` rỗng; vì `vocab` luôn có giá trị (fallback `full`) nên **nhánh này không bao giờ chạy từ upload**.
- Schema đầu ra mong đợi:
  - `title`, `subtitle`, `level` (mẫu `"HSK2"`).
  - `vocab[]`: `zh, py, pos, vn, botu[{char, parts[{t, ph, n}]}], ex{zh, vn}`. Ví dụ mẫu dùng `"pos": "Danh từ"`; prompt **không** đưa danh sách từ loại hợp lệ.
  - `grammar[]`: `title, titleVn, formula, explanation, examples[{zh, vn, note}], exercises[]` (type `fill` có `blank`, type `choice` có `options`, cả hai có `answer`, `explanation`), `comparisons[]` (`wordA/B, pinyinA/B, meaningA/B, tip, exA, exB`).
- Hậu xử lý (`claude.ts:117-133`): lấy `message.content[0].text`, `JSON.parse` trực tiếp (không bóc code fence, không validate). Gán `id = nanoid()` (10 ký tự) cho mỗi vocab, grammar, exercise. Fallback: `title = tên file`, `subtitle = ''`, `level = 'HSK'`.
- **Bộ thủ, ví dụ, bài tập, so sánh đều do Claude tự sinh** trong cùng một lời gọi, không đối chiếu dữ liệu Hanzii.
- Kết quả thực tế: `pos` của 65 từ docx dùng 16 nhãn khác nhau, có nhãn gộp ("Động từ / Danh từ", "Giới từ / Liên từ", "Danh từ / Lượng từ", "Tính từ / Phó từ") và nhãn không phải từ loại ("Bổ ngữ kết quả", "Từ để hỏi").

### Bộ thủ sau upload
- `botu` chỉ nằm trong `lessons.data.vocab[]`. Khi tiến trình server mở DB lần đầu, `backfillKanjiBotuClaude` copy từng khối `{char, parts}` sang `kanji.botu_claude` nếu cột đó đang rỗng (`db.ts:101-140`). Chạy **một lần mỗi tiến trình** (`_claudeBotuBackfilled`).
- `updateKanjiBotu` (`db.ts:194-202`) không được gọi ở đâu.

### Điền từ loại (scripts)
Xem mục Script liên quan.

## Trạng thái phía client

`src/app/page.tsx:20-24`: `lessons`, `uploading`, `progress` (chuỗi trạng thái), `error`, `fileRef` (reset input sau upload). Không có localStorage. Không có progress thật: chỉ một request chờ tới khi xong (ghi chú "30–60 giây cho .docx", `page.tsx:119`).

## Script liên quan

### `scripts/fill-pos-local.mjs` (luật, không gọi API)
- Chạy: `node scripts/fill-pos-local.mjs [--dry-run]`. Ghi thẳng `data/lessons.db` (`UPDATE lessons SET data`, `:291-293`).
- Chỉ xử lý vocab có `pos` rỗng.
- `classifyPos(zh, py, vn)` (`:17-263`) dựa trên **nghĩa tiếng Việt `vn`** (chữ thường) theo thứ tự ưu tiên: Thán từ → Trợ từ → Số từ → Đại từ → Liên từ → Giới từ → Lượng từ → Phó từ → Cụm từ → Danh từ riêng (danh sách tên riêng, hoặc pinyin viết hoa) → Tính từ (danh sách + regex tiền tố) → Động từ (danh sách tiền tố; hoặc `zh` là 1 chữ trong danh sách `singleCharVerbs`) → **mặc định `'Danh từ'`** (`:260-262`, chú thích "Anything not caught above → Danh từ").
- Đã xác minh bằng cách chạy lại `classifyPos` (bản sao, không ghi DB) trên 5.002 từ của 6 bài HSK: **kết quả trùng 5.002/5.002** với `pos` trong DB → `pos` của các bài HSK do script này sinh ra.
- **Toàn bộ 3.499 từ HSK mang nhãn "Danh từ" đều rơi vào nhánh mặc định**, không từ nào được luật nào xác định là danh từ. Đây là nguồn của con số 69% (3.516/5.067; 17 từ còn lại là từ bài docx).
- Ví dụ sai do mặc định: 位于 "nằm ở (vị trí địa lý)" → Danh từ; 使 "khiến, làm cho" → Danh từ.
- Rủi ro khác trong luật: `singleCharVerbs` chứa nhiều chữ không phải động từ (很, 太, 最, 不, 在, 把, 被, 从, 也, 都…, `:250-257`) nhưng luật Phó từ / Giới từ phía trên thường bắt trước; "năm" được xếp Số từ trước Lượng từ; nhiều mục trong `phraseExact` thực ra là động từ (ngủ, hát, bơi).

### `scripts/fill-pos.mjs` (gọi Claude)
- Chạy: `node scripts/fill-pos.mjs [--dry-run] [--batch=50]`. Đọc `ANTHROPIC_API_KEY` từ env hoặc `.env.local`.
- Gom vocab `pos` rỗng, gửi theo lô 50 tới `claude-haiku-4-5-20251001` (`max_tokens 1024`), yêu cầu trả mảng JSON nhãn trong 13 nhãn `POS_LIST` (`:34-48`). Lô lỗi (sai độ dài, không có mảng) bị bỏ qua.
- **Không có mặc định "Danh từ"**. Vì kết quả trong DB khớp 100% với script local, script này nhiều khả năng chưa được chạy cho dữ liệu hiện có (hoặc chạy sau khi đã không còn từ thiếu `pos`). Không còn từ nào thiếu `pos`, nên chạy lại cũng không làm gì.
- Ghi chú: hướng dẫn `--batch 50` ở dòng 4 không khớp cách parse `--batch=` ở dòng 31.

## Vấn đề phát hiện

1. **Từ loại mặc định "Danh từ"** trong `fill-pos-local.mjs:262` → 3.499 từ HSK bị gán "Danh từ" không qua kiểm tra nào (đã xác minh ở trên).
2. **Prompt docx không giới hạn nhãn từ loại** và ví dụ mẫu là `"Danh từ"` (`claude.ts:46`) → nhãn tự do, có ô gộp 2 từ loại.
3. **Không bóc code fence / không validate JSON** (`claude.ts:117-118`): Claude trả ```` ```json ```` hoặc bị cắt ở `max_tokens: 8192` → `JSON.parse` lỗi → 500 với thông báo sai lệch "Kiểm tra ANTHROPIC_API_KEY" (`route.ts:49`). Thông báo này cũng hiện cho lỗi Excel.
4. Đuôi file so sánh phân biệt hoa thường (`route.ts:17-18`): `BAI1.DOCX` bị từ chối. Client chọn câu thông báo tiến trình cũng phân biệt hoa thường (`page.tsx:36`).
5. Excel: `pos: ''`, `botu: []`, không đọc pinyin ví dụ (cột 5); không chống upload trùng.
6. docx: nếu tiêu đề NGỮ PHÁP đứng trước TỪ VỰNG thì phần từ vựng = cả file, prompt nhận cả ngữ pháp trong mục TỪ VỰNG.
7. **Bộ thủ mới upload chỉ vào `kanji.botu_claude` sau khi restart server**: backfill chạy 1 lần/tiến trình (`db.ts:105-107`), `updateKanjiBotu` là code chết (`db.ts:194-202`).
8. Sidebar (`GlobalShell.tsx:80-89`) chỉ tải `/api/lessons` một lần khi mount → bài vừa upload / vừa xoá không xuất hiện / không mất khỏi sidebar cho tới khi tải lại trang.
9. Code chết: `extractTextFromDocx`, `extractTextFromXlsx` (`parse-docx.ts:6-9, 43-56`) không được gọi. Nhánh `NỘI DUNG ĐẦY ĐỦ` trong `buildPrompt` không đạt được từ upload.
10. Không có giới hạn kích thước file hay xác thực người dùng cho `POST /api/upload` và `DELETE /api/lessons/[id]`.
11. `analyzeLesson` giả định `message.content[0]` là text (`claude.ts:117`), không kiểm `stop_reason`.

## Ảnh hưởng khi chuyển DB v4

1. `saveLesson` không còn đích ghi. Upload phải tách object thành: `words` (+ `word_characters`, cập nhật `words_fts`), `word_senses`, `sense_examples`, `character_components`, `grammar_points`, `grammar_examples`, `grammar_exercises`.
2. Phải **chuẩn hoá trước khi ghi**: pinyin dạng từ điển, `pos` → mã trong `parts_of_speech` (ô gộp tách thành 2 sense), `level` "HSK2" → số. Nên đổi prompt để Claude trả mã từ loại cố định thay vì text tự do.
3. Gộp với từ đã có theo `UNIQUE(hanzi, pinyin)`: upload trùng không còn tạo bản sao mà thêm/sửa sense; cần quy tắc khi nghĩa mới khác nghĩa cũ.
4. Bộ thủ: ghi trực tiếp `character_components(source='ai')` cho chữ chưa có phân tích; `component` có FK tới `characters` → chữ thành phần chưa có phải thêm dòng `crawl_status='pending'`. Bỏ cơ chế backfill lúc khởi động.
5. "Bài" từ docx (tiêu đề) chỉ còn lưu được qua `words.topic` (1 chủ đề / từ) và không nhóm được grammar (trừ khi thêm `grammar_points.topic`).
6. `fill-pos-local.mjs` / `fill-pos.mjs` đọc/ghi `lessons.data` → viết lại trên `word_senses.pos`; Phase 7 (soát từ loại) nên nhắm vào các sense đang là `n` có nguồn `import`.
7. `DELETE /api/lessons/[id]` không còn ý nghĩa; cần quyết định xoá theo topic hay bỏ tính năng.
