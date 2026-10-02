# Ngữ pháp

> Tài liệu mô tả code hiện tại (đọc ngày 2026-10-01). Số liệu đo bằng truy vấn chỉ đọc trên `data/lessons.db`.

## Mục đích

Có hai nguồn ngữ pháp, hai màn hình riêng và hai format dữ liệu khác nhau:

1. **Ngữ pháp Hanzii theo cấp HSK.** 1.734 điểm, crawl từ API Hanzii vào bảng `hanzii_grammar`. Chỉ đọc, không có bài tập.
2. **Ngữ pháp trong bài học.** Claude trích xuất từ file `.docx` khi upload, lưu trong `lessons.data.grammar[]` (JSON). Có thêm bài tập (`exercises`) và so sánh từ dễ nhầm (`comparisons`). Hiện có 10 điểm trong 6 bài.

## Màn hình & route

| Route | File | Nguồn dữ liệu | Vào từ đâu |
|---|---|---|---|
| `/grammar/hsk/[level]` (level = `HSK1`..`HSK6`, `HSK7-9`, `Khác`) | `src/app/grammar/hsk/[level]/page.tsx` | `GET /api/grammar?level=` → `hanzii_grammar` | Sidebar, mục "Ngữ pháp": `src/app/components/GlobalShell.tsx:332-348`. Chỉ hiện những cấp có số điểm > 0 (`:336`) |
| `/grammar/[id]` (id = `lessons.id`) | `src/app/grammar/[id]/page.tsx` | `GET /api/lessons/[id]` → `lessons.data.grammar[]` | Nút trên card bài học ở trang chủ (`src/app/page.tsx:243`), link "Ngữ pháp" ở header trang bài học (`src/app/lesson/[id]/page.tsx:433`) |

Trang bài học `/lesson/[id]` **không** hiển thị nội dung ngữ pháp. Nó chỉ hiện số điểm (`src/app/lesson/[id]/page.tsx:421`) và link sang `/grammar/[id]`. Trang chủ cũng chỉ hiện `grammarCount` (`src/app/page.tsx:214`).

`src/app/api/generate-grammar/` là **thư mục rỗng**: không có file, không có trong git (`git ls-files` trả 0, `git log --all` không có lịch sử).

## Luồng xử lý

### A. Ngữ pháp Hanzii theo HSK

1. Khi app mount, `GlobalShell` gọi `GET /api/grammar` (không có `level`), nhận `{counts:[{hsk,count}]}` và dựng menu cấp độ (`GlobalShell.tsx:84-88`).
2. Người dùng bấm một cấp → `/grammar/hsk/HSK2`.
3. Trang gọi `GET /api/grammar?level=HSK2` (`grammar/hsk/[level]/page.tsx:76-81`).
4. API (`src/app/api/grammar/route.ts:6-14`) gọi `getHanziiGrammarByHsk(level)` (`src/lib/db.ts:782-789`):
   `SELECT id, uid, title, use_for, keywords, level, hsk, contents, examples FROM hanzii_grammar WHERE hsk = ? ORDER BY id ASC`.
5. Mỗi dòng đi qua `rowToHanziiGrammar` (`db.ts:751-780`). Hàm này parse JSON `contents`, tách ví dụ bằng regex, ghép phần giải thích và chọn công thức. Việc này chạy **ở mỗi request**.
6. Client nhận toàn bộ điểm của cấp đó (tối đa 297 điểm, HSK5). Lọc tìm kiếm và phân trang 12 điểm/trang đều làm ở client.

### B. Ngữ pháp trong bài học

1. Upload `.docx` → `POST /api/upload` (`src/app/api/upload/route.ts:38-46`) → `analyzeLesson` (`src/lib/claude.ts:101-134`). Claude trả JSON theo schema trong prompt (`claude.ts:60-95`). Code gán `id = nanoid()` cho mỗi grammar point và mỗi exercise (`claude.ts:121-125`), rồi `saveLesson` ghi cả bài vào `lessons.data`.
   Upload `.xlsx` không qua Claude và không sinh grammar (`upload/route.ts:26-35`).
