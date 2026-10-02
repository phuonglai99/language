# Ghi chú (Notes)

> Tài liệu mô tả code hiện tại (đọc ngày 2026-10-01). Số liệu đo bằng truy vấn chỉ đọc trên `data/lessons.db`.

## Mục đích

Người dùng lưu từ vựng vào các thư mục ("folder"), xem lại và làm bài kiểm tra trắc nghiệm trên các từ đã lưu.

Có một folder hệ thống **Mistake** (`id = 'mistake'`). Folder này không đổi tên và không xoá được. Mỗi khi người dùng trả lời sai trong QuizMode, từ đó được tự động thêm vào Mistake.

## Màn hình & route

| Route / thành phần | File | Vai trò |
|---|---|---|
| `/notes` | `src/app/notes/page.tsx` | Lưới các folder, kèm số từ trong mỗi folder. Có nút tạo folder mới |
| `/notes/[id]` | `src/app/notes/[id]/page.tsx` | Danh sách từ trong một folder. Đổi tên / xoá folder, xoá từ, chọn nhiều, làm bài kiểm tra |
| `NoteModal` | `src/app/components/NoteModal.tsx` | Hộp thoại "Thêm vào folder". Có tạo folder ngay trong hộp thoại |
| Link vào `/notes` | `GlobalShell.tsx:169` (thanh rail), `:409` (sidebar), `lesson/[id]/page.tsx:440`, `reading/[slug]/LessonReader.tsx:256` | |

### Các chỗ có thể thêm từ vào ghi chú

| Nơi | Cách thêm | Payload gửi `POST /api/notes/items` | `sourceLessonId` |
|---|---|---|---|
| `/lesson/[id]`, chế độ Flashcard | Nút 📝 trên mặt trước thẻ (`lesson/[id]/page.tsx:481`) → `NoteModal` (`:578-582`) | `zh, py, vn, pos` của `VocabCard` | `id` bài học (`lessons.id`) |
| `/lesson/[id]`, chế độ List | Nút 📝 trong `VocabListCard.extra` (`:545-549`) → `NoteModal` | như trên | `lessons.id` |
| `/reading/[slug]` (bài khoá Mandarin Bean) | Popup của từ → nút thêm ghi chú (`LessonReader.tsx:150`) → `NoteModal` (`:375`) | `zh = word.hanzi`, `py = word.pinyin` (MB), `vn`/`pos` lấy từ kết quả `/api/search` (rỗng nếu không tìm thấy) | **không truyền** → `null` |
| QuizMode, trả lời sai (tự động) | `answerMultiple` (`lesson/[id]/QuizMode.tsx:87-97`) | `folderId: 'mistake'`, `zh, py, vn, pos` của câu hỏi | `lessonId` nếu có. Mở từ trang notes thì `null` |

QuizMode được dùng ở `/lesson/[id]?mode=quiz` (`lesson/[id]/page.tsx:568`, có `lessonId`) và ở `/notes/[id]` (`notes/[id]/page.tsx:113`, **không** có `lessonId`). `MatchGame` không ghi ghi chú.

## Luồng xử lý

### Thêm từ qua NoteModal

1. Người dùng bấm 📝 → component cha đặt `noteWord` → render `<NoteModal word=… />`.
2. Khi mount, modal gọi `GET /api/notes/folders` và chọn sẵn `folders[0]` (`NoteModal.tsx:15-20`). Server sắp xếp `is_system DESC`, nên folder chọn sẵn luôn là **Mistake**.
3. (Tuỳ chọn) Tạo folder: `POST /api/notes/folders {name}`, rồi chọn folder vừa tạo (`:22-30`).
4. Bấm "Lưu vào ghi chú" → `POST /api/notes/items {folderId, zh, py, vn, pos, sourceLessonId}` (`:32-43`).
5. API kiểm tra `folderId` và `zh` (`api/notes/items/route.ts:15`), rồi gọi `addNoteItem` (`db.ts:646-657`):
   - `SELECT id FROM note_items WHERE folder_id = ? AND zh = ?`. Đã có thì trả item cũ, không chèn thêm;
   - chưa có thì `INSERT` với id ngẫu nhiên.
6. Client hiện "✓ Đã lưu" và đóng modal sau 800 ms. Client **không đọc response**.

### Tự thêm vào Mistake khi làm quiz sai

