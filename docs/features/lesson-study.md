# Học từ vựng theo bài (`/lesson/[id]`)

## Mục đích

Cho người học ôn danh sách từ vựng của một "bài" trong bảng `lessons` theo 4 chế độ: Danh sách, Flashcard, Kiểm tra (trắc nghiệm), Ghép thẻ. Từ trang này có thể tra chữ Hán (panel Hán tự, xem [kanji.md](kanji.md)) và lưu từ vào ghi chú.

"Bài" hiện có 12 dòng trong `lessons` (đo trên DB ngày 2026-10-01):
- 6 bài danh sách từ theo cấp `HSK1`…`HSK6` (149 / 150 / 295 / 600 / 1.295 / 2.513 từ, 0 ngữ pháp), tạo từ file Excel.
- 6 bài tạo từ `.docx` qua Claude (4–17 từ, 1–3 điểm ngữ pháp), đều có `level = HSK2`.

> **Không liên quan:** `src/app/lessons/page.tsx`, `src/app/lessons/[slug]/page.tsx`, `SearchBar.tsx` và `src/lib/lessons.ts` là trang **bài đọc Mandarin Bean** cũ (đọc file `data/mandarin-bean-lessons.json`, không đọc DB). Không có link nào trong app dẫn tới `/lessons` (xem [navigation.md](navigation.md)). Thuộc phạm vi reading, không mô tả ở đây.

## Màn hình & route

| Route | File | Ghi chú |
|---|---|---|
| `/lesson/[id]` | `src/app/lesson/[id]/page.tsx` | Client component. `id` = `lessons.id` (nanoid 12 ký tự) |
| `?mode=list\|flash\|quiz\|match` | `page.tsx:323-326` | Giá trị khác hoặc không có → `flash` |
| `?word=<hanzi>` | `page.tsx:337-346` | Đặt thẻ đang xem = vị trí đầu tiên có `zh === word` |

Thành phần:
- Header cố định (`page.tsx:406-468`): link "← Về" `/`, tiêu đề, "N từ · M ngữ pháp · level", 4 tab chế độ, link `/grammar/[id]`, link `/notes`, nút xáo trộn (chỉ ở flash), thanh tiến độ (chỉ ở flash).
- `QuizMode` (`src/app/lesson/[id]/QuizMode.tsx`), `MatchGame` (`src/app/lesson/[id]/MatchGame.tsx`).
- `VocabListCard` (`src/app/components/VocabListCard.tsx`), `Pagination` (`src/app/components/Pagination.tsx`).
- `KanjiPanel`, `CharStroke`, `WordStroke` (`page.tsx:77-282`), mô tả ở [kanji.md](kanji.md).
- `NoteModal` (`src/app/components/NoteModal.tsx`).

Các nơi dẫn vào trang: thẻ bài ở trang chủ (`src/app/page.tsx:13-17`), sidebar (`GlobalShell.tsx:34-40`), kết quả tìm kiếm sidebar (`GlobalShell.tsx:239`), `/vocab/[level]` (`src/app/vocab/[level]/page.tsx:98`, `mode=flash&word=`), ghi chú (`src/app/notes/[id]/page.tsx:297`, `mode=list&word=`), trang ngữ pháp bài (`src/app/grammar/[id]/page.tsx:178`).

## Luồng xử lý

