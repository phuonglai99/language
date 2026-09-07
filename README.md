# ice-bear is learning — HSK Web

App học tiếng Trung (HSK) cho người Việt: từ vựng, ngữ pháp, đọc bài khoá, luyện nghe/chép chính tả, ghi chú.

Kiến trúc đầy đủ (C4, ERD, luồng, route, deploy): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Chạy local

1. Node 22+, Python 3 nếu cần Whisper align.
2. Copy env:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Chỉ cần key này khi **upload `.docx`** (Claude phân tích) hoặc chạy `scripts/fill-pos.mjs`. Các màn học đọc SQLite local, không gọi AI.

3. Khởi động:

```bash
npm install
npm run dev
```

Mở http://localhost:3000

Database: `data/lessons.db` (tạo tự động, gitignore). Không có file này thì app vẫn chạy nhưng trống bài đọc / ngữ pháp Hanzii / kanji cache.

## Tính năng

| Khu | Route | Dữ liệu |
|---|---|---|
| Import bài + flashcard / quiz / ghép thẻ | `/`, `/lesson/[id]` | bảng `lessons` |
| Từ vựng theo HSK | `/vocab/[level]` | `lessons.data` |
| Ngữ pháp trong bài import | `/grammar/[id]` | `lessons.data` |
| Catalog ngữ pháp Hanzii | `/grammar/hsk/[level]` | `hanzii_grammar` |
| Đọc bài khoá | `/reading/[slug]` | `mb_lessons` |
| Luyện nghe / chép | `/dictation/[slug]` | `mb_lessons` + audio Mandarin Bean |
| Sửa timestamp câu | `/dictation/align/[slug]` | `sentence_timestamps` |
| Ghi chú | `/notes` | `note_folders` / `note_items` |

Upload `.docx`: tách mục Từ vựng / Ngữ pháp rồi Claude trả JSON (pinyin, nghĩa Việt, bộ thủ, bài tập). Upload `.xlsx`: parse trực tiếp, không gọi Claude.

## Pipeline dữ liệu (chạy tay)

```bash
npm run crawl              # Mandarin Bean → data/mandarin-bean-lessons.json
npm run import:mb          # JSON → mb_lessons trong SQLite
npm run crawl:grammar      # Hanzii grammar → hanzii_grammar
node scripts/crawl-hanzii.mjs
python scripts/align-whisper.py --model small   # cần scripts/venv
```

Whisper ghi `sentence_timestamps` vào `mb_lessons` để dictation tua đúng câu.

## Deploy

Production hiện tại là **VPS + SQLite + PM2**, không phải Vercel: `better-sqlite3` cần filesystem và native addon.

Hướng dẫn từng bước (file local): `DEPLOY_SQLITE_VPS.md`.

Tóm tắt:

```bash
# trên VPS
git pull && npm install && npm run build
pm2 restart hsk-web

# từ máy local, khi chỉ cập nhật dữ liệu
scp data/lessons.db root@VPS:/var/www/hsk-web/data/lessons.db
```
