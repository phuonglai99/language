# Từ vựng theo cấp & Tìm kiếm từ vựng

> Tài liệu mô tả code hiện tại (đọc ngày 2026-10-01). Số liệu đo bằng truy vấn chỉ đọc trên `data/lessons.db`.

## Mục đích

- **Từ vựng theo cấp** (`/vocab/[level]`): gộp vocab của mọi bài học cùng `level` thành một danh sách. Có lọc nhanh và phân trang; bấm một từ để mở flashcard trong bài gốc.
- **Tìm kiếm từ vựng** (`/api/search`) có hai nơi dùng:
  1. Ô tìm kiếm toàn cục trong sidebar.
  2. Popup tra nghĩa tiếng Việt khi bấm vào từ trong bài khoá `/reading/[slug]`.

## Màn hình & route

| Route / thành phần | File | Gọi API |
|---|---|---|
| `/vocab/[level]` (`HSK1`..`HSK6`) | `src/app/vocab/[level]/page.tsx` | `GET /api/vocab?level=` (`:37-42`) |
| Ô tìm kiếm trong sidebar (mọi trang) | `src/app/components/GlobalShell.tsx:209-257` | `GET /api/search?q=` (`:103-110`) |
| Popup tra từ trong bài khoá | `src/app/reading/[slug]/LessonReader.tsx:196-212` | `GET /api/search?q={hanzi}` |

Lối vào `/vocab/[level]`: sidebar → mục "Từ vựng" → mở một cấp → "Tất cả từ vựng →" (`GlobalShell.tsx:372-380`).

Ngoài hai nơi trên, không component nào khác gọi `/api/search` hay `/api/vocab` (đã grep `src/`). Trang `/reading` có ô tìm kiếm riêng, lọc bài bằng SQL `LIKE` trong `queryMBLessons`, không liên quan tới tìm kiếm từ vựng.

## Luồng xử lý

### A. `/vocab/[level]`

1. Người dùng mở `/vocab/HSK2`. Client gọi `GET /api/vocab?level=HSK2`.
2. API (`src/app/api/vocab/route.ts:6-11`) trim `level`. Rỗng thì trả `{items:[]}`, ngược lại gọi `getVocabByLevel(level)`.
3. `getVocabByLevel` (`src/lib/db.ts:806-819`):
   - `SELECT id, title, data FROM lessons WHERE level = ? ORDER BY created_at ASC`;
   - `JSON.parse(data)` từng bài, rồi đẩy mọi `vocab[]` thành `{lessonId, lessonTitle, zh, py, pos, vn, ex}`.
4. Client nhận toàn bộ danh sách (HSK6: 2.513 từ). Việc lọc và phân trang (10 từ/trang) làm ở client.
5. Bấm một card → `/lesson/{lessonId}?mode=flash&word={zh}` (`page.tsx:98`). Trang bài học tìm `findIndex(v => v.zh === word)` và đặt `idx` (`src/app/lesson/[id]/page.tsx:337-346`).

### B. Tìm kiếm trong sidebar

1. Người dùng gõ vào ô "Tìm từ vựng (pinyin, hán tự…)". `query` cập nhật theo từng phím.
2. Debounce 300 ms (`GlobalShell.tsx:112-117`). Trong lúc gõ IME (`compositionstart` → `compositionend`) thì không tìm, tới `compositionend` mới đặt lại `query` (`:216-217`).
3. `doSearch(q)`: `q.trim()` rỗng thì xoá kết quả. Ngược lại `fetch('/api/search?q=' + encodeURIComponent(q))` (`:103-110`).
4. API (`src/app/api/search/route.ts:6-11`) trim `q`. Rỗng thì trả `{results:[]}`, ngược lại gọi `searchVocab(q)` (limit mặc định 40).
5. Client hiển thị tối đa 40 dòng: chữ Hán, pinyin, từ loại, nghĩa, badge cấp, tên bài (`:229-257`).
6. Bấm một kết quả → `/lesson/{lessonId}`, **không kèm `word`**, rồi xoá ô tìm kiếm (`:239`).

### C. Tra từ trong bài khoá

1. Bấm một từ trong bài → `WordToken` gọi `onLookup(word.hanzi)`. Chỉ gọi khi state đang là `'none'` (`LessonReader.tsx:85-87`).
2. `handleLookup` (`:198-212`):
   - đã có trong `lookupCache.current[hanzi]` thì trả luôn;
   - chưa có thì gọi `/api/search?q={hanzi}`, rồi chọn `results.find(r => r.zh === hanzi) ?? results[0] ?? null` và lưu cache (kể cả `null` khi lỗi).
