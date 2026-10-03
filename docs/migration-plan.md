# Kế hoạch triển khai chuyển đổi DB v4

Lập ngày 2026-10-01. Tài liệu này chia nhỏ từng phase thành task. Các tài liệu nền:
- Thiết kế: [db/DESIGN.md](db/DESIGN.md), [db/schema.sql](db/schema.sql)
- Mapping từng cột cũ → mới: [db/README.md](db/README.md)
- Kiến trúc hệ thống và deploy (có sẵn): [ARCHITECTURE.md](ARCHITECTURE.md)
- Tầng truy cập DB và cấu trúc code mới: [data-layer.md](data-layer.md)
- Logic tính năng hiện tại: [features/README.md](features/README.md)

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Engine | Giữ SQLite: better-sqlite3 + SQL thuần, không ORM. Hàm trong `repos/` vẫn async |
| Bài học | Bảng `lessons` (bài upload `.docx`: tên, `hsk_level`, `format`) + bảng nối `lesson_words`, `lesson_grammar` (chốt 2026-10-03). Danh sách HSK1–6 từ Excel chỉ là từ vựng (`words.hsk_level`). Ngữ pháp vẫn chia theo `hsk_level` |
| Ngữ pháp | `source_data` = `hanzii` / `import`. 437 điểm không có cấp → nhóm "Chưa xếp cấp" (`hsk_level = NULL`, chia theo `category`) |
| Nguồn từ vựng | `source` = `import` (từ file upload, gồm cả danh sách HSK1–6) / `mandarin_bean` / `ai` / `manual` |
| Bài khóa | `source` = `mandarin_bean` / `ai` / `manual`. Bản dịch vi/en nằm trên từng câu |
| Đề thi | Hiện dùng chuẩn HSK 2.0, cấp 1–6. Giữ cột `format` (`hsk2` / `hsk3`) để mở rộng. `source_data` = `crawl` / `ai` |
| Người dùng | Một nhóm nhỏ, chưa có đăng nhập, chưa thêm `user_id` |
| Lỗi chép chính tả bị lệch khi gõ thiếu chữ | Bạn tự sửa, ngoài phạm vi kế hoạch này |

## 2. Backup và khôi phục

Migration không ghi vào `lessons.db`, nhưng vẫn backup ở mọi mốc có rủi ro, vì bước cutover sẽ thay hẳn file DB đang chạy.

**Chỉ backup ở máy local** (đã chốt 2026-10-02). Bản DB ở local là nguồn chính; VPS chỉ nhận bản được `scp` lên. Hệ quả chấp nhận được: dữ liệu chỉ phát sinh trên VPS (ví dụ ghi chú tạo trên VPS) sẽ bị ghi đè khi `scp` DB mới lên.

### 2.1 Các mốc backup

| Mã | Khi nào | Backup gì | Ở đâu |
|---|---|---|---|
| **B0** | Trước P0, trước mọi thay đổi | `lessons.db`, `data/mandarin-bean-lessons.json` | `data/backups/` |
| **B1** | Sau khi bạn duyệt báo cáo P6 | `hsk.db` đã duyệt (mốc tham chiếu cho P7) | `data/backups/` |
| **B2** | Đầu P8, sau khi đã ngừng sửa dữ liệu | `lessons.db` (bản cuối cùng của DB cũ) | `data/backups/` |
| **B3** | Ngay trước khi `scp` `hsk.db` lên VPS lần đầu | `hsk.db` | `data/backups/` |
| **B4** | Sau cutover, mỗi lần trước khi chạy pipeline (crawl, import, align) hoặc `scp` DB lên VPS | `hsk.db` | `data/backups/`, giữ 10 bản gần nhất |

Tên file: `<db>-<mốc>-<YYYYMMDD-HHMM>.db`, ví dụ `lessons-B0-20261002-0900.db`.

### 2.2 Cách backup

1. Dùng lệnh `.backup` của SQLite, **không dùng `cp`**. Lệnh này cho bản sao nhất quán kể cả khi app đang chạy và ghi DB:
   ```bash
   sqlite3 data/lessons.db ".backup 'data/backups/lessons-B0-20261002-0900.db'"
   ```
2. Kiểm tra bản backup: `PRAGMA integrity_check` phải trả `ok`, và số dòng từng bảng phải khớp DB gốc.
3. Ghi checksum SHA-256 và số dòng từng bảng vào `data/backups/MANIFEST.md`.
4. `*.db` nằm trong `.gitignore`, nên git không giữ hộ bản nào. Nên copy B0 và B2 ra ngoài thư mục repo (ổ ngoài hoặc cloud) để phòng hỏng máy.

### 2.3 Thử khôi phục (làm 1 lần ở P0)

