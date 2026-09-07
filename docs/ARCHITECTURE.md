# Kiến trúc hệ thống — HSK Web

App học tiếng Trung (HSK) cho người Việt: **ice-bear is learning**. Đây là *modular monolith* Next.js, một process, một file SQLite. Không có microservice, queue, hay cache phân tán.

Tài liệu này khớp với code tại thời điểm viết. Khi thêm module mới, cập nhật các sơ đồ dưới đây.

## 1. Bối cảnh hệ thống

Người học dùng trình duyệt. App tự chứa UI, API và database. Bên ngoài chỉ có nguồn nội dung và AI; chúng không nằm trong runtime production trừ khi người dùng upload `.docx` hoặc tra chữ chưa có trong cache.

```mermaid
flowchart LR
  learner["Người học"]
  teacher["Người soạn bài"]
  ops["Người vận hành"]
  app["HSK Web\nNext.js + SQLite"]
  claude["Anthropic Claude"]
  hanzii["Hanzii API"]
  mb["Mandarin Bean"]
  whisper["Whisper local\nPython, offline"]

  learner --> app
  teacher -->|"upload .docx / .xlsx"| app
  ops -->|"crawl, import, align"| app
  app -->|"phân tích bài .docx"| claude
  app -->|"tra chữ Hán + crawl ngữ pháp"| hanzii
  ops -->|"crawl bài đọc + audio URL"| mb
  ops -->|"align audio → câu"| whisper
  whisper -->|"ghi sentence_timestamps"| app
```

| Tác nhân | Việc làm |
|---|---|
| Người học | Flashcard, quiz, ghép thẻ, đọc bài, nghe/chép chính tả, ngữ pháp Hanzii, ghi chú |
| Người soạn bài | Upload `.docx` (Claude tách từ/ngữ pháp) hoặc `.xlsx` (parse trực tiếp) |
| Người vận hành | Crawl Mandarin Bean / Hanzii, import JSON, chạy Whisper align, `scp` file DB lên VPS |

## 2. Containers

Một container ứng dụng, một file dữ liệu, vài pipeline chạy tay.

```mermaid
flowchart TB
  subgraph client ["Trình duyệt"]
    ui["React 19 UI\nApp Router pages + GlobalShell"]
  end

  subgraph next ["HSK Web — Next.js 16"]
    pages["Pages RSC / Client"]
    api["Route Handlers\nruntime nodejs"]
    lib["src/lib\ndb, claude, parse-docx, dictation"]
  end

  subgraph data ["Máy chủ / máy local"]
    sqlite[("data/lessons.db\nbetter-sqlite3")]
    json["data/mandarin-bean-lessons.json\nlegacy, chỉ /lessons"]
  end

  subgraph offline ["Pipeline offline"]
    crawl["scripts/*.mjs\ncrawl + import"]
    align["scripts/align-whisper.py"]
  end

  ui -->|"HTTPS / fetch JSON"| api
  pages --> lib
  api --> lib
  lib --> sqlite
  pages -->|"src/lib/lessons.ts"| json
  crawl --> sqlite
  crawl --> json
  align --> sqlite
```

| Container | Công nghệ | Vai trò |
|---|---|---|
| Web app | Next.js 16, React 19, Tailwind 4 | UI + API trong cùng process |
| SQLite | `better-sqlite3`, file `data/lessons.db` | Nguồn sự thật cho hầu hết dữ liệu |
| JSON Mandarin Bean | `data/mandarin-bean-lessons.json` | Bản crawl thô; route `/lessons` vẫn đọc file này |
| Pipeline Node | cheerio, better-sqlite3 | Crawl / import / điền từ loại |
| Pipeline Python | faster-whisper (venv) | Align audio bài đọc với từng câu Hán |

**Lưu ý kiến trúc:** `/reading` và `/dictation` đọc SQLite (`mb_lessons`). `/lessons` vẫn đọc JSON qua `src/lib/lessons.ts`. Hai đường này chưa gộp.

## 3. Modules trong app Next.js

