# Logic tính năng — HSK Web

## Kế hoạch tính năng mới

- [Luyện từ vựng hai hướng — v1](vocabulary-practice/README.md): nhìn chữ Hán (nhập pinyin có số thanh hoặc gõ Hán tự) và nhìn nghĩa tiếng Việt → gõ Hán tự. Có kế hoạch chi tiết và lịch sử phiên bản; **chưa triển khai**.

## Tài liệu hiện có

> **Lưu ý (2026-10-03):** các file trong thư mục này mô tả code **trước** DB v4 (`src/lib/db.ts`, các bảng `lessons`/`kanji`/`mb_lessons`…). Kiến trúc hiện tại ở [../ARCHITECTURE.md](../ARCHITECTURE.md) và [../data-layer.md](../data-layer.md). Phần "Vấn đề phát hiện" vẫn hữu ích; tình trạng sửa từng lỗi ghi ở [../migration-plan.md](../migration-plan.md) (P7).

Mỗi file mô tả một tính năng theo cùng một mẫu:
- Mục đích
- Màn hình & route
- Luồng xử lý
- API
- Dữ liệu (DB cũ → DB v4)
- Logic chi tiết
- Trạng thái client
- Script liên quan
- Vấn đề phát hiện
- Ảnh hưởng khi chuyển DB v4

Code được đọc ngày 2026-10-01, các số liệu đo trên `data/lessons.db`. Thiết kế DB mới nằm ở [../db/](../db/).

| Tính năng | File | Route chính |
|---|---|---|
| Điều hướng, sơ đồ route toàn app | [navigation.md](navigation.md) | `/`, sidebar |
| Học từ vựng theo bài (flashcard, quiz, match) | [lesson-study.md](lesson-study.md) | `/lesson/[id]` |
| Tạo bài từ file `.docx` / `.xlsx` (Claude sinh nội dung) | [lesson-upload.md](lesson-upload.md) | `POST /api/upload` |
| Chi tiết chữ Hán & nét viết | [kanji.md](kanji.md) | `/api/kanji/[char]` |
| Từ vựng theo cấp & tìm kiếm | [vocab-search.md](vocab-search.md) | `/vocab/[level]`, `/api/search` |
| Ngữ pháp | [grammar.md](grammar.md) | `/grammar/hsk/[level]`, `/grammar/[id]` |
| Ghi chú | [notes.md](notes.md) | `/notes`, `/notes/[id]` |
| Đọc bài khóa | [reading.md](reading.md) | `/reading`, `/reading/[slug]` |
| Chép chính tả | [dictation.md](dictation.md) | `/dictation`, `/dictation/[slug]` |
| Căn chỉnh audio theo câu | [dictation-align.md](dictation-align.md) | `/dictation/align` |
| Pipeline dữ liệu Mandarin Bean | [mandarin-bean-pipeline.md](mandarin-bean-pipeline.md) | scripts |

## Lỗi quan trọng nhất (đã xác minh trong code)

| # | Lỗi | Tính năng | Chi tiết |
|---|---|---|---|
| 1 | Chấm chép chính tả bị lệch khi gõ thiếu chữ giữa câu. Hàm thật là `matchDictationWords`; `diffHanzi` không được dùng | Chép chính tả | [dictation.md](dictation.md) |
| 2 | Ngoặc kép cong `“ ” ‘ ’` không được coi là dấu câu: 799 câu bắt người học gõ chúng, các ký tự này bị tính vào `vocab_count` và thành từ bấm được | Chép chính tả, Đọc bài | [dictation.md](dictation.md) |
| 3 | Chạy lại `import-mandarin-bean.mjs` ghi đè dữ liệu câu đã tách, làm mốc audio trỏ sai câu và mất trạng thái Checked | Pipeline | [mandarin-bean-pipeline.md](mandarin-bean-pipeline.md) |
| 4 | Trạng thái Checked/Uncheck có 2 định nghĩa mâu thuẫn, không code nào ghi nó; 3 bài đang lệch | Căn audio | [dictation-align.md](dictation-align.md) |
| 5 | 69% từ vựng là "Danh từ" do script `fill-pos-local.mjs:262` gán mặc định | Upload | [lesson-upload.md](lesson-upload.md) |
| 6 | Ô "Phổ biến" trong panel chữ luôn hiện "Thấp" (so chuỗi với số) | Chữ Hán | [kanji.md](kanji.md) |
| 7 | Panel chi tiết chữ bỏ qua dữ liệu nét trong DB, luôn tải từ CDN; thư viện có thể bị nạp 2 lần | Chữ Hán | [kanji.md](kanji.md) |
| 8 | Ngữ pháp Hanzii mất ~709 dòng nội dung cấu trúc; `formula` trùng `title` ở 1.727/1.734 điểm | Ngữ pháp | [grammar.md](grammar.md) |
| 9 | Popup tra từ trong bài khóa lấy kết quả đầu tiên khi không khớp chính xác, có thể lưu nghĩa sai vào ghi chú | Đọc bài, Ghi chú | [vocab-search.md](vocab-search.md) |
| 10 | `NoteModal` báo "Đã lưu" cả khi lỗi; chống trùng bỏ qua pinyin | Ghi chú | [notes.md](notes.md) |
| 11 | Trang chép chính tả crash khi API trả lỗi (không kiểm tra `res.ok`) | Chép chính tả | [dictation.md](dictation.md) |
| 12 | UI căn audio không gửi pinyin khi lưu, nên pinyin sửa tay bị mất | Căn audio | [dictation-align.md](dictation-align.md) |

## Code thừa

| Code | Ghi chú |
|---|---|
| `diffHanzi` | Không được gọi ở đâu |
| `updateKanjiBotu` | Không được gọi ở đâu |
| `getHanziiGrammarCount` | Không được gọi ở đâu |
| `src/app/api/generate-grammar/` | Thư mục rỗng |
| `/lessons` + `src/lib/lessons.ts` | Đọc file JSON thô, không có link nào trong app trỏ tới |