Mở bản B0 bằng `sqlite3 -readonly`, chạy `integrity_check` và các câu đếm số dòng. Mục đích: chắc chắn bản backup dùng được trước khi cần tới.

Hiện đường dẫn DB đang cố định trong code (`src/lib/db.ts:7`), chưa đọc `DB_PATH`. Vì vậy chưa thể chạy app trên bản backup mà không đổi tên file. Từ P7.1.1 trở đi, app đọc `DB_PATH`, và bước thử khôi phục ở B2 sẽ chạy cả app trên bản backup.

### 2.4 Khôi phục khi có sự cố

| Tình huống | Cách khôi phục |
|---|---|
| Migration (P1–P6) sai | Xoá `hsk.db`, sửa script, chạy lại. DB cũ không bị đụng tới |
| P7 làm hỏng giao diện ở local | Đặt `DB_PATH=data/lessons.db`, checkout lại code |
| Cutover lỗi trên VPS | `scp` bản B2 (`lessons.db`) từ local lên VPS, đặt `DB_PATH` về `lessons.db`, checkout commit trước khi merge, `npm run build`, `pm2 restart hsk-web` |
| `hsk.db` hỏng sau cutover | Lấy bản B4 gần nhất ở local rồi `scp` lên VPS |

### 2.5 Giữ backup bao lâu

- B0, B2: giữ tới khi xong P9, tối thiểu 3 tháng sau cutover.
- B1: xoá sau cutover.
- B3: giữ tới khi xong P9.
- 3 bản backup cũ có sẵn trong `data/backups/` (ngày 07/09): giữ nguyên.

## 3. Thứ tự và điểm dừng

```
P0 Chuẩn bị ──► P1 Chữ Hán ──► P2 Từ vựng ──► P3 Bài khóa ──┐
                                   │                          ├──► P5 Ghi chú ──► P6 Đối chiếu ──► P7 Chuyển code ──► P8 Cutover ──► P9 Bù dữ liệu AI
                                   └──────► P4 Ngữ pháp ──────┘        ▲ DỪNG: bạn duyệt                ▲ DỪNG: bạn duyệt              └──► P10 Bài kiểm tra
```

- P3 cần P2 vì token trỏ tới `word_senses`. P5 cần P2 (`word_id`) và P3 (`source_passage_id`).
- P4 chỉ cần P0, có thể làm song song với P1–P3.

**Điểm dừng cần bạn duyệt:**

| Điểm | Lúc nào | Bạn duyệt gì |
|---|---|---|
| G0 | Đầu P0 | Cho phép commit các thay đổi đang dở và cài thêm package dev |
| G1 | Cuối P6 | Báo cáo đối chiếu số liệu và mẫu dữ liệu ngẫu nhiên |
| G2 | Đầu P8 | Thời điểm cutover (ngừng sửa dữ liệu trên app) |

Cỡ việc: **S** < nửa buổi · **M** khoảng 1 buổi · **L** nhiều buổi.

---

## P0. Chuẩn bị — S

| # | Task | File |
|---|---|---|
| P0.1 | **[G0]** Commit các thay đổi đang dở trên `main`, tạo nhánh `db-v4` | — |
| P0.2 | **Backup B0** theo mục 2: `lessons.db`, `mandarin-bean-lessons.json`. Kiểm tra `integrity_check`, ghi checksum + số dòng vào `MANIFEST.md`, thử khôi phục (mục 2.3) | `data/backups/` |
| P0.3 | Đọc tài liệu Next 16 trong `node_modules/next/dist/docs/` (route handler, server component, redirects), theo yêu cầu của `AGENTS.md` | — |
| P0.4 | Cài devDependency `tsx`. Không cài `server-only`: Next 16 tự xử lý `import 'server-only'` mà không cần package (xem `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`) | `package.json` |
| P0.5 | Tạo module hằng số dùng chung: dấu câu định nghĩa theo nhóm Unicode (P, Z, Sm, So — gồm `“ ” ‘ ’`, `《》`, `……`, dấu ASCII; Python dùng `unicodedata.category` cho kết quả giống hệt), `normalizePinyin` (bỏ khoảng trắng; đưa biến điệu 一/不 về dạng từ điển khi gắn được âm tiết với chữ), `pinyinPlain` (`ü → v`), `stripVietnamese` | `src/shared/text.ts` |
| P0.6 | Tạo khung migration: mở DB cũ `readonly`, xoá rồi tạo `data/hsk.db`, chạy schema, chạy từng bước trong transaction riêng, cuối cùng kiểm tra `foreign_key_check`. Schema đọc thẳng từ `docs/db/schema.sql` (một nguồn duy nhất; P7.1.2 chuyển thành `src/server/db/migrations/001_init.sql`) | `scripts/migrate-v4/index.ts`, `scripts/migrate-v4/steps.ts` |
| P0.7 | Thêm lệnh `npm run migrate:v4` | `package.json` |

