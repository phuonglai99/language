# Kiến trúc backend & tầng truy cập DB

Tài liệu này mô tả cách app hiện tương tác với DB, công sửa khi đổi DB, và kiến trúc đề xuất. Code khảo sát ngày 2026-10-01.

Tài liệu liên quan:
- Kiến trúc hệ thống và deploy (có sẵn): [ARCHITECTURE.md](ARCHITECTURE.md)
- Thiết kế DB mới: [db/DESIGN.md](db/DESIGN.md), [db/README.md](db/README.md), [db/schema.sql](db/schema.sql)
- Logic từng tính năng: [features/README.md](features/README.md)

---

## 1. Kiến trúc hiện tại

```
UI (client components)
  │  fetch() tới 19 API route
  ▼
API routes (src/app/api/**)  +  2 server component (src/app/reading/page.tsx, src/app/reading/[slug]/page.tsx)
  │  gọi hàm, không viết SQL
  ▼
src/lib/db.ts  — 847 dòng, 30 hàm export, nơi DUY NHẤT trong src/ có SQL
  ▼
better-sqlite3 13 (đồng bộ) → data/lessons.db

Song song, không đi qua db.ts:
  7 script Node (.mjs) + scripts/align-whisper.py  → SQL trực tiếp vào DB
```

### 1.1 Route → hàm DB

| Route / trang | Hàm trong `db.ts` |
|---|---|
| `GET /api/lessons` | `getAllLessons` |
| `GET/DELETE /api/lessons/[id]` | `getLesson`, `deleteLesson` |
| `POST /api/upload` | `saveLesson` |
| `GET /api/vocab` | `getVocabByLevel` |
| `GET /api/search` | `searchVocab` |
| `GET /api/kanji/[char]` | `getKanji`, `saveKanji` (cache miss: gọi Hanzii rồi ghi DB ngay trong route) |
| `GET /api/grammar` | `getHanziiGrammarByHsk`, `getHanziiGrammarCounts` |
| `GET/POST /api/notes/folders` | `getNoteFolders`, `createNoteFolder` |
| `PATCH/DELETE /api/notes/folders/[id]` | `renameNoteFolder`, `deleteNoteFolder` |
| `GET/POST /api/notes/items` | `getNoteItems`, `addNoteItem` |
| `DELETE /api/notes/items/[id]` | `deleteNoteItem` |
| `GET /api/reading` | `queryMBLessons` |
| `GET /api/reading/[slug]` | `getMBLesson` |
| `GET /api/reading/counts` | `getMBLessonCounts` |
| `GET /api/dictation/lessons` | `queryMBLessons` |
| `GET /api/dictation/lessons/[slug]` | `getMBLesson`, `countLessonVocab` |
| `POST /api/dictation/check` | `getMBLesson` + `matchDictationWords` (`src/lib/dictation.ts`) |
| `GET /api/dictation/align` | `getMBAlignSummaries` |
| `GET/PUT /api/dictation/align/[slug]` | `getMBLesson`, `saveMBLessonAlignment` |
| `src/app/reading/page.tsx` (server) | `queryMBLessons` |
| `src/app/reading/[slug]/page.tsx` (server) | `getMBLesson`, `getAdjacentMBLessons` |

### 1.2 Script truy cập DB trực tiếp

| Script | Đọc / ghi |
|---|---|
| `scripts/crawl-hanzii.mjs` | Tự `CREATE TABLE kanji`, `INSERT OR REPLACE` |
| `scripts/crawl-hanzii-grammar.mjs` | Tự `CREATE TABLE hanzii_grammar`, upsert |
| `scripts/import-mandarin-bean.mjs` | Tự `CREATE TABLE mb_lessons`, upsert (ghi đè `content`, `categories`) |
| `scripts/migrate-mb-split-sentences.mjs` | `UPDATE mb_lessons` (xoá `sentence_timestamps`) |
| `scripts/patch-audio-urls.mjs` | `UPDATE mb_lessons SET audio_url` |
| `scripts/fill-pos.mjs`, `scripts/fill-pos-local.mjs` | Đọc và ghi đè `lessons.data` |
| `scripts/align-whisper.py` | `ALTER TABLE mb_lessons`, `UPDATE sentence_timestamps` (Python `sqlite3`, khoá ngoại tắt) |

---

## 2. Điểm tốt

- Trong `src/`, mọi truy vấn đều nằm trong `src/lib/db.ts`. Route không chứa SQL; phần lớn chỉ 10–20 dòng: đọc tham số, gọi một hàm, trả JSON.
- Client component không import `db.ts`. Chỉ có `src/lib/dictation.ts` import kiểu `MBLessonWord`, mà file này được dùng ở cả client lẫn server.

## 3. Điểm yếu

### 3.1 Hình dạng dữ liệu DB đi thẳng lên giao diện