```mermaid
flowchart TB
  subgraph shell ["Presentation"]
    GS["GlobalShell\nsidebar + search"]
    Home["/  upload + danh sách bài import"]
    Lesson["/lesson/[id]\nflashcard quiz match list"]
    Vocab["/vocab/[level]"]
    GrammarL["/grammar/[id]\nđiểm ngữ pháp từ bài import"]
    GrammarH["/grammar/hsk/[level]\ncatalog Hanzii"]
    Read["/reading/[slug]"]
    Dic["/dictation/[slug]"]
    AlignUI["/dictation/align/[slug]"]
    Notes["/notes/[id]"]
  end

  subgraph handlers ["API Route Handlers"]
    up["POST /api/upload"]
    les["/api/lessons"]
    kan["GET /api/kanji/[char]"]
    gra["GET /api/grammar"]
    readApi["/api/reading"]
    dicApi["/api/dictation/*"]
    notesApi["/api/notes/*"]
    search["GET /api/search"]
  end

  subgraph core ["src/lib"]
    db["db.ts"]
    claude["claude.ts"]
    parse["parse-docx.ts"]
    dict["dictation.ts"]
  end

  GS --> les
  GS --> readApi
  GS --> gra
  GS --> search
  Home --> up
  Lesson --> les
  Lesson --> kan
  GrammarH --> gra
  Read --> readApi
  Dic --> dicApi
  Notes --> notesApi
  up --> parse
  up --> claude
  up --> db
  les --> db
  kan --> db
  gra --> db
  readApi --> db
  dicApi --> db
  dicApi --> dict
  notesApi --> db
  search --> db
```

`src/lib/db.ts` là lớp truy cập dữ liệu duy nhất cho SQLite: tạo bảng lazy, JSON blob trong một số cột, FTS-less search bằng quét `lessons.data`.

## 4. Mô hình dữ liệu

SQLite một file. Một số bảng lưu JSON text thay vì quan hệ đầy đủ.

```mermaid
erDiagram
  lessons {
    TEXT id PK
    TEXT title
    TEXT subtitle
    TEXT level
    TEXT topic
    TEXT created_at
    TEXT data "JSON Lesson: vocab + grammar"
  }

  kanji {
    TEXT char PK
    TEXT cn_vi
    TEXT pinyin
    INTEGER strokes
    TEXT radical
    TEXT means_tdpt "JSON array"
    TEXT strokes_svg
    TEXT botu "JSON BotuPart[]"
    TEXT crawled_at
  }

  mb_lessons {
    TEXT slug PK
    TEXT url
    TEXT title_en
    TEXT title_zh_simplified
    INTEGER hsk_level
    TEXT categories "JSON string[]"
    TEXT audio_url
    TEXT content "JSON MBLessonWord[][]"
    TEXT content_text
    TEXT sentence_timestamps "JSON SentenceTimestamp[]"
  }

  hanzii_grammar {
    INTEGER id PK
    TEXT uid
    TEXT title
    TEXT use_for
    TEXT keywords
    TEXT level
    TEXT hsk
    TEXT contents "JSON string[]"
    TEXT examples
    TEXT crawled_at
  }

  note_folders {
    TEXT id PK
    TEXT name
    INTEGER is_system
    TEXT created_at
  }

  note_items {
    TEXT id PK
    TEXT folder_id FK
    TEXT zh
    TEXT py
    TEXT vn
    TEXT pos
    TEXT source_lesson_id
    TEXT created_at
  }

  note_folders ||--o{ note_items : contains
```

| Bảng | Nguồn | Dùng cho |
|---|---|---|
| `lessons` | Upload `.docx`/`.xlsx` | Flashcard, quiz, ghép thẻ, `/grammar/[id]`, search |
| `kanji` | Hanzii on-demand + `crawl-hanzii.mjs` | Tra chữ, nét, bộ thủ trên thẻ từ |
| `mb_lessons` | Crawl Mandarin Bean + import | Đọc bài, luyện nghe, align timestamp |
| `hanzii_grammar` | `crawl-hanzii-grammar.mjs` | Catalog ngữ pháp theo HSK |
| `note_folders` / `note_items` | UI ghi chú | Folder + từ đã lưu; folder hệ thống `mistake` |