Xong khi: có B0, `integrity_check` = ok, thử khôi phục thành công; `npm run migrate:v4` tạo được `hsk.db` rỗng với 23 bảng.

Đã chốt cách dùng `server-only`: chỉ file barrel `src/server/index.ts` có `import 'server-only'`, và code của app import qua barrel đó. Script import thẳng `repos/` / `services/` nên không bị chặn.

---

## P1. Chữ Hán — M

| # | Task |
|---|---|
| P1.1 | Seed `radicals`: tách 222 giá trị `kanji.radical` ("nữ 女") thành `form` + `han_viet`; gán `kangxi_no`, `meaning_vi`, `stroke_count` từ danh sách 214 bộ Khang Hy (file seed `scripts/migrate-v4/seed/radicals.json`) |
| P1.2 | `characters` từ `kanji`: map `lucthu` → `formation`/`formation2`; `popular` → `frequency` 1–5; `means_*` → `hv_*`; `crawl_status` |
| P1.3 | Thêm dòng `pending` cho 21 thành phần Ý/Âm và 7 chữ trong vocab chưa có trong `kanji` |
| P1.4 | `character_components` từ `kanji.botu_claude`: `t` → `role`, `source = 'ai'`, `verified = 0` |
| P1.5 | `character_strokes` từ `kanji.strokes_svg` (bỏ chuỗi rỗng), tính `has_medians` |

Kiểm tra:
- `characters` = 11.906 + số dòng thêm.
- `character_components` = 1.146 (643 chữ).
- `character_strokes` = 8.009, trong đó `has_medians = 0` là 305.

**Kết quả chạy (2026-10-02):**

| Mục | Kết quả | Ghi chú |
|---|---|---|
| `radicals` | 286 dòng (214 bộ + 72 dạng biến thể) | 219 dạng được dùng tới; 50 chữ ghi "phác 攴" thống nhất thành "phộc"; 1 chữ (脉) ghi "nguyệt" không kèm chữ → 月 |
| `characters` | 11.905 `ok` + 19 `pending` | Bỏ 1 dòng hỏng: `\uFFFD`+"ya" là chữ 牙 bị lỗi mã hoá lúc crawl; 牙 đã có dòng đúng nên không mất dữ liệu. 19 chữ `pending` = 18 thành phần Ý/Âm + 1 chữ trong bài khóa (con số ~28 trong plan đếm trùng và lẫn dấu câu) |
| `formation` | Khớp DB cũ | 9.138 hình thanh (gồm 1 dòng "hình thanh &amp; hình thanh"); 1.210 hình thanh + hội ý |
| `frequency` | Khớp 5 mức | |
| `character_components` | 1.145 dòng / 642 chữ | Phần chênh 1 là dòng hỏng ở trên |
| `character_strokes` | 8.009 dòng | 305 dòng ở DB cũ không phải object HanziWriter mà là **mảng đường nét trần**; đã chuyển thành `{"strokes": [...]}`, `has_medians = 0`. Không chữ nào trong số này nằm trong nội dung học (299/305 có độ phổ biến "rất thấp") |
| FK, `integrity_check` | Không lỗi | `hsk.db` hiện 41 MB |
- `PRAGMA foreign_key_check` trả rỗng.

---

## P2. Từ vựng — L

| # | Task |
|---|---|
| P2.1 | Seed `parts_of_speech` (n, v, adj, adv, m, conj, pron, prep, num, part, propn, intj, vo, modal, phrase) kèm bảng map từ nhãn tiếng Việt cũ |
| P2.2 | `words` lần 1 từ 6 danh sách HSK1–6 (`lessons.data.vocab`): chuẩn hoá pinyin, gộp từ trùng, `hsk_level` lấy cấp thấp nhất, `source = 'import'` |
| P2.3 | 6 bài upload → `lessons` (giữ id, cấp, tên) + `lesson_words` (kèm nghĩa được dạy) |
| P2.4 | `words` từ token Mandarin Bean có `wordId`: khớp theo (hanzi, pinyin đã chuẩn hoá) hoặc tạo mới với `source = 'mandarin_bean'`; ghi `mb_word_id` vào `word_senses`; `hsk_level` lấy từ token nếu từ chưa có cấp |
| P2.5 | `word_senses`: nghĩa vi từ vocab (ô từ loại gộp như "Động từ / Danh từ" tách thành 2 nghĩa) và nghĩa en từ mỗi cặp (wordId, definition). Tất cả `verified = 0` |
| P2.6 | `sense_examples` từ `vocab[].ex` |
| P2.7 | `word_characters`: tách `words.hanzi` thành từng chữ |
| P2.8 | Từ trong `note_items` chưa có thì tạo với `source = 'manual'` |
| P2.9 | `han_viet` của từ: ghép âm Hán Việt từng chữ; chữ có nhiều âm thì để NULL |
| P2.10 | Ghi `words_fts` (gồm `meanings_plain`) |
| P2.11 | In danh sách 12 từ khác cách đọc giữa các cấp HSK để bạn xem |