1. `answerMultiple` sai → `POST /api/notes/items {folderId:'mistake', …}` (`QuizMode.tsx:90-96`).
2. Server trả `item.id`, có thể là id **của item đã có sẵn** nếu Mistake đã chứa từ này. Client lưu vào `savedMistakeIds` (Map `zh → id`).
3. Màn hình kết quả có nút "🗑 Xoá" cạnh từng từ sai → `DELETE /api/notes/items/{id}` (`:213-219`).

### Trang `/notes`

1. Mount → `GET /api/notes/folders` → render lưới folder (`notes/page.tsx:14-16`).
2. Tạo folder: `POST /api/notes/folders`, thêm vào state, chuyển sang `/notes/{id}` (`:18-30`).

### Trang `/notes/[id]`

1. `GET /api/notes/folders`, rồi tìm folder hiện tại ở client (`notes/[id]/page.tsx:44-51`). Không có API lấy một folder.
2. `GET /api/notes/items?folderId={id}` → `getNoteItems` sắp xếp `created_at DESC` (`:53-60`, `db.ts:639-644`).
3. Các thao tác:
   - **Đổi tên** (chỉ folder không phải hệ thống): `PATCH /api/notes/folders/{id} {name}` (`:74-79`).
   - **Xoá folder**: xác nhận inline, `DELETE /api/notes/folders/{id}`, rồi về `/notes` (`:81-84`).
   - **Xoá 1 từ**: xác nhận inline trên card, rồi `DELETE /api/notes/items/{itemId}` (`:86-91`).
   - **Xoá nhiều**: chế độ `select` → overlay xác nhận → gửi N request `DELETE` song song bằng `Promise.all` (`:93-99`).
   - **Kiểm tra**: xem mục Logic.
   - **Phát âm**: bấm chữ Hán → Web Speech API `zh-CN`, rate 0.85 (`:12-18`).
   - **Đi tới bài học**: nút → khi có `sourceLessonId`, link tới `/lesson/{sourceLessonId}?mode=list&word={zh}` (`:296-303`).

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/notes/folders` | — | `{ folders: {id,name,isSystem,createdAt,itemCount}[] }` | `src/app/api/notes/folders/route.ts:6-8` |
| POST | `/api/notes/folders` | `{name}`. Rỗng thì trả 400 | `{ folder }` | `…/folders/route.ts:10-14` |
| PATCH | `/api/notes/folders/[id]` | `{name}`. Rỗng thì trả 400 | `{ ok: true }`, kể cả khi không có dòng nào bị đổi | `…/folders/[id]/route.ts:6-12` |
| DELETE | `/api/notes/folders/[id]` | — | `{ ok: true }`, kể cả với folder hệ thống | `…/folders/[id]/route.ts:14-18` |
| GET | `/api/notes/items?folderId=` | `folderId`. Thiếu thì trả 400 | `{ items: NoteItem[] }` | `src/app/api/notes/items/route.ts:6-10` |
| POST | `/api/notes/items` | `{folderId, zh, py?, vn?, pos?, sourceLessonId?}`. Thiếu `folderId`/`zh` thì trả 400 | `{ item }` (mới, hoặc item đã có) | `…/items/route.ts:12-18` |
| DELETE | `/api/notes/items/[id]` | — | `{ ok: true }` | `src/app/api/notes/items/[id]/route.ts:6-10` |

## Dữ liệu

DDL nằm trong `ensureNoteTables` (`db.ts:575-601`). Hàm này chạy `CREATE TABLE IF NOT EXISTS` và seed Mistake ở **mỗi lần gọi** bất kỳ hàm note nào.

| Thao tác | DB cũ | DB v4 |
|---|---|---|
| Folder | `note_folders(id, name, is_system, created_at)` | `note_folders` giữ nguyên cột. Thêm `CHECK is_system IN (0,1)`, `created_at` có DEFAULT |
| Item | `note_items(id, folder_id → note_folders ON DELETE CASCADE, zh, py, vn, pos, source_lesson_id, created_at)`. Index `note_items_folder` | `note_items(id, folder_id, word_id → words, sense_id → word_senses, source_passage_id → passages ON DELETE SET NULL, created_at)`. Thêm `UNIQUE(folder_id, word_id)` |
| Nội dung hiển thị (`zh/py/vn/pos`) | copy text vào `note_items` | JOIN `words.hanzi`, `words.pinyin`, `word_senses.meaning_vi`, `word_senses.pos` (→ `parts_of_speech.name_vi`) |
| Chống trùng | ở tầng ứng dụng, theo `(folder_id, zh)` | ràng buộc DB `UNIQUE(folder_id, word_id)` |
| Đếm số từ | `LEFT JOIN … COUNT(i.id) GROUP BY f.id` | giữ nguyên |

Dữ liệu hiện tại:
- 2 folder: `mistake` "Mistake" (hệ thống) và `o37t8n0qb2` "bài khóa".
- 5 item: 4 trong Mistake, 1 trong "bài khóa".
- Cả 5 item đều có `source_lesson_id = NULL`. Không có item mồ côi.

### `PRAGMA foreign_keys` — CASCADE có chạy không?

- Code không có `PRAGMA foreign_keys` nào (grep `src/`, `scripts/`).
- Nhưng **`better-sqlite3` 13.0.3 được biên dịch với `SQLITE_DEFAULT_FOREIGN_KEYS=1`** (`node_modules/better-sqlite3/deps/defines.gypi:14`). Mở DB bằng `better-sqlite3` thì `db.pragma('foreign_keys')` trả **1** (đã kiểm tra, chế độ readonly). CLI `sqlite3` thì trả 0.
- Kết luận: **trong app, FK đang bật**. `ON DELETE CASCADE` của `note_items.folder_id` có chạy, nên xoá folder sẽ xoá item bên trong.
  - Nhận định "`PRAGMA foreign_keys` đang tắt" trong `docs/db/DESIGN.md:22` chỉ đúng khi mở DB bằng CLI `sqlite3`, không đúng với runtime của app.
- Hệ quả khác của FK bật: `POST /api/notes/items` với `folderId` không tồn tại sẽ vi phạm FK. `INSERT` ném lỗi và route không try/catch, nên trả 500. Kết luận này suy ra từ code, chưa chạy thử.

## Logic chi tiết

- **Folder Mistake**:
  - `MISTAKE_FOLDER_ID = 'mistake'` (`db.ts:555`). Được seed nếu chưa có, mỗi lần gọi `ensureNoteTables` (`:595-600`).
  - `renameNoteFolder` / `deleteNoteFolder` có điều kiện `AND is_system = 0` (`:630, :636`), nên với Mistake chúng im lặng không làm gì.
  - Trên UI, nút sửa/xoá bị ẩn với folder hệ thống (`notes/[id]/page.tsx:194`).
- **Thứ tự folder**: `ORDER BY is_system DESC, created_at ASC` (`db.ts:613`). Mistake luôn đứng đầu.
- **Chống trùng**:
  - Theo `(folder_id, zh)`, **chỉ chữ Hán, không xét pinyin** (`db.ts:649-650`). Vì vậy 行 xíng và 行 háng không thể cùng nằm trong một folder.
  - Trùng thì không cập nhật `py/vn/pos`; trả item cũ bằng cách tải **toàn bộ** item của folder rồi `find` (`:650`).
  - DB không có ràng buộc UNIQUE.
- **ID**:
  - Folder và item đều dùng `Math.random().toString(36).slice(2, 12)` (`db.ts:621, :651`), tối đa 10 ký tự.
  - Không kiểm tra trùng. Nếu trùng thì PK conflict, ném lỗi và trả 500.
- **Tên folder**: server `trim()` (`db.ts:623, :630`). Không giới hạn độ dài, không chống trùng tên.
- **Xoá**: hard delete, không có thùng rác hay undo. Xoá folder thì item bị xoá theo nhờ CASCADE (FK bật, xem trên).

### Chế độ ôn tập trong `/notes/[id]`

Có 3 trạng thái `mode` (`notes/[id]/page.tsx:24-25`):

| `mode` | Vào bằng | Hành vi |
|---|---|---|
| `null` (mặc định) | — | Lưới card, phân trang 24 từ/trang (`:42, :250-252`). Mỗi card có nút xoá và nút sang bài học |
| `'select'` | "Chọn từ" | Bấm card để chọn/bỏ. Có "Chọn tất cả", "Xoá" (≥1 từ), "测 Kiểm tra" (≥2 từ). **Hiện tất cả item, không phân trang** (`:252`) |
| `'quiz-pick'` | "测 Tạo bài kiểm tra" (cần ≥2 từ) | Chọn sẵn tất cả item, rồi "Bắt đầu →" (≥2 từ) |

Bắt đầu kiểm tra → `noteItemToVocabCard` (`:20-22`; `ex` rỗng, `botu` rỗng) → `<QuizMode vocab=… speak=… />` (`:108-117`, không có `lessonId`).

QuizMode (`src/app/lesson/[id]/QuizMode.tsx`):
- Chỉ có câu hỏi **trắc nghiệm** (`type: 'multiple'`), hai chiều `zh-to-vn` / `vn-to-zh`.
- Số câu: 10 / 20 / 30 / Tất cả, chỉ hiện các mức ≤ số từ (`:31, :47-50`).
- Mỗi câu có 1 đáp án đúng và tối đa 3 phương án nhiễu, lấy ngẫu nhiên từ chính tập từ đã chọn (`:52-63`). Có 2 từ thì chỉ có 2 phương án.
- Trả lời sai → tự thêm vào Mistake (xem Luồng).

## Trạng thái phía client

| Thành phần | State | Ghi chú |
|---|---|---|
| `/notes` | `folders`, `creatingFolder`, `newFolderName` | |
| `/notes/[id]` | `folder`, `items`, `loading`, `renamingId`, `renameVal`, `confirmDeleteFolder`, `quizVocab`, `mode`, `selected: Set`, `confirmDeleteSelected`, `confirmDeleteItem`, `notesPage` | Cập nhật lạc quan sau khi xoá: lọc `items` và giảm `itemCount` |
| `NoteModal` | `folders`, `selectedId`, `creating`, `newName`, `saving`, `saved` | |
| `QuizMode` | `savedMistakeIds: Map<zh, itemId>`, `deletedMistakes: Set<zh>` | Reset mỗi lần bắt đầu quiz |

Không dùng localStorage, không cache. Mọi màn hình đều fetch lại khi mount.

## Script liên quan

Không có script nào ghi `note_*`. Bảng được tạo lười trong `db.ts` lần đầu một API note được gọi.

## Vấn đề phát hiện

1. **NoteModal mặc định chọn folder Mistake** (`NoteModal.tsx:18` + `db.ts:613`). Người dùng bấm "Lưu" ngay thì từ rơi vào Mistake, là folder đáng lẽ chỉ chứa từ làm sai.
2. **NoteModal không kiểm tra response** (`NoteModal.tsx:35-42`). Server lỗi (400/500) vẫn hiện "✓ Đã lưu". Từ đã có trong folder cũng hiện "Đã lưu" mà không báo trùng.
3. **Chống trùng theo `zh` bỏ qua pinyin và nghĩa** (`db.ts:649`). Lưu lại cùng chữ Hán với nghĩa khác thì bị bỏ qua, dữ liệu cũ giữ nguyên.
4. **Nút "Xoá khỏi Mistake" có thể xoá item có từ trước.** Khi quiz sai một từ đã có trong Mistake, `addNoteItem` trả id của item cũ (`db.ts:650`) và QuizMode lưu id đó (`QuizMode.tsx:95`). Bấm "Xoá" sẽ xoá bản ghi cũ, kể cả bản ghi có `source_lesson_id`.
5. **Quiz trong trang notes không truyền `lessonId`** (`notes/[id]/page.tsx:113`). Từ sai được thêm vào Mistake với `source_lesson_id = NULL`, nên mất link về bài học. Item gốc ở folder nguồn vẫn có `sourceLessonId`.
6. **Quay lại sau quiz không tải lại danh sách** (`notes/[id]/page.tsx:112`). Nút chỉ chạy `setQuizVocab(null)`. Nếu đang ở folder Mistake và xoá từ trong màn hình kết quả quiz, hoặc quiz thêm từ mới vào Mistake, lưới hiển thị sẽ cũ cho tới khi reload.
7. **Đọc bài (`LessonReader`) không truyền nguồn** (`LessonReader.tsx:194`, kiểu `noteWord` không có `sourceLessonId`). Thêm nữa, `vn`/`pos` lấy từ `/api/search`, tức kết quả khớp `zh` chính xác, nếu không có thì **lấy kết quả đầu tiên** (`:207`). Vì vậy ghi chú có thể lưu nghĩa của một từ khác (ví dụ một từ ghép chứa chữ đó). Pinyin lấy từ MB (`mā ma`), có thể khác format với pinyin bài HSK (`māma`).
8. **Link "Đi đến bài học" không mở đúng trang danh sách.** `?mode=list&word=` chỉ đặt `idx` (`lesson/[id]/page.tsx:343-346`). Chế độ list phân trang theo `listPage`, luôn bắt đầu từ trang 1 (`:333, :529`). Từ nằm ngoài trang 1 sẽ không hiện ra.
9. **`/notes/[id]` với id không tồn tại** vẫn render, hiện tên "…" và danh sách rỗng. Code không xử lý lỗi (`:48-49`).
10. **Không có API lấy một folder.** `/notes/[id]` tải toàn bộ folder rồi tìm ở client (`:44-51`). Query string `folderId` không được `encodeURIComponent` (`:55`). Hiện tại vô hại vì id là base36.
11. **Xoá nhiều = N request DELETE song song** (`:94`). Không có endpoint xoá hàng loạt, không kiểm tra lỗi từng request.
12. **Rename gửi thừa request**: `onKeyDown Enter` và `onBlur` đều gọi `renameFolder` (`:184-185`). Có gửi 2 lần PATCH hay không còn tuỳ việc blur có bắn khi input bị unmount — chưa xác minh.
13. **`PATCH`/`DELETE` folder hệ thống vẫn trả `{ok:true}`** dù không có gì thay đổi (`api/notes/folders/[id]/route.ts`).
14. **`ensureNoteTables` chạy DDL + `SELECT` seed ở mọi lời gọi** (`db.ts:575-601`), kể cả mỗi lần đọc. Phần MB lessons đã có `WeakSet` để chỉ chạy DDL một lần mỗi connection, phần note thì chưa.
15. **`pos` không đồng nhất giữa các nguồn.** Dữ liệu thật: item trong Mistake có `pos` = `n`, `adj`, `v/n`; item trong "bài khóa" có `pos` = `Danh từ`. Không rõ 4 item Mistake được tạo từ màn hình nào — chưa xác minh.

## Ảnh hưởng khi chuyển DB v4

1. **`addNoteItem` đổi chữ ký**: nhận `{folderId, wordId, senseId?, sourcePassageId?}` thay cho `zh/py/vn/pos`. Mọi chỗ gọi phải gửi `word_id`:
   - `NoteModal.tsx:38`;
   - `QuizMode.tsx:93`;
   - các component cha cung cấp `word`: `lesson/[id]/page.tsx:580`, `LessonReader.tsx:150`.

   Dữ liệu client phải mang `wordId`/`senseId`:
   - vocab bài học → `words.id`/`word_senses.id`;
   - token bài khoá → `tokens[].s` (sense id) theo `docs/db/DESIGN.md`.
2. **Chống trùng** chuyển sang `UNIQUE(folder_id, word_id)`. Nên dùng `INSERT … ON CONFLICT(folder_id, word_id) DO NOTHING RETURNING` (hoặc SELECT lại), bỏ phần tải toàn folder ở `db.ts:650`.
   - Lưu ý: UNIQUE theo `word_id` chứ không theo `sense_id`. Không thể lưu hai nghĩa khác nhau của cùng một từ vào cùng folder, giống hành vi hiện tại.
3. **`getNoteItems` phải JOIN** `words` (+ `word_senses`, `parts_of_speech`) để trả `zh/py/vn/pos`.
   - Khi `sense_id IS NULL` cần luật chọn nghĩa hiển thị, ví dụ sense `position` nhỏ nhất. Luật này chưa có trong thiết kế.
   - Giữ nguyên shape `NoteItem` thì UI `notes/[id]` và `noteItemToVocabCard` không phải sửa.
4. **`source_lesson_id` → `source_passage_id` không cùng nghĩa.**
   - `source_lesson_id` hiện chứa `lessons.id`, tức bài HSK/bài chủ đề (được truyền từ `lesson/[id]` và `QuizMode`).
   - `passages` là bài khoá Mandarin Bean, còn `LessonReader` lại **không** truyền nguồn.
   - Hiện 5/5 dòng là NULL nên migrate không mất dữ liệu. Nhưng code mới cần quyết định: link "→" (`notes/[id]/page.tsx:296-303`) trỏ về đâu khi bảng `lessons` bị bỏ, và có truyền `passage_id` từ `LessonReader` hay không.
5. **FK `note_items.word_id REFERENCES words(id)` không có `ON DELETE`.** Xoá một từ đang có trong ghi chú sẽ bị chặn (FK bật). Cần quyết định hành vi.
6. Dùng `better-sqlite3` thì FK đã bật mặc định. `PRAGMA foreign_keys = ON` trong `schema.sql` vẫn nên giữ để script/CLI có cùng hành vi. Cần sửa câu ở `docs/db/DESIGN.md:22`.
7. Bỏ seed Mistake khỏi đường đọc: seed một lần trong migration, đặt `is_system = 1`.
8. `QuizMode` (dùng chung cho bài học và ghi chú) nhận `VocabCard` có `zh/py/vn/pos`. Khi chuyển sang `word_id`, QuizMode cần thêm `wordId` để POST vào Mistake.