2. Người dùng mở `/grammar/[id]` → `fetch('/api/lessons/${id}')` (`grammar/[id]/page.tsx:136-138`) → `getLesson(id)` (`db.ts:45-62`).
3. Client hiển thị `lesson.grammar[]`: công thức, giải thích, ví dụ, so sánh (`ComparisonCard`, `:60-77`), bài tập (`ExerciseItem`, `:7-58`).
4. Kết quả làm bài tập chỉ nằm trong state của component. Không gửi lên server, không lưu.

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/grammar` | không có `level` | `{ counts: {hsk, count}[] }` | `src/app/api/grammar/route.ts:8-11` |
| GET | `/api/grammar?level=HSK2` | `level` (trim) | `{ items: HanziiGrammar[] }`. Cấp không tồn tại thì trả `[]` | `src/app/api/grammar/route.ts:12-13` |
| GET | `/api/lessons/[id]` | `id` | `{ lesson }` (gồm cả `grammar[]`), hoặc 404 `{error}` | `src/app/api/lessons/[id]/route.ts:6-11` (dùng `getLesson`) |
| POST | `/api/upload` | `multipart file` .docx/.xlsx | `{ lesson }` / `{ lessons }` | `src/app/api/upload/route.ts` |
| — | `/api/generate-grammar` | — | Không có route (thư mục rỗng) | — |

Kiểu `HanziiGrammar`: `src/types/index.ts:62-73`. Kiểu `GrammarPoint` / `Exercise` / `Comparison`: `src/types/index.ts:22-49`.

## Dữ liệu

| Dùng cho | DB cũ (đọc) | DB v4 (`docs/db/schema.sql`) |
|---|---|---|
| Danh sách theo cấp | `hanzii_grammar.hsk` (`HSK1`..`HSK6`, `HSK7-9`, `Khác`) | `grammar_points.hsk_level` 1..7. `Khác` → `hsk_level NULL` + `category` ('Li hợp' / 'Dịch') |
| Đếm theo cấp | `SELECT hsk, COUNT(*) … GROUP BY hsk` | `GROUP BY hsk_level` (và `category` cho nhóm "Khác") |
| Tiêu đề | `keywords \|\| title` | `grammar_points.title` |
| Tiêu đề tiếng Việt | `title` | `grammar_points.title_vi` |
| Công thức | `keywords \|\| dòng "cấu trúc:" \|\| use_for` (tính lúc đọc) | `grammar_points.formula` (tính một lần lúc migrate) |
| Giải thích | `contents` bỏ các dòng bị coi là ví dụ (tính lúc đọc) | `grammar_points.explanation` |
| Ví dụ | regex trên `contents`, fallback cột `examples` | `grammar_examples(zh, pinyin, vi, note)` |
| `use_for`, `keywords`, `level` | các cột cùng tên | `use_for`, `keywords`, `cefr` (A1..C2) / `category` |
| Ngữ pháp bài học | `lessons.data.grammar[]` (`title, titleVn, formula, explanation, examples[], exercises[], comparisons[]`) | `grammar_points` với `source='ai'`, `grammar_examples`, `grammar_exercises`, `grammar_points.comparisons` (JSON) |
| Bài tập | `lessons.data.grammar[].exercises[]` (id nanoid) | `grammar_exercises` (id INTEGER, `options` JSON) |

Phân bố hiện tại của `hanzii_grammar` (hsk / level / số dòng): HSK1/A1/96, HSK2/A2/109, HSK3/B1/112, HSK4/B2/177, HSK5/C1/297, HSK6/C2/251, HSK7-9/高等/255, Khác/Dịch/143, Khác/Li hợp/294.

Ghi chú về bảng: cả `db.ts` (`ensureHanziiGrammarTable`, `:697-714`) và script crawl đều `CREATE TABLE IF NOT EXISTS`. Script tạo thêm index `hanzii_grammar_level`, `db.ts` thì không.

## Logic chi tiết

### Parse ví dụ — `parseHanziiExamples` (`db.ts:716-749`)

Đầu vào là mảng dòng `contents`. Mỗi dòng được `trim()` rồi xét theo thứ tự:

1. **Mở vùng ví dụ.** Dòng khớp `/^ví dụ\s*[:：.]?/i` hoặc `/^vd\s*[:：]/i` thì đặt `inExamples = true` và bỏ qua dòng đó.
2. **Ví dụ có pinyin.** Regex `EX_PINYIN_RE = /^[-•]\s*(.+?)\s*\/([^/]+)\/\s*(.*)$/` (`:716`).
   - Dạng: `- 我可以开车。 /Wǒ kěyǐ kāichē./ Tôi có thể lái xe`.
   - Kết quả: `zh` = nhóm 1, **`note` = nhóm 2 (pinyin)**, `vn` = nhóm 3.
   - Luật này áp dụng **cả khi chưa vào vùng ví dụ**, nên dòng có `/…/` ở phần giải thích cũng thành ví dụ.
3. **Ví dụ không có pinyin.** Chỉ xét khi `inExamples`. Dòng phải khớp `EX_LINE_RE = /^[-•]\s+(.+)$/` và phần sau gạch đầu dòng phải bắt đầu bằng chữ Hán `[一-鿿]`.
   - Tách bằng `/^([一-鿿0-9A-Za-z，。！？、：；“”‘’「」【】（）…—·\s]+)\s+(.+)$/`. Hợp lệ khi phần 1 có chữ Hán và phần 2 có chữ Latin/tiếng Việt → `{zh, vn}`.
   - Nếu tách không được thì `{zh: cả dòng, vn: ''}`.
4. Gặp dòng khác trong vùng ví dụ thì đóng vùng (`inExamples = false`).

**Pinyin bị đặt vào `note`** (`db.ts:730`). Hai màn hình hiển thị `note` khác nhau:
- `/grammar/hsk/[level]`: in `ex.note` bằng font mono màu primary, nằm giữa câu Hán và câu dịch (`grammar/hsk/[level]/page.tsx:54`), nên nhìn giống pinyin.
- `/grammar/[id]`: `note` là ghi chú thật do Claude sinh, in kèm "📌" (`grammar/[id]/page.tsx:104`).

Cùng một field `note` mang hai nghĩa.

### Fallback cột `examples` (`db.ts:753-760`)

Chỉ dùng khi regex không tìm được ví dụ nào. Code đọc từng phần tử object với các khoá `zh|chinese`, `vn|mean|vi`, `note|pinyin`.

Dữ liệu thật: chỉ 1/1.734 dòng (id 94) có `examples` khác `[]`. Giá trị đó là `["","",""]` (chuỗi, không phải object) nên bị lọc hết. Trên thực tế nhánh fallback **không bao giờ trả về ví dụ**.

### Giải thích — `explanation` (`db.ts:761-766, 773`)

`explanation` = các dòng `contents` còn lại sau khi bỏ:
- dòng tiêu đề "Ví dụ:" / "vd:";
- dòng khớp `EX_PINYIN_RE`;
- **mọi dòng gạch đầu dòng (`EX_LINE_RE`) có chứa chữ Hán**, bất kể có nằm trong vùng ví dụ hay không.

Các dòng giữ lại được nối bằng `\n`. UI hiển thị với `white-space: pre-wrap`.

### Công thức, tiêu đề (`db.ts:767-779`)

- `title = keywords || title`
- `titleVn = title`
- `formula = keywords || formulaFromContents || use_for || ''`. Trong đó `formulaFromContents` là dòng **đầu tiên** khớp `/cấu trúc\s*[:：]/i`, lấy nguyên cả dòng.

Dữ liệu thật:
- 1.727/1.734 dòng có `keywords`. Ở các dòng này `formula` trùng với `title`.
- 2 dòng lấy công thức từ `contents`.
- 5 dòng lấy `use_for`.

### Màn hình `/grammar/hsk/[level]`

- Tìm kiếm ở client, không phân biệt hoa thường, trên `title`, `titleVn`, `keywords`, `explanation`, `useFor` (`page.tsx:83-92`).
- Phân trang `PAGE_SIZE = 12` (`:14`).
- `openIdx` là chỉ số trong trang hiện tại. Mặc định mở điểm đầu tiên. Đổi trang thì mở lại điểm 0 và cuộn lên đầu (`:180`).
- `useFor` chỉ hiện khi khác `titleVn` (`:41`).
- Thanh "pill" sticky để nhảy tới từng điểm trong trang (`:135-153`).

### Màn hình `/grammar/[id]`

- Tìm kiếm ở client, chỉ trên `title` / `titleVn` (`:147-150`). Không phân trang.
- Ô công thức luôn được render, kể cả khi `formula` rỗng (`:92-94`).
- `ExerciseItem` (`:7-58`):
  - `choice`: bấm một phương án là chấm luôn (`chosen === answer`), khoá các nút, tô xanh đáp án đúng và đỏ phương án đã chọn.
  - `fill`: bấm "Kiểm tra" → so khớp chính xác `fillVal.trim() === ex.answer`, không chuẩn hoá dấu câu hay full-width.
  - Lời giải thích và đáp án đúng (khi điền sai) chỉ hiện **bên trong** khối `ex.explanation` (`:50-55`).
- `ComparisonCard` hiển thị 2 cột wordA/wordB và `tip`.

## Trạng thái phía client

| Màn hình | State | Ghi chú |
|---|---|---|
| `/grammar/hsk/[level]` | `items`, `loading`, `openIdx`, `search`, `page`, `sectionRefs` | Không cache. Đổi `level` thì fetch lại. Không dùng localStorage |
| `/grammar/[id]` | `lesson`, `openIdx`, `search`, `sectionRefs`. Mỗi `ExerciseItem` có `chosen`, `fillVal`, `revealed` | Kết quả bài tập mất khi reload |
| `GlobalShell` | `grammarCounts` (map hsk → count) | Fetch 1 lần khi mount |

## Script liên quan

`scripts/crawl-hanzii-grammar.mjs`. Chạy: `node scripts/crawl-hanzii-grammar.mjs [--extra]`.

1. Dựng khoá AES (`:45-56`): base64-decode `SECRET_KEY` → đảo ngược mảng byte → XOR với `PEPPER` → SHA-256.
2. Với mỗi từ khoá tìm kiếm, gọi `https://api2.hanzii.net/api/search/all/vi/grammar/?key=…&page=…&limit=50` (`:91-101`).
   - Từ khoá: `LEVEL_KEYS` gồm A1..C2, 高等, Li hợp, Dịch, HSK1..HSK6.
   - Có `--extra` thì thêm `EXTRA_SEEDS` (các từ hay gặp như 的, 了, 把…).