Kiểm tra:
- ~8.900 từ; 106 từ trùng giữa các cấp đã gộp.
- 7.531 nghĩa en + khoảng 5.000 nghĩa vi.
- Mọi chữ trong `word_characters` có trong `characters`.
- Tìm "hoc", "lv", "好" đều ra kết quả.

**Kết quả chạy (2026-10-02):** danh sách cần duyệt ở [migration-review/p2-words.md](migration-review/p2-words.md).

| Mục | Kết quả | Ghi chú |
|---|---|---|
| `words` | 8.903 (import 4.929, mandarin_bean 3.974) | 5 từ trong ghi chú đều đã có sẵn |
| `word_senses` | 12.556 (vi 5.024, en 7.532) | 7.532 nghĩa en chưa có từ loại (`pos` NULL), chờ P9 |
| `sense_examples` | 5.067 | |
| `word_characters` | 18.019 | Mọi chữ đều có trong `characters` |
| `han_viet` | 3.299 từ | Chữ có nhiều âm Hán Việt thì để NULL |
| `hsk_level` | 1: 304 · 2: 211 · 3: 485 · 4: 892 · 5: 1.675 · 6: 2.663 · 7–9: 534 · chưa có: 2.139 | |

Các thay đổi so với thiết kế ban đầu, phát hiện khi chạy:
- **`wordId` của Mandarin Bean là một mục từ điển, không phải một từ.** Có 23 cặp (chữ, pinyin) mang hơn 1 `wordId` (钱 "tiền" / 钱 "họ Tiền"), và 585 `wordId` có nhiều definition. Vì vậy `mb_word_id` chuyển từ `words` (UNIQUE) xuống `word_senses`, và `word_senses.pos` cho phép NULL.
- **Không gộp hai cách viết của Mandarin Bean với nhau.** Gộp không phân biệt hoa/thường đã làm dính 钱 qián với Qián, 苹果 píngguǒ với Píngguǒ (Apple), 得 de với dé. Từ import gắn vào cách viết gần nhất của từ điển: khớp chính xác → không phân biệt hoa/thường và dấu `'` → chỉ khác thanh nhẹ.
- **Thêm dấu `'` khi nối âm tiết bắt đầu bằng nguyên âm** (`kě ài` → `kě'ài`).
- **Lỗi gõ đã biết nằm trong `scripts/migrate-v4/seed/vocab-fixes.json`** (5 dòng). Ô có chú thích (`哪里 (哪儿)`, `安全 [an toàn]`) được làm sạch. `得（助动词）` thực chất là trợ từ de (theo ví dụ và nghĩa), không sửa thành děi.
- **Tìm kiếm:** "hoc" cũng ra 哭 vì "khóc" bỏ dấu thành "khoc", chứa chuỗi "hoc". API tìm kiếm ở P7 cần xếp hạng kết quả.

---

## P3. Bài khóa — M

| # | Task |
|---|---|
| P3.1 | `passages` từ `mb_lessons`: `category` = `categories` bỏ Checked/Uncheck (1 bài có 2 danh mục thì lấy cái đầu); `review_status`; `audio_source = 'crawl'`; `translation_status = 'none'` |
| P3.2 | `passage_sentences`: mỗi phần tử `content[idx]` thành 1 câu; `zh` ghép từ token; `tokens = [{h, p, s}]`, trong đó `s` tra `word_senses` theo (`mb_word_id`, definition); token dấu câu (theo bộ chung ở P0.5) không có `s`; `audio_start/end` lấy từ `sentence_timestamps[idx]` |
| P3.3 | Tính lại `sentence_count`, `vocab_count` (không đếm dấu câu) |
| P3.4 | In 3 bài lệch trạng thái review (`shopping-story`, `distribute-watermelon`, `climb-mountain`) và 864 câu thiếu mốc trong 219 bài |

Kiểm tra:
- 729 bài; 6.629 câu; tổng token = 119.864.
- Số câu có mốc khớp DB cũ.
- Token có chữ Hán mà thiếu `s`: chỉ 2 (đúng bằng số token chữ Hán không có `wordId` ở DB cũ).

**Kết quả chạy (2026-10-02):** danh sách cần duyệt ở [migration-review/p3-passages.md](migration-review/p3-passages.md).

