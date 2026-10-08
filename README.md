# ice-bear is learning — HSK Web

App học tiếng Trung (HSK) cho người Việt: từ vựng, ngữ pháp, đọc bài khoá, luyện nghe/chép chính tả, ghi chú.

Mục lục: [docs/README.md](docs/README.md). Kế hoạch: [cải thiện kiến trúc](docs/plans/architecture-improvement.md).

Kiến trúc đầy đủ (C4, ERD, luồng, route, deploy): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Chạy local

1. Node 22+, Python 3 nếu cần Whisper align.
2. Copy env:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Chỉ cần key này khi **upload `.docx`** (Claude phân tích). Các màn học đọc SQLite local, không gọi AI.

3. Khởi động:

```bash
npm install
npm run dev
```

Mở http://localhost:3000

Database: `data/hsk.db` (gitignore), đổi đường dẫn bằng `DB_PATH`. App yêu cầu file DB v4 có sẵn; không tự tạo DB trống. Cần bản DB hợp lệ hoặc thực hiện quy trình migration từ DB cũ trong [tài liệu migration](docs/migration-plan.md). Không chạy migration dữ liệu trên bản duy nhất chưa backup.

## Tính năng

| Khu | Route | Dữ liệu |
|---|---|---|
| Import bài + flashcard / quiz / ghép thẻ | `/`, `/lesson/[id]` | bảng `lessons` |
| Từ vựng theo HSK | `/vocab/[level]` | `words` / `word_senses` |
| Ngữ pháp trong bài import | `/grammar/[id]` | `lesson_grammar` / `grammar_points` |
| Catalog ngữ pháp Hanzii | `/grammar/hsk/[level]` | `grammar_points` |
| Đọc bài khoá | `/reading/[slug]` | `passages` |
| Luyện nghe / chép | `/dictation/[slug]` | `passages` + audio Mandarin Bean |
| Sửa timestamp câu | `/dictation/align/[slug]` | `passage_sentences` |
| Ghi chú | `/notes` | `note_folders` / `note_items` |

Upload `.docx`: tách mục Từ vựng / Ngữ pháp rồi Claude trả JSON (pinyin, nghĩa Việt, bộ thủ, bài tập). Upload `.xlsx`: parse trực tiếp, không gọi Claude.

## Pipeline dữ liệu (chạy tay)

```bash
npm run crawl              # Mandarin Bean → data/mandarin-bean-lessons.json
npm run import:mb          # JSON → passages trong SQLite
npm run crawl:grammar      # Hanzii grammar → grammar_points
npm run crawl:kanji
python scripts/align-whisper.py --model small   # cần scripts/venv
```

Whisper đọc/ghi mốc audio qua API của app vào `passage_sentences`; app cần đang chạy để căn audio.

## Deploy

Production hiện tại là **VPS + SQLite + PM2**, không phải Vercel: `better-sqlite3` cần filesystem và native addon.

Hướng dẫn hiện tại: [Deploy VPS với SQLite v4](docs/deployment/vps.md). File local `DEPLOY_SQLITE_VPS.md` dùng đường dẫn DB cũ; không dùng các lệnh chép đè/xoá thư mục trong file đó để cập nhật production.

Không chép đè DB local lên production đang nhận ghi chú/chỉnh sửa. Quy trình backup/restore và import nội dung an toàn đang được chuẩn hoá trong kế hoạch; tài liệu deploy cũ cần được đối chiếu trước khi sử dụng.

## Kiểm tra tự động

```bash
npm test
npm run typecheck
npm run lint
```

Xem [hướng dẫn kiểm thử](docs/development/testing.md). CI chạy các bước trên khi push/PR; build và E2E sẽ được bổ sung với DB fixture riêng.