## 5. Luồng chính

### 5.1 Import bài học

```mermaid
sequenceDiagram
  actor User
  participant Home as Trang chủ
  participant Upload as POST /api/upload
  participant Parse as parse-docx
  participant Claude as Anthropic
  participant DB as lessons.db

  User->>Home: chọn .docx hoặc .xlsx
  Home->>Upload: FormData file
  alt Excel
    Upload->>Parse: parseHskXlsx
    Parse-->>Upload: Lesson drafts
    Upload->>DB: saveLesson từng bài
  else Word
    Upload->>Parse: extractSegmentsFromDocx
    Parse-->>Upload: vocab + grammar text
    Upload->>Claude: analyzeLesson JSON schema
    Claude-->>Upload: title, vocab, grammar, botu
    Upload->>DB: saveLesson
  end
  Upload-->>Home: { lesson } hoặc { lessons }
```

### 5.2 Tra chữ Hán (cache-aside)

```mermaid
sequenceDiagram
  participant UI as Thẻ từ / VocabListCard
  participant API as GET /api/kanji/字
  participant DB as bảng kanji
  participant Hanzii as api2.hanzii.net

  UI->>API: char
  API->>DB: getKanji
  alt cache hit
    DB-->>API: row
  else cache miss
    API->>Hanzii: search/all/vi/kanji
    Hanzii-->>API: AES-CBC payload
    API->>API: decrypt + map fields
    API->>DB: saveKanji
  end
  API-->>UI: pinyin, nghĩa, nét SVG, botu
```

### 5.3 Luyện nghe / chép chính tả

```mermaid
sequenceDiagram
  actor User
  participant Page as /dictation/[slug]
  participant API as /api/dictation
  participant DB as mb_lessons
  participant Audio as CDN Mandarin Bean

  Page->>API: GET lessons/[slug]
  API->>DB: getMBLesson
  DB-->>Page: content + audio_url + timestamps
  Page->>Audio: phát đoạn theo start/end
  User->>Page: gõ Hán
  Page->>API: POST /api/dictation/check
  API->>API: diffHanzi
  API-->>Page: correct / wrong / missing / extra
```

Timestamp câu không sinh lúc runtime. Chúng đến từ `scripts/align-whisper.py` (offline), ghi vào `mb_lessons.sentence_timestamps`. UI `/dictation/align` cho phép rà và sửa tay.

### 5.4 Pipeline nội dung offline

```mermaid
flowchart LR
  mbSite["mandarinbean.com"] --> crawlMB["npm run crawl"]
  crawlMB --> jsonFile["mandarin-bean-lessons.json"]
  jsonFile --> importMB["npm run import:mb"]
  importMB --> mbTable["mb_lessons"]
  mbTable --> whisper["align-whisper.py"]
  whisper --> mbTable

  hanziiAPI["Hanzii API"] --> crawlK["crawl-hanzii.mjs"]
  crawlK --> kanjiT["kanji"]
  hanziiAPI --> crawlG["npm run crawl:grammar"]
  crawlG --> gramT["hanzii_grammar"]

  docx[".docx / .xlsx"] --> upload["POST /api/upload"]
  upload --> lessonsT["lessons"]
  lessonsT --> fillPos["fill-pos.mjs"]
  fillPos --> lessonsT
```

## 6. Bản đồ route

### Pages