3. Popup hiện `pos`, `vn`, `lessonTitle` của kết quả, cùng `definition` tiếng Anh có sẵn trong dữ liệu MB (`:127-140`).
4. Nút thêm ghi chú dùng `vn`/`pos` từ kết quả này (`:150`). Xem `docs/features/notes.md`.

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/vocab?level=` | `level` (trim). Rỗng thì trả `[]` | `{ items: LevelVocabItem[] }` = `{lessonId, lessonTitle, zh, py, pos, vn, ex:{zh,vn}}` | `src/app/api/vocab/route.ts:6-11` |
| GET | `/api/search?q=` | `q` (trim). Rỗng thì trả `[]` | `{ results: SearchResult[] }` = `{lessonId, lessonTitle, level, zh, py, vn, pos}`, tối đa 40 | `src/app/api/search/route.ts:6-11` |

Kiểu dữ liệu: `SearchResult` ở `db.ts:665-673`, `LevelVocabItem` ở `db.ts:675-683`. `GlobalShell.tsx:11-14` khai báo lại `SearchResult` thay vì import.

## Dữ liệu

| Dùng cho | DB cũ | DB v4 |
|---|---|---|
| Danh sách theo cấp | `lessons.level` + `JSON.parse(lessons.data).vocab[]` | `words WHERE hsk_level = ?` JOIN `word_senses` (+ `sense_examples` cho `ex`). Cũng có thể lọc theo `word_senses.hsk_level` (nghĩa dạy ở cấp đó) |
| `zh` / `py` | `vocab[].zh` / `vocab[].py` | `words.hanzi` / `words.pinyin` (đã chuẩn hoá dạng từ điển) |
| `vn` / `pos` | `vocab[].vn` / `vocab[].pos` (text tự do) | `word_senses.meaning_vi` / `word_senses.pos` → `parts_of_speech.name_vi` |
| `ex` | `vocab[].ex` (1 ví dụ) | `sense_examples(zh, pinyin, vi)` |
| `lessonId` / `lessonTitle` (badge, link) | `lessons.id` / `lessons.title` | Không còn bảng `lessons`. Badge tương ứng: `words.hsk_level` / `words.topic` |
| Tìm kiếm | quét toàn bộ `lessons.data` | `words_fts` (FTS5, `tokenize='trigram'`) trên `hanzi, pinyin_plain, han_viet, meanings` |
| Pinyin không dấu | `stripTones()` tính lúc chạy | `words.pinyin_plain` tính sẵn |

Khối lượng hiện tại:
- 12 bài, 5.067 vocab, khoảng 1,16 MB JSON trong `lessons.data`.
- Số vocab theo cấp: HSK1 149, HSK2 215, HSK3 295, HSK4 600, HSK5 1.295, HSK6 2.513.
- `HSK2` gồm 7 bài: danh sách HSK2 và 6 bài chủ đề/ngữ pháp có `level = 'HSK2'`. Trong cấp này có 17 chữ Hán xuất hiện ở hơn một bài.

## Logic chi tiết

### `searchVocab(query, limit = 40)` (`db.ts:825-847`)

1. `SELECT id, title, level, data FROM lessons`. **Không có `ORDER BY`**, nên thứ tự là thứ tự rowid: HSK1 → HSK6 → các bài chủ đề.
2. Chuẩn hoá truy vấn:
   - `q = query.toLowerCase().trim()`;
   - `qStripped = stripTones(q)`.
3. Với mỗi bài: `JSON.parse(data)` (lỗi thì bỏ qua bài), rồi duyệt từng `v` trong `vocab[]`. Một từ khớp nếu **một trong ba** điều kiện đúng:
   - `v.zh.includes(query)`: so chữ Hán dạng substring, dùng `query` gốc chưa lowercase. API đã trim trước đó.
   - `stripTones(v.py).includes(qStripped)`: so pinyin bỏ dấu, không phân biệt hoa thường, substring. Khoảng trắng giữ nguyên, nên `"laoshi"` không khớp `"lǎo shī"`.
   - `v.vn.toLowerCase().includes(q)`: so nghĩa tiếng Việt **có dấu**, substring. `"hoc"` cho 0 kết quả, `"học"` cho 40.
4. Đủ `limit` kết quả thì `return` ngay. Không xếp hạng: khớp chính xác không được ưu tiên hơn khớp một phần. Không loại trùng.

### `stripTones(s)` (`db.ts:821-823`)

```ts
s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[üǖǘǚǜ]/g, 'v').toLowerCase()
```

- NFD tách dấu thanh thành ký tự tổ hợp. Dải U+0300–U+036F bị xoá.
- `ü` cũng bị NFD tách thành `u` + U+0308 rồi bị xoá cùng các dấu khác. Vì vậy `replace(/[üǖǘǚǜ]/g, 'v')` **không bao giờ khớp** (đã chạy thử: `lǜsè` → `luse`, `nǚ` → `nu`).
- Hệ quả: gõ `lv` cho 0 kết quả; gõ `lu`/`lü` thì ra cả 路, 旅游, 法律.

### `getVocabByLevel(level)` (`db.ts:806-819`)

Khớp chính xác `lessons.level`, không kiểm tra giá trị. Field nào thiếu thì thay bằng `''`, `ex` thiếu thì thay bằng `{zh:'', vn:''}`. Không loại trùng giữa các bài cùng cấp.

### Lọc ở `/vocab/[level]` (`page.tsx:44-46`)

- Chỉ chạy khi `search.trim()` khác rỗng. Khi so sánh lại dùng `search` **chưa trim**:
  - `it.zh.includes(search)`;
  - `it.py.toLowerCase().includes(search.toLowerCase())`: **có dấu**, không dùng `stripTones`, khác với tìm kiếm toàn cục;
  - `it.vn.toLowerCase().includes(…)`.
- Phân trang `PAGE_SIZE = 10` (`:19`). Gõ lọc thì về trang 1.

## Trạng thái phía client

| Thành phần | State / cache | Ghi chú |
|---|---|---|
| `/vocab/[level]` | `items`, `loading`, `page`, `search` | Không cache. Đổi `level` thì fetch lại |
| `GlobalShell` | `query`, `searchResults`, `searching`, `debounceRef`, `composingRef` | Không huỷ request cũ (không dùng `AbortController`) |
| `LessonReader` | `lookupCache: useRef<Record<hanzi, VnResult \| null>>` | Cache theo bài đang mở, mất khi rời trang. Lưu cả `null` khi lỗi mạng, nên không thử lại |

Không dùng localStorage.

## Script liên quan

Không có script riêng. Dữ liệu vocab được ghi vào `lessons.data` qua `POST /api/upload`: `.xlsx` thì đọc bằng `parseHskXlsx`, `.docx` thì qua `analyzeLesson` (Claude).

## Vấn đề phát hiện

1. **Mỗi request đều parse JSON của mọi bài.**
   - `searchVocab` parse cả 12 bài (khoảng 1,16 MB) ở **mỗi lần gõ**, sau debounce 300 ms (`db.ts:827-833`). Đo trên máy dev: khoảng 8 ms cho một lượt parse toàn bộ. Thời gian tăng tuyến tính theo số bài và số vocab.
   - `getVocabByLevel` parse toàn bộ bài của cấp đó ở mỗi request.
   - Cả hai đều không cache.
2. **Kết quả tìm kiếm không xếp hạng và có thể trùng.** Thứ tự là thứ tự rowid của `lessons`, cắt ở 40 kết quả. Cùng một từ ở bài HSK2 và bài chủ đề hiện 2 lần.
3. **Nhánh `ü → v` trong `stripTones` là code chết** (`db.ts:822`). Gõ kiểu `lv`/`nv` (cách gõ pinyin phổ biến) không tìm được 绿/女.
4. **Tìm theo nghĩa tiếng Việt phân biệt dấu**: gõ "hoc" không ra từ nào. Tìm theo pinyin thì giữ nguyên khoảng trắng.
5. **Tra từ trong bài khoá có thể hiện nghĩa của từ khác.**
   - Không có mục khớp chính xác thì `LessonReader` lấy `results[0]` (`LessonReader.tsx:207`), là một từ bất kỳ *chứa* chữ đó hoặc khớp pinyin/nghĩa.
   - Đo trên DB: 4.463/7.298 token khác nhau trong `mb_lessons` không có mục `zh` khớp chính xác trong vocab bài học.
   - Nghĩa sai này còn bị lưu vào ghi chú (xem notes.md).
6. **Race condition ở ô tìm kiếm sidebar**: không huỷ request cũ (`GlobalShell.tsx:103-110`). Response đến chậm của truy vấn cũ có thể ghi đè kết quả mới.
7. **Bấm kết quả tìm kiếm không mở đúng từ.** Link `/lesson/{id}` không có `word` (`GlobalShell.tsx:239`), nên flashcard mở ở từ đầu tiên. Trang `/vocab/[level]` thì có truyền `word` (`page.tsx:98`).
8. **Lọc ở `/vocab/[level]` không nhất quán**:
   - `trim()` chỉ dùng để quyết định có lọc hay không, khi so sánh lại dùng chuỗi chưa trim;
   - pinyin phải gõ đúng dấu (`page.tsx:44-46`), khác với tìm kiếm toàn cục.
9. **Code thừa ở `/vocab/[level]`**:
   - hàm `speak` (`page.tsx:21-27`) không được dùng, vì `VocabListCard` có `defaultSpeak` riêng;
   - `LEVEL_COLOR` thiếu `HSK7-9`.
10. **`key={i}`** theo vị trí trong trang (`page.tsx:94`). Danh sách có từ trùng nên không dùng `zh` làm key được; id của vocab đã có nhưng API không trả về.
11. `getVocabByLevel` / `searchVocab` không gọi `getLesson`, nên **không** sinh `vocab.id`. Hiện cả 5.067 vocab đều đã có id.

## Ảnh hưởng khi chuyển DB v4

1. **Viết lại `searchVocab`** dùng `words_fts`, ví dụ:
   ```sql
   SELECT w.id, w.hanzi, w.pinyin, w.hsk_level, s.pos, s.meaning_vi
   FROM words_fts f JOIN words w ON w.id = f.rowid
   LEFT JOIN word_senses s ON s.word_id = w.id AND s.position = 0
   WHERE words_fts MATCH ? ORDER BY rank LIMIT 40;
   ```
   (Câu SQL minh hoạ, chưa chạy thử.) Các điểm cần lưu ý:
   - **Trigram cần chuỗi tìm ≥ 3 ký tự.** Theo tài liệu FTS5, `MATCH` với chuỗi ngắn hơn 3 ký tự không trả về dòng nào. `LIKE`/`GLOB` trên bảng trigram với chuỗi < 3 ký tự thì quét toàn bảng. Hầu hết truy vấn chữ Hán chỉ dài 1–2 ký tự, nên cần nhánh riêng cho truy vấn ngắn: `words.hanzi = ?` (index `words_hanzi`) hoặc `LIKE`. Cần đo lại hiệu năng trên dữ liệu thật.
   - Pinyin: truy vấn phải được chuẩn hoá giống `pinyin_plain` lúc migrate — bỏ dấu, bỏ khoảng trắng, `ü` → `v` hoặc `u` (cần chọn một cách và dùng thống nhất). Nên sửa luôn vấn đề 3.
   - Nghĩa tiếng Việt: `meanings` trong FTS vẫn có dấu. Muốn tìm không dấu thì phải thêm cột đã bỏ dấu tiếng Việt. Thiết kế hiện tại chưa có cột này.
   - Có `rank` (bm25) để xếp hạng. Nên ưu tiên khớp chính xác `hanzi = q`.
   - `words` là duy nhất theo `(hanzi, pinyin)`, nên hết cảnh một từ hiện 2 lần vì nằm ở 2 bài.
   - `words_fts` là bảng FTS5 thường, không phải external-content. Mỗi lần ghi `words` / `word_senses` phải tự đồng bộ: dùng trigger hoặc ghi trong `db.ts`. Thiết kế hiện chưa mô tả trigger.
2. **Shape kết quả thay đổi.** `SearchResult.lessonId` / `lessonTitle` không còn ý nghĩa, vì không có bảng `lessons`. Phải sửa:
   - `GlobalShell.tsx:11-14, 238-255` (badge, link `/lesson/{id}`): cần route xem chi tiết từ, ví dụ `/word/[id]`, hoặc link sang danh sách theo cấp;
   - `LessonReader.tsx:196-212` (popup hiện `lessonTitle`).
3. **Popup bài khoá nên đọc nghĩa qua `passage_sentences.tokens[].s`** (sense id theo ngữ cảnh) thay vì tìm theo chữ Hán. Cách này giải quyết vấn đề 5 và bỏ được request `/api/search` cho mỗi lần bấm từ.
4. **`getVocabByLevel` → `SELECT … FROM words WHERE hsk_level = ?`** (index `words_hsk`), JOIN sense/ví dụ.
   - Cấp của từ là cấp **thấp nhất** (`docs/db/DESIGN.md`). Một từ có ở cả HSK3 và HSK4 sẽ chỉ hiện ở HSK3, nên số từ mỗi cấp sẽ khác hiện nay.
   - Các bài chủ đề HSK2 (Giao thông…) chuyển thành `words.topic`, không còn được gộp vào `/vocab/HSK2`.
5. **Link flashcard** `/lesson/{lessonId}?mode=flash&word=` (`vocab/[level]/page.tsx:98`) phụ thuộc bảng `lessons`. Cần quyết định trang flashcard mới nhận `hsk_level`/`topic` + `word_id`.
6. `LevelVocabItem.ex` lấy từ `sense_examples` (position 0). `pos` chuyển từ text tự do sang mã (`n`, `v`…), nên UI cần `parts_of_speech.name_vi` để hiển thị.
7. Sidebar đếm số từ theo cấp bằng `getAllLessons().vocabCount` (`GlobalShell.tsx:357-358`, `db.ts:33-43`, cũng parse JSON mọi bài). Phải chuyển sang `SELECT hsk_level, COUNT(*) FROM words GROUP BY hsk_level`.