3. Giải mã `json.data` bằng AES-256-CBC: 16 byte đầu là IV (`:58-65`).
4. Phân trang đến khi `(page-1)*50 >= total` hoặc trang trả về rỗng. Nghỉ 350 ms giữa các request (`:169-189`).
5. `saveItems` (`:140-164`) bỏ qua id đã có trong DB hoặc đã gặp trong lần chạy này. Các id mới được `INSERT … ON CONFLICT(id) DO UPDATE`:
   - `hsk = mapHsk(it.level)`: A1→HSK1 … C2→HSK6, 高等→HSK7-9, Li hợp/Dịch/khác → `Khác` (`:23-33, 67-69`).
   - `contents` và `examples` lưu dạng JSON; `raw` lưu toàn bộ item.
6. In thống kê số dòng theo `hsk`.

## Vấn đề phát hiện

1. **Mất dòng công thức có chữ Hán** (`db.ts:764`). Luật lọc giải thích bỏ mọi dòng `- …` có chữ Hán, kể cả khi dòng đó nằm ngoài vùng ví dụ và không được parse thành ví dụ.
   - Ví dụ: `- Khẳng định: Chủ ngữ + 需 + Động từ + Tân ngữ.` (id 3). Dòng này không vào `explanation`, cũng không vào `examples`, nên **không hiện ở đâu**. Trong giải thích chỉ còn lại tiêu đề "Cấu trúc:" / "Nghi vấn:" mà không có nội dung bên dưới.
   - Đo trên DB: khoảng 709 dòng ở 273 điểm ngữ pháp bị mất theo cách này. Con số đếm bằng heuristic: dòng bị lọc và không chứa `zh` của ví dụ nào.