Các hàm trả nguyên tên cột (snake_case) hoặc cục JSON lưu trong DB. Route chuyển nguyên ra client, nên giao diện phụ thuộc vào cấu trúc bảng.

| Hình dạng DB | Số file giao diện dùng trực tiếp |
|---|---|
| Cột `mb_lessons`: `title_zh_simplified`, `hsk_level`, `audio_url`, `categories`, `content_text` | 9 |
| Cấu trúc `content[][]` (đoạn → token) của Mandarin Bean | 5 |
| Kiểu `Lesson` = cục JSON `lessons.data` `{vocab[], grammar[]}` | 8 |

### 3.2 Script không đi qua `db.ts`

8 script tự viết SQL, một số còn tự tạo hoặc sửa bảng. Định nghĩa bảng vì vậy nằm ở nhiều nơi, và dễ lệch nhau.

Ví dụ: chạy lại `import-mandarin-bean.mjs` ghi đè dữ liệu câu đã tách, làm mốc audio trỏ sai câu (xem [features/mandarin-bean-pipeline.md](features/mandarin-bean-pipeline.md)).

### 3.3 `db.ts` làm quá nhiều việc

Một file đang gánh cả:
- **Tạo bảng và sửa bảng:** `CREATE TABLE IF NOT EXISTS`, `ALTER` bọc `try/catch`, chạy lại ở mỗi lần gọi hàm.
- **Backfill khi khởi động:** `backfillKanjiBotuClaude`, `backfillMBCounts`.
- **Truy vấn.**
- **Nghiệp vụ:** parse ngữ pháp bằng regex (`parseHanziiExamples`), đếm từ (`countLessonVocab`), bỏ dấu pinyin (`stripTones`).
- **Ghi DB ngay khi đọc:** `getLesson` tự sinh `id` cho vocab rồi ghi lại.

### 3.4 Mọi hàm đều đồng bộ

better-sqlite3 là thư viện đồng bộ. Toàn bộ 30 hàm và mọi nơi gọi chúng đều không dùng `await`.

### 3.5 Nghiệp vụ nằm trong route

`/api/kanji/[char]` tự gọi API Hanzii, giải mã và ghi DB ngay trong route. `/api/upload` tự gọi Claude. Không script nào dùng lại được các logic này.

---

## 4. Công sửa khi đổi DB

### 4.1 Đổi schema sang v4, vẫn dùng SQLite

Ước lượng khi viết lại `db.ts` nhưng **giữ nguyên kiểu dữ liệu trả về**:

| Phần | Khối lượng |
|---|---|
| `src/lib/db.ts` | Viết lại gần như toàn bộ |
| API routes | ~13/19 route không phải sửa. Phải sửa 6 route: `/api/lessons`, `/api/lessons/[id]` (không còn bảng `lessons`), `/api/upload` (ghi vào ~7 bảng trong 1 transaction), `/api/vocab`, `/api/search` (dùng `words` + FTS), `/api/kanji` |
| Giao diện | Không phải sửa nếu giữ kiểu cũ. Nhưng các tính năng mới (nhiều nghĩa, bản dịch theo câu, đề thi) cần kiểu dữ liệu mới, nên sớm muộn vẫn phải sửa |
| Script | Viết lại cả 8 script |

Đánh đổi: giữ kiểu cũ giúp chuyển nhanh, nhưng phải dựng lại hình dạng cũ từ dữ liệu mới (ví dụ ghép `content[][]` từ `passage_sentences`). Lớp chuyển đổi đó là nợ kỹ thuật cần trả sau.

### 4.2 Đổi engine (SQLite → Postgres / MySQL)

| Việc | Phạm vi |
|---|---|
| Đồng bộ → bất đồng bộ | Thêm `async`/`await` cho 30 hàm, 19 route, 2 server component |
| SQL riêng của SQLite | Viết lại `json_each`, `json_extract`, `strftime`, FTS5, `WITHOUT ROWID`, `INSERT OR REPLACE` |
| Kiểu dữ liệu | TEXT chứa JSON → `jsonb`; TEXT chứa thời gian → `timestamptz` |
| Script | Đổi driver ở 7 script Node + 1 script Python |
| Hạ tầng | Cần server DB, chuỗi kết nối, connection pool, backup |

---

## 5. Kiến trúc đề xuất

Làm v4 kiểu gì cũng phải viết lại `db.ts`, nên đây là lúc rẻ nhất để tách lớp.