| Mục | Kết quả |
|---|---|
| `passages` | 729 (HSK1: 55 · HSK2: 137 · HSK3: 183 · HSK4: 182 · HSK5: 172) |
| `passage_sentences` | 6.629; văn bản ghép lại khớp `content_text` cũ ở 729/729 bài |
| Token | 119.864; 99.846 gắn được nghĩa; 2 token chữ Hán không có nghĩa (khớp DB cũ) |
| Câu chưa có mốc audio | 865 = 864 cũ + 1 mốc dài 0 giây (`wechat-social-etiquette` câu 17) đã chuyển thành NULL |
| Trạng thái review lệch với mốc | 4 bài: 3 bài đã biết + `wechat-social-etiquette` (do câu 17) |
| `vocab_count` | Giảm ở 117 bài, chỉ vì dấu câu không còn bị đếm |

---

## P4. Ngữ pháp — M

| # | Task |
|---|---|
| P4.1 | `grammar_points` từ `hanzii_grammar` (`source_data = 'hanzii'`): `hsk` → `hsk_level` ("HSK7-9" = 7, "Khác" = NULL); `level` → `cefr` hoặc `category` |
| P4.2 | Parse `contents` một lần: `explanation` giữ nguyên văn (không lọc dòng); `formula` chỉ lấy từ dòng "Cấu trúc:"; ví dụ → `grammar_examples` với phần `/…/` đưa vào `pinyin` |
| P4.3 | 10 điểm từ `lessons.data.grammar` (`source_data = 'import'`, `hsk_level` = cấp của bài): `examples`, `exercises`, `comparisons` |
| P4.4 | In 10 điểm ngẫu nhiên: giải thích gốc và sau parse đặt cạnh nhau để so |

Kiểm tra:
- 1.744 điểm; 437 điểm `hsk_level = NULL` (294 Li hợp + 143 Dịch).
- 27 bài tập; 38 ví dụ từ bài upload.

**Kết quả chạy (2026-10-02):**
- 1.744 điểm: 1.734 Hanzii + 10 từ bài upload. Theo cấp: 1: 96 · 2: 119 · 3: 112 · 4: 177 · 5: 297 · 6: 251 · 7–9: 255 · chưa xếp cấp: 437 (Li hợp 294, Dịch 143).
- 6.380 ví dụ Hanzii (có cột `pinyin` riêng) + 38 ví dụ từ bài upload; 27 bài tập; 4 so sánh.
- Kiểm tra không mất dòng: 16.653 dòng `contents`, mọi dòng đều nằm trong `explanation` hoặc thành ví dụ. Các dòng cấu trúc như "- Khẳng định: Chủ ngữ + 需 + …" mà code cũ làm mất giờ nằm trong `explanation`.
- `formula` chỉ lấy từ dòng "Cấu trúc: …": 532 điểm có; 1.202 điểm không có dòng đó nên để NULL (không còn trùng `title`).
- Tiêu đề Hanzii là tiếng Việt, nên `title` = tiêu đề Hanzii và `title_vi` = NULL; `keywords` giữ ở cột riêng.

---

## P5. Ghi chú — S

| # | Task |
|---|---|
| P5.1 | `note_folders` giữ nguyên id (gồm folder hệ thống `mistake`) |
| P5.2 | `note_items`: tra `word_id` theo (zh, py chuẩn hoá); `sense_id` theo `vn` nếu khớp; giữ id và `created_at` cũ |

Kiểm tra: 2 folder, 5 item; không có item nào thiếu `word_id`.

**Kết quả chạy (2026-10-02):** 2 folder, 5 item; cả 5 đều tìm được từ và nghĩa. `source_lesson_id` cũ đều rỗng nên không mất gì.

---

## P6. Đối chiếu tổng — S · [G1]

| # | Task |
|---|---|
| P6.1 | Script `scripts/migrate-v4/report.ts`: bảng số liệu DB cũ ↔ DB mới cho mọi kiểm tra ở P1–P5; chạy `PRAGMA integrity_check`, `foreign_key_check`; so dung lượng file |
| P6.2 | Xuất mẫu ngẫu nhiên để xem tay: 20 chữ, 20 từ (kèm nghĩa), 5 bài khóa (3 câu đầu kèm mốc), 10 điểm ngữ pháp |
| P6.3 | **Bạn duyệt báo cáo.** Có sai lệch thì sửa P1–P5 và chạy lại |
| | **Kết quả (2026-10-02):** `npm run migrate:v4:report` → [migration-review/p6-report.md](migration-review/p6-report.md): 22/22 kiểm tra đạt, `integrity_check` ok, không lỗi FK, 98 MB → 56,7 MB |
| P6.4 | **Backup B1**: `hsk.db` đã duyệt |

Xong khi bạn duyệt báo cáo.

---

## P7. Chuyển code — L

Làm trên `data/hsk.db`. App mặc định vẫn dùng `lessons.db` cho tới P8; chuyển qua lại bằng biến môi trường `DB_PATH`.