2. **Pinyin nằm trong `note`** (`db.ts:730`). Trùng nghĩa với `note` của ngữ pháp bài học (xem mục Logic). `docs/db/DESIGN.md` đã ghi nhận.
3. **`EX_PINYIN_RE` chạy cả ngoài vùng "Ví dụ"** (`db.ts:728`). 157 ví dụ được lấy từ dòng nằm trước tiêu đề "Ví dụ:".
   - Ví dụ id 1: `桌子上 /zhuōzi shàng/` trong phần liệt kê phương vị từ. Dòng này bị chuyển thành ví dụ và mất khỏi giải thích.
4. **`formula` trùng `title`** ở 1.727/1.734 điểm, vì cả hai đều lấy `keywords` trước (`db.ts:770, 772`). Màn hình HSK in cùng một chuỗi hai lần: tiêu đề ở `:28` và ô công thức ở `:38`. Cấu trúc thật nằm trong `contents` thì bị mất (xem vấn đề 1).
5. **`formulaFromContents` lấy nguyên dòng đầu khớp "cấu trúc:"**, kể cả dòng tiêu đề trống như `"Cấu trúc:"`. Dữ liệu hiện tại không rơi vào trường hợp này (0 dòng), nhưng regex không loại nó.
6. **Fallback cột `examples` là code chết với dữ liệu thật** (`db.ts:753-760`), như đã phân tích ở trên.
7. 44 điểm ngữ pháp không có ví dụ nào. 18 ví dụ có `vn` rỗng (nhánh không tách được, `db.ts:741`).
8. **Parse lại ở mỗi request** (`db.ts:788`). Không cache. Mỗi lần mở một cấp là parse JSON và chạy regex cho tối đa 297 dòng.
9. **`getHanziiGrammarCount()` không được dùng** (`db.ts:799-804`). Grep `src/` và `scripts/` chỉ thấy định nghĩa.
10. **`src/app/api/generate-grammar/` là thư mục rỗng**, không có trong git.
11. **`lessonHref('grammar', id)` là nhánh chết** (`GlobalShell.tsx:35`). Mục grammar trong sidebar render danh sách cấp HSK (`:332-348`) và không bao giờ gọi `lessonHref`. `lessonHref` chỉ được gọi ở `:384`, thuộc nhánh của các mục khác.
12. **`/grammar/[id]` – bài tập điền từ**: nếu `ex.explanation` rỗng thì người dùng điền sai cũng không thấy đáp án đúng, vì đáp án nằm trong khối explanation (`grammar/[id]/page.tsx:50-53`).
13. **`/grammar/[id]` gọi `getLesson`**. Hàm này có thể **ghi DB khi đọc**: nếu vocab thiếu `id` thì sinh id rồi `UPDATE lessons` (`db.ts:51-60`). Hiện mọi vocab đều đã có id (đã kiểm tra: 0/5.067 thiếu).
14. **Script crawl không cập nhật bản ghi cũ.** Comment "Resume-safe: skips ids already in DB" đúng như code làm: id đã có thì bị `skipped` trước khi tới câu lệnh (`:144-147`). Vì vậy `ON CONFLICT DO UPDATE` (`:122-132`) chỉ có tác dụng với id trùng trong cùng lần chạy, và cũng không xảy ra vì có `seenThisRun`. Muốn làm mới dữ liệu phải xoá dòng trước.
15. **Script crawl**:
    - Lỗi một trang thì `break` bỏ luôn phần còn lại của từ khoá đó, không retry (`:182-187`).
    - Khoá giải mã (`SECRET_KEY`, `PEPPER`) và `X-Client-Id` được hard-code trong mã nguồn (`:17-18, 42`).