```
src/server/
  db/
    connection.ts      mở DB, PRAGMA foreign_keys/WAL, 1 instance dùng chung
    migrate.ts         chạy migrations/NNN_*.sql theo schema_migrations
    migrations/
  repos/               CHỈ truy vấn; hàm async; trả kiểu domain (camelCase)
    characters.ts      getCharacter, getStrokes(chars[]), upsertCharacter...
    words.ts           getWord, getSenses, searchWords, listByHsk...
    passages.ts        listPassages(filters), getPassage, saveAlignment...
    grammar.ts         listByHsk, getGrammarPoint, countsByHsk...
    exams.ts
    notes.ts
  services/            nghiệp vụ, gọi repos, quản lý transaction
    dictation.ts       chấm bài (matchDictationWords), lấy câu
    upload.ts          parse file → Claude → ghi words/senses/grammar trong 1 transaction
    hanzii.ts          gọi + giải mã API Hanzii, cache vào characters
    mandarinBean.ts    import bài (chỉ thêm mới, không ghi đè câu đã có mốc)
src/types/api.ts       kiểu trả cho client (DTO), độc lập với tên cột DB
src/app/api/**         đọc tham số → gọi service/repo → trả DTO
scripts/*.ts           chạy bằng tsx, gọi services/repos, không tự viết SQL
scripts/align-whisper.py  ghi kết quả qua API (PUT /api/dictation/align/[slug]) thay vì SQL trực tiếp
```

### Quy tắc

1. Chỉ `src/server/repos/` được viết SQL. Code của app chỉ import qua barrel `src/server/index.ts`, và chỉ file này có `import 'server-only'` (chặn bị đóng gói vào bundle phía client). Script import thẳng `repos/` / `services/`.
2. Hàm trong repo luôn `async`, kể cả khi đang dùng better-sqlite3, để đổi engine không phải sửa nơi gọi.
3. Route và giao diện chỉ dùng kiểu trong `src/types/api.ts`, không dùng kiểu hay tên cột DB.
4. Nghiệp vụ dùng ở nhiều nơi (chấm bài, import, gọi Hanzii, Claude) nằm trong `services/`, dùng chung cho route và script.
5. Schema chỉ thay đổi qua migration. Không còn `CREATE TABLE IF NOT EXISTS` / `ALTER` trong code chạy.
6. Không ghi DB trong hàm đọc.
7. Bộ dấu câu, chuẩn hoá pinyin và các hằng số dùng chung nằm ở một module duy nhất. Phía Python sinh ra từ cùng một nguồn hoặc đọc qua API.

### Lợi ích

| Thay đổi | Phần phải sửa |
|---|---|
| Đổi schema | Chỉ `repos/` (và DTO nếu muốn trả thêm dữ liệu) |
| Đổi engine | `db/connection.ts` + SQL trong `repos/` |
| Thêm nguồn dữ liệu (AI sinh bài, crawl đề) | Thêm 1 service, dùng lại repos |
| Script và app | Dùng chung logic, không còn lệch nhau |

---

## 6. Thư viện

| Lựa chọn | Khi nào chọn |
|---|---|
| better-sqlite3 + SQL thuần, bọc async | Chắc chắn chỉ dùng SQLite. Ít phụ thuộc, nhanh, khớp `schema.sql` hiện có |
| Kysely (query builder có kiểu chặt chẽ) | Có khả năng chuyển Postgres; muốn giữ SQL tường minh nhưng có kiểm tra kiểu |
| Drizzle (ORM nhẹ) | Có khả năng chuyển Postgres; muốn schema viết bằng TypeScript và tự sinh migration |

**Đã chốt (2026-10-01): giữ SQLite**, dùng better-sqlite3 + SQL thuần. Hàm trong `repos/` vẫn async theo quy tắc 2, để nếu sau này đổi engine thì không phải sửa nơi gọi.

---

## 7. Thứ tự áp dụng (chi tiết hoá Phase 7 trong [db/README.md](db/README.md))

1. Tạo `src/server/db/` (connection + migrate) trỏ tới `data/hsk.db`.
2. Viết `src/types/api.ts`. Bước đầu giữ nguyên hình dạng cũ cho các màn hình hiện có.
3. Viết `repos/` theo từng nhóm, mỗi nhóm kèm script đối chiếu kết quả giữa DB cũ và DB mới.
4. Chuyển logic sang `services/`: Hanzii, Claude upload, chấm chính tả, import Mandarin Bean.
5. Chuyển từng route sang repos/services, theo thứ tự rủi ro thấp trước: notes → grammar → reading → dictation → kanji → vocab/search → upload/lessons.
6. Chuyển script sang `.ts` dùng services. `align-whisper.py` ghi qua API.
7. Ở bước cutover (Phase 8): xoá `src/lib/db.ts` và các hàm thừa (`diffHanzi`, `updateKanjiBotu`, `getHanziiGrammarCount`, `/lessons` + `src/lib/lessons.ts`).
8. Sau đó mới đổi DTO dần theo tính năng mới: nhiều nghĩa, bản dịch theo câu, đề thi.