### P7.1 Nền

| # | Task | File |
|---|---|---|
| P7.1.1 | Mở DB một lần dùng chung, bật `foreign_keys`, `journal_mode = WAL`, đọc `DB_PATH` | `src/server/db/connection.ts` |
| P7.1.2 | Chạy migration theo `schema_migrations` (từ đây schema chỉ đổi qua migration) | `src/server/db/migrate.ts`, `src/server/db/migrations/001_init.sql` |
| P7.1.3 | Kiểu DTO trả cho client | `src/types/api.ts` |

### P7.2 Repos và services

| Repo / service | Thay cho (trong `src/lib/db.ts` hoặc route) |
|---|---|
| `repos/notes.ts` | `getNoteFolders`, `createNoteFolder`, `renameNoteFolder`, `deleteNoteFolder`, `getNoteItems`, `addNoteItem`, `deleteNoteItem` |
| `repos/grammar.ts` | `getHanziiGrammarByHsk`, `getHanziiGrammarCounts`, `rowToHanziiGrammar`, `parseHanziiExamples` |
| `repos/passages.ts` | `queryMBLessons`, `getMBLesson`, `getAdjacentMBLessons`, `getMBLessonCounts`, `getMBAlignSummaries`, `saveMBLessonAlignment` |
| `repos/characters.ts` | `getKanji`, `saveKanji`, thêm `getStrokes(chars[])` |
| `repos/words.ts` | `getVocabByLevel`, `searchVocab` (FTS + nhánh riêng cho 1–2 ký tự), `getSenses` |
| `services/dictation.ts` | Chuyển `src/lib/dictation.ts` (giữ nguyên thuật toán chấm, bạn tự sửa phần lệch) |
| `services/hanzii.ts` | Gọi + giải mã API Hanzii, đang nằm trong `api/kanji/[char]/route.ts` |
| `services/upload.ts` | Parse file → Claude → ghi `words`/`word_senses`/`sense_examples`/`grammar_*` trong 1 transaction; chuẩn hoá pinyin và từ loại trước khi ghi |
| `services/mandarinBean.ts` | Import bài: chỉ thêm bài mới hoặc cập nhật metadata, không ghi đè câu đã có mốc |

### P7.3 Chuyển route (rủi ro thấp trước)

| Bước | Route / trang | Ghi chú |
|---|---|---|
| 1 | `/api/notes/**`, `/notes`, `NoteModal` | Item lưu `word_id` / `sense_id` |
| 2 | `/api/grammar`, `/grammar/hsk/[level]`, `/grammar/[id]` | Thêm nhóm "Chưa xếp cấp". `/grammar/[id]` dùng `grammar_points.id` thay vì id bài |
| 3 | `/api/reading/**`, `/reading`, `/reading/[slug]` | Bước đầu DTO dựng lại hình dạng cũ cho giao diện |
| 4 | `/api/dictation/**`, `/dictation/**` | UI căn audio gửi cả pinyin khi lưu |
| 5 | `/api/kanji/[char]`, panel chữ, flashcard | Thêm `/api/strokes?chars=`. Panel chữ dùng dữ liệu nét trong DB. Sửa "Phổ biến" theo `frequency` |
| 6 | `/api/vocab`, `/api/search`, `/vocab/[level]` | Popup tra từ trong bài khóa đọc theo `s` của token |
| 7 | `/api/upload`, `/api/lessons/**`, `/lesson/[id]` | Bài học đọc từ `lessons`; danh sách HSK ở `/lesson/hsk-<n>`. `MatchGame` dùng id sense. Chuyển hướng 12 id bài cũ sang route mới |
| 8 | Sidebar `GlobalShell`, trang chủ | Menu theo cấu trúc mới |

### P7.4 Script

| # | Task |
|---|---|
| P7.4.1 | `crawl-hanzii`, `crawl-hanzii-grammar`, `import-mandarin-bean`, `patch-audio-urls` → `.ts`, gọi services/repos. `crawl-mandarin-bean` chỉ ghi file JSON, không đụng DB, nên giữ nguyên |
| P7.4.2 | `align-whisper.py` ghi kết quả qua `PUT /api/dictation/align/[slug]`, bỏ `ALTER TABLE` |
| P7.4.3 | Bỏ `fill-pos.mjs`, `fill-pos-local.mjs`, `migrate-mb-split-sentences.mjs` (chỉ dùng cho DB cũ) |

Xong khi:
- Mọi trang chạy đúng với `DB_PATH=data/hsk.db`. Kiểm tra trong trình duyệt và xem console/log không có lỗi.
- `npm run build` và `npm run lint` không lỗi.

**Kết quả (2026-10-02):**