1. Mở `/lesson/[id]` → `useEffect` gọi `GET /api/lessons/[id]` (`page.tsx:336-348`).
2. API gọi `getLesson(id)` (`src/app/api/lessons/[id]/route.ts:6-11`) → `SELECT * FROM lessons WHERE id = ?`, `JSON.parse(data)` (`src/lib/db.ts:45-62`).
3. `getLesson` **ghi DB khi đọc**: vocab nào thiếu `id` thì sinh id ngẫu nhiên 10 ký tự và `UPDATE lessons SET data` (`db.ts:51-60`). Hiện 0/5.067 vocab thiếu id nên không ghi.
4. Client đặt `lesson`, `queue = lesson.vocab` (thứ tự gốc); nếu có `?word=` thì đặt `idx`.
5. Người dùng chọn chế độ → `switchMode` (`page.tsx:367-370`): reset `idx=0`, `flipped=false`, đóng panel Hán tự; vào flash thì dựng lại `queue` (xáo hoặc không theo `shuffled`).
6. Bấm 📝 (flash: `page.tsx:481`; list: `page.tsx:545`) → mở `NoteModal` → `GET /api/notes/folders` → chọn/tạo folder → `POST /api/notes/items` (`NoteModal.tsx:15-43`) → `addNoteItem` ghi `note_items` (`db.ts:646-657`).
7. Quiz: trả lời sai → tự `POST /api/notes/items` vào folder hệ thống `mistake` (`QuizMode.tsx:87-97`); nút "🗑 Xoá" ở màn kết quả → `DELETE /api/notes/items/[id]` (`QuizMode.tsx:214-219`).
8. Match: kỷ lục thời gian ghi `localStorage` (`MatchGame.tsx:43-52, 123-134`), không gọi API.
9. Bấm một chữ Hán trên flashcard → mở `KanjiPanel` → `GET /api/kanji/[char]` (xem [kanji.md](kanji.md)).

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/lessons` | — | `{lessons: LessonMeta[]}` (không có vocab/grammar, có `vocabCount`, `grammarCount`), sắp `created_at DESC` | `src/app/api/lessons/route.ts`, `db.ts:33-43` |
| GET | `/api/lessons/[id]` | `id` | `{lesson: Lesson}` hoặc 404 `{error}` | `src/app/api/lessons/[id]/route.ts:6-11` |
| DELETE | `/api/lessons/[id]` | `id` | `{ok: true}` (luôn ok, kể cả id không tồn tại) | `src/app/api/lessons/[id]/route.ts:13-17` |
| GET | `/api/notes/folders` | — | `{folders}` (folder `mistake` luôn được tạo nếu thiếu) | `src/app/api/notes/folders/route.ts` |
| POST | `/api/notes/folders` | `{name}` | `{folder}` | như trên |
| POST | `/api/notes/items` | `{folderId, zh, py, vn, pos, sourceLessonId}` | `{item}`; nếu `(folderId, zh)` đã có thì trả item cũ | `src/app/api/notes/items/route.ts:12-18` |
| DELETE | `/api/notes/items/[id]` | `id` | `{ok: true}` | `src/app/api/notes/items/[id]/route.ts:6-10`, `db.ts:659-663` |
| GET | `/api/kanji/[char]` | `char` | xem [kanji.md](kanji.md) | |

## Dữ liệu

Kiểu `Lesson`, `VocabCard`, `BotuBlock`, `BotuPart` ở `src/types/index.ts:1-60`.

| Dùng ở UI | DB cũ | DB mới v4 |
|---|---|---|
| Danh sách bài, tiêu đề, cấp | `lessons.id, title, subtitle, level, topic, created_at` | **Không còn bảng `lessons`.** Bài HSK1–6 → lọc `words.hsk_level`; 3 bài chủ đề → `words.topic`; 3 bài ngữ pháp → mất cách nhóm (DESIGN.md §4.2, README §3) |
| `vocab[].zh`, `py` | `lessons.data` JSON | `words.hanzi`, `words.pinyin` |
| `vocab[].pos` | JSON, text tự do tiếng Việt | `word_senses.pos` → `parts_of_speech.name_vi` |
| `vocab[].vn` | JSON | `word_senses.meaning_vi` |
| `vocab[].ex.zh/vn` | JSON | `sense_examples.zh`, `vi` |
| `vocab[].botu[]` (theo từng chữ) | JSON | `word_characters` → `character_components` (`role` meaning/sound/self ↔ `t` y/am/solo, `note` ↔ `n`, `component` ↔ `ph`) |
| `vocab[].id` | JSON, id ngẫu nhiên | `words.id` hoặc `word_senses.id` (cần chọn) |
| Số ngữ pháp, link `/grammar/[id]` | `lessons.data.grammar[]` | `grammar_points` (`source='ai'`) |
| Ghi chú | `note_items(zh, py, vn, pos, source_lesson_id)` | `note_items(word_id, sense_id, source_passage_id)` |

## Logic chi tiết

### Chế độ Danh sách (`mode=list`, `page.tsx:527-565`)
- Phân trang client 20 từ/trang (`LIST_PAGE_SIZE`, `page.tsx:334`) trên `lesson.vocab` theo thứ tự gốc, không theo `queue`.
- Mỗi dòng là `VocabListCard` hiển thị zh, py, pos, vn, ví dụ; nút 🔊 phát âm; nút 📝 lưu ghi chú. **Không hiển thị bộ thủ, không bấm được chữ để tra.**
- Bấm một dòng → `queue = lesson.vocab` (thứ tự gốc), `idx` = vị trí tuyệt đối, chuyển sang flash (`page.tsx:542`).

### Chế độ Flashcard (`mode=flash`, mặc định, `page.tsx:474-524`)
- Thứ tự: `queue` = thứ tự gốc trong JSON; nút 🔀 xáo Fisher–Yates (`page.tsx:361-365, 448-451`) và đưa về thẻ 1. Bấm lại 🔀 bỏ xáo.
- Mặt trước: từ loại, chữ Hán (mỗi chữ CJK bấm được → panel Hán tự), pinyin, hoạt ảnh nét viết từng chữ (`WordStroke`), nút 🔊, nút 📝, cấp bài.
- Mặt sau: pinyin, từ loại, chữ Hán (bấm được), nghĩa `vn`, **bộ thủ** (`renderBotu(card.botu)`), ví dụ.
- Điều hướng: nút ‹ ›, `←`/`→`, dừng ở đầu/cuối (không vòng lại). Lật: click thẻ, nút "Lật thẻ", `Space`/`Enter`. `P` phát âm, `Esc` đóng panel Hán tự (`page.tsx:372-391`).
- Phát âm: Web Speech API, `lang='zh-CN'`, `rate=0.85`, chọn giọng `zh-CN` nếu có (`page.tsx:350-359`).
- "Chữ CJK" = mã `0x4E00–0x9FFF` (`page.tsx:39, 125`); chữ ngoài khoảng này (vd. Extension A) không bấm được và không có hoạt ảnh nét.

### Bộ thủ (botu) trên flashcard
- Nguồn: **trường `botu` của chính vocab trong `lessons.data`**, không đọc bảng `kanji` (`page.tsx:495`).
- Cấu trúc: mảng `BotuBlock {char, parts: BotuPart[]}`, mỗi part `{t: 'y'|'am'|'solo', ph, n}` (`src/types/index.ts:1-10`).
- Hiển thị (`renderBotu`, `page.tsx:14-34`): mỗi chữ một khối; mỗi thành phần một dòng: nền vàng + "ý·" cho `y`, nền xanh + "âm·" cho `am`, nền xám + "độc·" cho `solo`; kèm `ph` và chú thích `n`.
- Từ có chữ lặp (爸爸) có 2 khối giống nhau, không gộp.
- Từ không có `botu` thì để trống. Hiện 2.836/5.067 vocab có botu (HSK1 143/149 … HSK6 1.233/2.513; 6 bài docx đủ 100%).
- Bài tạo từ Excel được ghi `botu: []` (`src/lib/parse-docx.ts:80`), nhưng DB hiện có botu cho nhiều từ HSK. **Script nào đã điền botu cho các bài HSK: chưa xác minh** (không có script nào trong repo hay trong git log ghi trường này).
- Panel Hán tự có phần "Phân tích bộ thủ" riêng, lấy từ `kanji.botu_claude`/`kanji.botu` (xem [kanji.md](kanji.md)).

### Chế độ Kiểm tra (`mode=quiz`, `QuizMode.tsx`)
- Cấu hình: hướng `zh-to-vn` (xem chữ chọn nghĩa) hoặc `vn-to-zh` (xem nghĩa chọn chữ, có pinyin dưới mỗi lựa chọn); số câu 10/20/30 (chỉ những mức ≤ số từ) hoặc "Tất cả" (`QuizMode.tsx:31, 47-50`).
- Sinh đề (`QuizMode.tsx:52-63`): xáo toàn bộ vocab, lấy `n` từ đầu. Mỗi câu 4 lựa chọn: đáp án + 3 từ sai lấy ngẫu nhiên từ các từ có `zh` khác; xáo lựa chọn.
- Chấm: so **chuỗi** lựa chọn với `card.vn` (hoặc `card.zh`) (`QuizMode.tsx:85-86`). Chỉ trả lời 1 lần/câu. Sau khi chọn: hiện đáp án đúng (xanh), lựa chọn sai (đỏ), phát âm từ.
- Sai → thêm vào `missed`, tự lưu vào folder `mistake` (`QuizMode.tsx:87-97`).
- `Enter`/`Space` sang câu sau khi đã trả lời (`QuizMode.tsx:113-120`).
- Kết quả: điểm `correct/total`, phần trăm, thời gian (giây, từ lúc bắt đầu tới câu cuối); nhãn 完美！ ≥ 90%, 不错！ ≥ 70%, còn lại 加油！ (`QuizMode.tsx:183-184`). Danh sách "Cần ôn lại" có nút xoá khỏi Mistake.
- Không có chế độ tự luận dù interface có `type: 'multiple'` (`QuizMode.tsx:18`). Prop `onMistake` không được trang truyền vào.

### Chế độ Ghép thẻ (`mode=match`, `MatchGame.tsx`)
- Xáo toàn bộ vocab một lần khi bắt đầu, chia vòng 6 cặp (`PAIR_COUNT`, `MatchGame.tsx:26, 63-81`); số vòng = `ceil(n/6)`. HSK6 (2.513 từ) = 419 vòng.
- Mỗi vòng: 12 thẻ (6 chữ + 6 nghĩa) xáo trộn, lưới 3 cột nếu ≤ 3 cặp, ngược lại 4 cột.
- Luật (`MatchGame.tsx:100-144`): chọn thẻ 1, rồi thẻ 2. Đúng khi cùng `pairId` (= `vocab.id`) và khác loại → ẩn cặp. Sai → tô đỏ 700 ms, bỏ chọn. Bấm lại thẻ đang chọn để bỏ chọn. Hai thẻ cùng loại tính là sai.
- Thời gian: đồng hồ từng vòng (cập nhật 500 ms); tổng = cộng thời gian các vòng (thời gian ở màn "Vòng tiếp" không tính).
- Kỷ lục: chỉ ghi khi hoàn thành **tất cả** vòng; ghi nếu chưa có hoặc nhỏ hơn kỷ lục cũ.

## Trạng thái phía client

| State | Nơi | Ý nghĩa |
|---|---|---|
| `lesson`, `queue`, `idx`, `flipped`, `shuffled` | `page.tsx:322-330` | Bài, thứ tự thẻ, thẻ hiện tại, lật, có xáo |
| `mode` | `page.tsx:323-326` | Khởi tạo từ `?mode=`; đổi tab **không** cập nhật URL |
| `kanjiChar`, `noteWord`, `listPage` | `page.tsx:331-333` | Panel Hán tự, modal ghi chú, trang danh sách |
| Quiz: `step`, `count`, `direction`, `questions`, `missed`, `correct`, `savedMistakeIds`, `deletedMistakes` | `QuizMode.tsx:34-46` | Mất khi đổi tab |
| Match: `cards`, `selected`, `matched`, `wrong`, `gameState`, `round`, refs thời gian | `MatchGame.tsx:29-42` | Mất khi đổi tab |
| `localStorage['match-hs-<lessonId>']` | `MatchGame.tsx:43` | Kỷ lục ghép thẻ (giây). Thứ duy nhất được lưu bền phía client |
| Biến module `_hwPromise` | `page.tsx:61` | Cache promise tải HanziWriter |

Không có lưu tiến độ học (thẻ đã thuộc, lần ôn) ở client hay DB.

## Script liên quan

- `scripts/fill-pos-local.mjs`, `scripts/fill-pos.mjs`: điền `vocab[].pos` (xem [lesson-upload.md](lesson-upload.md)).

## Vấn đề phát hiện

1. **`getLesson` ghi DB khi đọc** (`db.ts:51-60`): GET có side effect `UPDATE lessons`. Hiện không kích hoạt vì mọi vocab đã có id.
2. **`?word=` không có tác dụng ở chế độ list**: link từ ghi chú `?mode=list&word=…` (`notes/[id]/page.tsx:297`) chỉ đặt `idx` (`page.tsx:343-346`), còn list dùng `listPage` (luôn 1). Người dùng không được đưa tới từ đó.
3. **Trạng thái xáo sai sau khi bấm từ ở list**: `page.tsx:542` đặt `queue` theo thứ tự gốc nhưng không reset `shuffled`, nên nút 🔀 vẫn hiện "đang xáo".
4. **Phím Space/Enter trong `NoteModal` bị flashcard bắt** (suy từ code, chưa chạy thử): handler ở `page.tsx:378-383` xử lý Space/Enter **trước** khi kiểm tra `isInteractive`, và luôn `preventDefault` + `blur`. Khi mở NoteModal từ flash, ô "Tên folder mới" (`NoteModal.tsx:76`) không gõ được dấu cách; Enter vừa tạo folder vừa lật thẻ.
5. **Nghĩa trùng làm quiz/match sai**: số nhóm `vn` trùng trong cùng bài: HSK1 2, HSK2 1, HSK3 6, HSK4 17, HSK5 34, HSK6 64. Quiz: hai lựa chọn có thể giống hệt nhau (React `key={c}` trùng, `QuizMode.tsx:300`) và đều được tô "đúng"; `vn-to-zh` có thể có 2 chữ cùng nghĩa trong 4 lựa chọn mà chỉ 1 được tính đúng. Match: hai thẻ nghĩa giống nhau nhưng chỉ khớp theo `pairId`.
6. **Quiz xoá nhầm ghi chú cũ**: `addNoteItem` trả lại item đã có nếu `(folder, zh)` trùng (`db.ts:649-650`), nên nút "Xoá khỏi Mistake" (`QuizMode.tsx:214-219`) xoá cả ghi chú lỗi đã lưu từ các lần trước.
7. Match với HSK5/HSK6: 216/419 vòng, kỷ lục chỉ ghi khi chơi hết; thực tế gần như không đạt được.
8. `DELETE /api/lessons/[id]` không xoá note liên quan, không kiểm tra tồn tại (`route.ts:13-17`). `note_items.source_lesson_id` không có FK.
9. Thanh tiến độ flash chia cho `queue.length`; bài 0 từ cho `NaN%` (`page.tsx:465`). Bài 0 từ hiện không có trong DB.
10. Kiểu `Lesson` bị định nghĩa 2 lần với nghĩa khác nhau: `src/types/index.ts:51` (bài từ vựng) và `src/types/lesson.ts:11` (bài Mandarin Bean).
11. Code thừa: `onMistake` prop và `type: 'multiple'` chỉ có một giá trị (`QuizMode.tsx:18, 27`).

## Ảnh hưởng khi chuyển DB v4

1. **Không còn `lessons` → phải định nghĩa lại "bài"**. Đề xuất ánh xạ: `/lesson/hsk-<n>` = `words WHERE hsk_level = n`; `/lesson/topic-<x>` = `words WHERE topic = x`. 3 bài ngữ pháp (4–7 từ) không còn cách nhóm, trừ khi thêm `grammar_points.topic` (README §5).
2. `words.hsk_level` lấy cấp **thấp nhất**: 106 từ nằm ở 2 danh sách sẽ chỉ còn ở cấp thấp hơn, số từ HSK2–6 thay đổi so với hiện nay.
3. Một từ có thể có nhiều `word_senses` (từ loại khác nhau). Phải chọn: 1 thẻ / từ (gộp nghĩa) hay 1 thẻ / nghĩa. Quiz/match nên lấy đơn vị là sense.
4. `VocabCard.botu` phải dựng lại từ `word_characters` + `character_components` (đổi `role` → `t`). Chỉ 643 chữ có phân tích Ý/Âm; 11.263 chữ không có.
5. `VocabCard.id`: `MatchGame` dùng làm `pairId` → thay bằng `word_senses.id` hoặc `words.id`.
6. ID bài thay đổi → các key `localStorage['match-hs-<id>']` cũ mất tác dụng; link `/lesson/<nanoid>` cũ (bookmark) hỏng.
7. `getAllLessons` / `getLesson` / `deleteLesson` (`db.ts:33-74`) viết lại; `GET /api/lessons` cần trả danh sách "bài" ảo + `vocabCount` (đếm `words`), `grammarCount`.
8. Ghi chú: `POST /api/notes/items` đang gửi text `zh/py/vn/pos/sourceLessonId`; v4 cần `word_id` (+ `sense_id`), `source_passage_id` không áp dụng cho bài từ vựng. `UNIQUE(folder_id, word_id)` khớp với logic dedupe hiện tại theo `zh` (nhưng tách 行 xíng / háng).
9. `pos` hiển thị phải map mã (`n`, `v`…) → `parts_of_speech.name_vi`.