16. **`/grammar/[id]` với id không tồn tại sẽ treo "Đang tải..." mãi.** API trả 404 `{error}`, client gọi `setLesson(d.lesson)` với `undefined` (`grammar/[id]/page.tsx:137`), mà điều kiện hiện loading là `!lesson` (`:152`). Code không xử lý lỗi.
17. **Hai màn hình ngữ pháp gần như trùng code.** `GrammarSection`, header, thanh pill được lặp lại ở hai file và khác nhau ở vài chi tiết: font công thức, cách in `note`, phân trang.

## Ảnh hưởng khi chuyển DB v4

1. Viết lại `getHanziiGrammarByHsk(level)` → `getGrammarByLevel(level)` đọc `grammar_points` + `grammar_examples`. Cần quyết định cách ánh xạ:
   - `HSK1..HSK6` → `hsk_level` 1..6;
   - `HSK7-9` → 7;
   - `Khác` → `hsk_level IS NULL` (nhóm theo `category`) — route `/grammar/hsk/Khác` và màn hình cần một trong hai: giữ `Khác` như một level giả, hoặc chuyển sang lọc theo `category`.
2. `getHanziiGrammarCounts()` → `GROUP BY hsk_level` (và `category`). Giữ nguyên shape `{hsk, count}[]` thì `GlobalShell.tsx:84-88` không phải sửa.
3. **Bỏ `parseHanziiExamples` / `rowToHanziiGrammar` khỏi runtime.** Logic tách chuyển sang script migrate (phase 4) và chạy một lần. Khi đó nên sửa luôn:
   - pinyin → `grammar_examples.pinyin`;
   - không làm mất các dòng cấu trúc (vấn đề 1, 3);
   - `formula` không trùng `title` (vấn đề 4).