| Nhóm | Commit | Kiểm chứng |
|---|---|---|
| Nền (`src/server/db`, barrel `@/server`, migration `002`) | `392f2fa` | Migration `002` tự chạy khi mở DB |
| Ghi chú | `392f2fa` | 14/14 kiểm tra trên bản sao DB (thêm từ có sẵn và từ mới, chống trùng, folder hệ thống không đổi tên/xoá được, xoá folder kéo theo item) |
| Ngữ pháp | `392f2fa` | Số điểm theo cấp khớp; điểm 需 hiện đủ 3 dòng cấu trúc; link cũ `/grammar/hsk/Khác` vẫn mở được |
| Bài khóa, chép chính tả, căn audio | `6e69200` | So với code cũ trên cả 729 bài: giống hệt (trừ bài có 2 danh mục); lưu căn audio giữ đúng nghĩa token và pinyin |
| Chữ Hán, nét viết | `137e5ce` | So với code cũ trên 507 chữ: giống hệt; ô "Phổ biến" hết lỗi luôn hiện "Thấp" |
| Bài học, từ vựng, tìm kiếm, upload | `bb07b5f` | HSK1/2/5 khớp 100% danh sách cũ; HSK3/4/6 chỉ thiếu 104 từ đã có ở cấp thấp hơn; bài chủ đề khớp từ và ví dụ, nghĩa chỉ khác chữ hoa đầu câu; 11/11 kiểm tra upload |
| Script | `4296e8e` | Tách câu tái tạo đúng 6.629 câu (729/729 bài); import lại toàn bộ JSON không đụng câu/mốc audio |
| Toàn bộ | `4296e8e` | `npm run build` đạt; gọi trực tiếp 21 route handler trên bản sao DB đều trả đúng |

Thay đổi so với plan, phát hiện khi làm:
- **Bài học:** `/lesson/<id>` đọc bảng `lessons` (6 bài upload, giữ id cũ); `/lesson/hsk-<n>` là danh sách từ HSK. Giao diện học (flashcard, quiz, ghép thẻ) không phải sửa. Chỉ 6 id danh sách HSK cũ cần chuyển hướng (`next.config.ts`).
- **`words.hsk_level` chỉ lấy từ danh sách HSK 2.0 đã import.** Mandarin Bean gắn cấp theo thang HSK 3.0 (có cấp 7); trộn 2 thang làm 65 từ bị kéo về HSK1. Cấp của Mandarin Bean giữ ở `word_senses.hsk_level`.
- **Thêm lại bảng `lessons`** (chốt 2026-10-03), vì bỏ nó làm mất cấp của bài: 2/6 bài từng hiện HSK1. Giờ cả 6 bài đúng HSK2; từ, nghĩa, ví dụ, thứ tự và ngữ pháp khớp 100% dữ liệu cũ.
- **Build:** đường dẫn tính từ `process.cwd()` phải có `/* turbopackIgnore: true */`, nếu không Turbopack gom cả dự án và lỗi ở symlink `scripts/venv`.

**Chưa kiểm tra được trên trình duyệt:** trình duyệt tích hợp không chạy được dev server (macOS chặn quyền truy cập thư mục `Desktop`, lỗi `EPERM uv_cwd`). Cần chạy `npm run dev` và đi qua từng trang trước P8.


---

## P8. Cutover — S · [G2]

| # | Task |
|---|---|
App đang chạy trên VPS (nginx → PM2 → `next start`). File DB được `scp` từ máy local lên (xem [ARCHITECTURE.md §7](ARCHITECTURE.md)). Bản DB ở local là nguồn chính.

| # | Task |
|---|---|
| P8.1 | **[G2]** Chốt thời điểm. Ngừng sửa dữ liệu ở local (căn audio, ghi chú, upload) |
| P8.2 | **Backup B2** (mục 2): `lessons.db`, kiểm tra và ghi `MANIFEST.md` |
| P8.3 | Chạy lại `npm run migrate:v4` và `report.ts` trên bản mới nhất. Số liệu phải khớp lần duyệt ở P6, cộng phần dữ liệu mới phát sinh |
| P8.4 | Đặt `DB_PATH` mặc định = `data/hsk.db`. Smoke test toàn bộ trang ở local |
| P8.5 | Xoá `src/lib/db.ts` và code thừa: `diffHanzi`, `updateKanjiBotu`, `getHanziiGrammarCount`, `/lessons` + `src/lib/lessons.ts`, `src/app/api/generate-grammar/` |
| P8.6 | Cập nhật [ARCHITECTURE.md](ARCHITECTURE.md): §4 mô hình dữ liệu, §5 luồng chính, §6 bản đồ route, §7 deploy (`hsk.db`, `DB_PATH`) |
| P8.7 | **Backup B3** (`hsk.db` ở local) |
| P8.8 | Merge nhánh `db-v4`. Trên VPS: `git pull`, `npm install`, `npm run build`, `scp` `hsk.db` lên, `pm2 restart hsk-web`. Smoke test trên VPS |