| Route | Dữ liệu | Ghi chú |
|---|---|---|
| `/` | `lessons` | Upload + thẻ bài import |
| `/lesson/[id]` | `lessons` | `?mode=` flashcard / quiz / match / list |
| `/vocab/[level]` | `lessons` (flat vocab theo HSK) | |
| `/grammar/[id]` | `lessons.grammar` | Điểm ngữ pháp trong bài import |
| `/grammar/hsk/[level]` | `hanzii_grammar` | Catalog theo HSK |
| `/reading`, `/reading/[slug]` | `mb_lessons` | Đọc có pinyin/định nghĩa |
| `/lessons`, `/lessons/[slug]` | JSON file | Catalog Mandarin Bean kiểu cũ |
| `/dictation`, `/dictation/[slug]` | `mb_lessons` | Nghe + chép |
| `/dictation/align`, `/dictation/align/[slug]` | `mb_lessons` timestamps | Công cụ vận hành |
| `/notes`, `/notes/[id]` | `note_folders` / `note_items` | |

### API

| Method | Path | Việc |
|---|---|---|
| POST | `/api/upload` | Parse + lưu bài import |
| GET/DELETE | `/api/lessons`, `/api/lessons/[id]` | CRUD metadata / xóa bài |
| GET | `/api/vocab?level=` | Vocab theo HSK |
| GET | `/api/search?q=` | Tìm từ trong JSON `lessons.data` |
| GET | `/api/grammar?level=` | Catalog Hanzii; không `level` thì trả counts |
| GET | `/api/kanji/[char]` | Cache-aside Hanzii |
| GET | `/api/reading`, `/api/reading/[slug]` | Bài đọc SQLite |
| GET | `/api/dictation/lessons`, `.../[slug]` | List/detail luyện nghe |
| POST | `/api/dictation/check` | So chữ với câu gốc |
| GET | `/api/dictation/align`, `.../[slug]` | Tóm tắt / chi tiết align |
| GET/POST/PATCH/DELETE | `/api/notes/folders`, `/api/notes/items` | Ghi chú |

Hầu hết handler khai `runtime = 'nodejs'` vì `better-sqlite3` là native addon — không chạy trên Edge.

## 7. Deploy

Local và VPS cùng mô hình: Node process + file SQLite cạnh repo. Không fit serverless (Vercel) nếu vẫn dùng `better-sqlite3`.

```mermaid
flowchart LR
  user["Browser"] --> nginx["nginx :80/:443"]
  nginx --> pm2["PM2 → next start :3000"]
  pm2 --> sqlite[("data/lessons.db")]
  mac["Máy soạn bài"] -->|"git pull / npm build"| pm2
  mac -->|"scp lessons.db"| sqlite
```

Chi tiết từng lệnh: `DEPLOY_SQLITE_VPS.md` (file local, không commit). Tóm tắt:

1. Clone repo trên VPS, `npm install && npm run build`
2. Copy `data/lessons.db` bằng `scp` (file bị gitignore)
3. `pm2 start npm --name hsk-web -- start`
4. Nginx reverse proxy vào `localhost:3000`

Cập nhật nội dung bài đọc/align: chạy pipeline trên máy local, rồi `scp` lại DB. Không cần rebuild nếu chỉ đổi data.

## 8. Ranh giới và nợ kỹ thuật

- **Hai nguồn bài đọc:** JSON (`src/lib/lessons.ts` → `/lessons`) và SQLite (`mb_lessons` → `/reading`, `/dictation`). Nên gom về SQLite.
- **Search quét full table:** `searchVocab` parse JSON từng hàng `lessons`. Ổn với quy mô hiện tại, không scale.
- **JSON blob:** `lessons.data`, `mb_lessons.content` khó query/index từng từ.
- **Không auth:** mọi API đều public trên VPS.
- **Hanzii decrypt key** nằm trong source (`kanji` route + crawl scripts) — phụ thuộc API bên thứ ba, có thể gãy bất kỳ lúc nào.
- **Claude chỉ lúc import `.docx`:** runtime học không gọi AI.

## 9. Cây thư mục liên quan

```text
src/app/            pages + api route handlers + GlobalShell
src/lib/            db, claude, parse-docx, dictation, lessons (JSON)
src/types/          Lesson, Grammar, HanziiGrammar, …
data/lessons.db     SQLite (gitignore)
scripts/            crawl, import, fill-pos, align-whisper.py
DEPLOY_SQLITE_VPS.md  hướng dẫn VPS (local only)
```