4. **Kiểu `HanziiGrammar`** (`src/types/index.ts:62-73`) và UI `grammar/hsk/[level]/page.tsx:54` phải hiển thị `pinyin` tách khỏi `note`.
5. **`/grammar/[id]` phụ thuộc bảng `lessons`**, mà v4 không còn bảng này. Ngữ pháp bài học thành `grammar_points` với `source='ai'`. Cần:
   - route mới, ví dụ `/grammar/point/[id]` hoặc hợp nhất vào trang theo cấp;
   - đổi link ở `src/app/page.tsx:243` và `src/app/lesson/[id]/page.tsx:433`;
   - **mất cách nhóm theo bài**, trừ khi thêm `grammar_points.topic` (câu hỏi mở trong `docs/db/DESIGN.md`).
6. `ExerciseItem` dùng `ex.id` (chuỗi nanoid) làm key. Ở v4, `grammar_exercises.id` là INTEGER và `options` là JSON, nên phải parse khi đọc.
7. `comparisons` đọc từ cột JSON `grammar_points.comparisons` thay cho `lessons.data.grammar[].comparisons`.
8. Đếm `grammarCount` cho card bài học (`db.ts:40`, `src/app/page.tsx:214`, `lesson/[id]/page.tsx:421`) không còn nguồn khi bỏ `lessons`.
9. `analyzeLesson` / `saveLesson` (upload .docx) phải ghi vào `grammar_points` / `grammar_examples` / `grammar_exercises` thay vì JSON.
10. Script crawl phải ghi vào `grammar_points` (khoá `external_uid` = `_id` Hanzii), hoặc ghi vào bảng staging rồi chạy lại bước parse.