Rollback: xem mục 2.4.

**Kết quả (2026-10-03):**

| Task | Kết quả |
|---|---|
| P8.1 | Chốt cutover theo yêu cầu "làm P8" |
| P8.2 | B2 `lessons-B2-20261003-1201.db`; dump giống hệt B0, tức không có dữ liệu mới phát sinh trong lúc migrate |
| P8.3 | `npm run migrate:v4` + báo cáo: 27/27 đạt; đã áp dụng migration 1, 2 vào `hsk.db` |
| P8.4 | `DB_PATH` mặc định đã là `data/hsk.db` (từ P7). Kiểm tra lại 21 route trên bản sao: đạt. **Chưa kiểm tra được trên trình duyệt** (macOS chặn quyền `Desktop`) |
| P8.5 | Đã xoá `src/lib/db.ts`, `src/lib/lessons.ts`, `src/types/lesson.ts`, trang `/lessons` (đọc JSON, không có link tới), `diffHanzi` và 2 kiểu chỉ nó dùng, thư mục rỗng `api/generate-grammar`. Build đạt |
| P8.6 | `ARCHITECTURE.md` cập nhật §2–§9; `features/` ghi chú là tài liệu trước v4 |
| P8.7 | B3 `hsk-B3-20261003-1203.db` |
| P8.8 | Đã merge `db-v4` vào `main` ở local. **Chưa push, chưa deploy VPS:** bạn chạy các lệnh ở cuối mục này |

Lệnh deploy VPS (bạn chạy):
1. Ở local: `git push origin main`
2. Ở local: `scp data/hsk.db <user>@<vps>:<đường dẫn repo>/data/hsk.db`
3. Trên VPS: `git pull && npm install && npm run build && pm2 restart hsk-web`
4. Mở thử vài trang trên VPS. Lỗi thì rollback theo §2.4: đặt `DB_PATH=data/lessons.db`, checkout commit `0bcea02` (`main` trước merge), build lại, `pm2 restart hsk-web`.


---

## P9. Bù dữ liệu thiếu bằng AI — L (làm dần)

Thứ tự ưu tiên:
1. Ghép nghĩa vi ↔ en của 2.835 từ trùng giữa 2 nguồn.
2. Soát từ loại (`verified = 0`).
3. Nghĩa vi cho ~3.900 từ chỉ có ở Mandarin Bean.
4. Dịch câu bài khóa (vi/en) và `title_vi`; đặt `translation_status = 'ai'`.
5. Phân tích Ý/Âm cho chữ còn thiếu, ưu tiên 2.883 chữ dùng trong vocab và bài khóa.
6. `traditional` cho từ; dữ liệu nét đầy đủ (có `medians`) cho 305 chữ đang chỉ có mảng đường nét.

Mỗi loại cần một trang duyệt nhỏ hoặc một script xuất/nhập CSV. Duyệt xong đặt `verified = 1` / `translation_status = 'reviewed'`.

## P10. Bài kiểm tra — L

1. Crawl đề HSK 2.0 cấp 1–6 (`format = 'hsk2'`, `source_data = 'crawl'`, có `source_url`).
2. AI sinh đề (`ai_model`, `ai_params`), dùng `word_senses` / `grammar_points` theo cấp.
3. UI làm bài theo phần nghe / đọc / viết; audio theo mốc.
4. Chấm điểm: `auto` cho câu có đáp án, `ai` cho câu viết; lưu `exam_attempts` / `exam_answers`.

---

## 4. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Ghép từ sai giữa 2 nguồn (cùng hanzi, pinyin viết khác) | Chuẩn hoá pinyin trước khi ghép; P2.11 in các trường hợp nghi ngờ; P6 kiểm tra mẫu |
| Token không tìm được `s` | P3 đếm và in ra; ngưỡng chấp nhận = số token chữ Hán không có `wordId` ở DB cũ (2) |
| Dữ liệu phát sinh trên DB cũ ở local trong lúc làm P1–P7 | P8 chạy lại migration trên bản mới nhất |
| `scp` DB lên VPS ghi đè dữ liệu chỉ có trên VPS | Đã chấp nhận: local là nguồn chính |
| Giao diện hỏng khi đổi hình dạng dữ liệu | DTO giữ hình dạng cũ ở bước đầu; chuyển từng nhóm route và kiểm tra trong trình duyệt |
| Link cũ `/lesson/<id>` | Chuyển hướng 12 id cũ |
| `server-only` chặn script | Đã xử lý: chỉ barrel `src/server/index.ts` import `server-only` |
