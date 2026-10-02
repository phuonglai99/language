# Logic thiết kế DB — HSK Web (v4)

Tài liệu này ghi lại **lý do** của từng quyết định thiết kế. Các tài liệu đi kèm:
- DDL: [schema.sql](schema.sql)
- Mapping từng cột từ DB cũ, dữ liệu còn thiếu, plan triển khai: [README.md](README.md)

Mọi số liệu đo trực tiếp trên `data/lessons.db` ngày 2026-10-01.

---

## 1. Hiện trạng DB cũ

| Bảng | Số dòng | Vấn đề |
|---|---|---|
| `lessons` | 12 | Vocab, grammar, bài tập, bộ thủ nằm trong 1 cột JSON `data`. Tìm kiếm phải parse JSON của mọi bài. `getLesson` ghi DB ngay khi đọc (tự sinh id cho vocab) |
| `kanji` | 11.906 | `raw` 39 MB + `strokes_svg` 25 MB ≈ 64% dung lượng DB. `botu` và `botu_claude` trùng nhau. `popular` là text. `radical` là text tự do (222 giá trị). `lucthu` 20 kiểu viết |
| `mb_lessons` | 729 | `content` JSON 12 MB: 119.864 token, `definition` lặp lại cho mỗi lần từ xuất hiện. `categories` trộn chủ đề với trạng thái review. `sentence_timestamps` là mảng riêng, khớp với câu chỉ nhờ trùng thứ tự |
| `hanzii_grammar` | 1.734 | `hsk`/`level` lẫn giá trị không phải cấp độ ("Khác", "Li hợp", "Dịch"). Ví dụ parse bằng regex mỗi lần đọc |
| `note_folders`, `note_items` | 2 / 5 | `note_items` copy text `zh/py/vn/pos`. `source_lesson_id` không có FK |

Vấn đề chung:
- Code không bật `PRAGMA foreign_keys`. App vẫn có khoá ngoại vì better-sqlite3 13 được biên dịch với `SQLITE_DEFAULT_FOREIGN_KEYS=1`, nên `ON DELETE CASCADE` có chạy. Nhưng CLI `sqlite3` và `align-whisper.py` (Python `sqlite3`) mở DB với khoá ngoại **tắt**. Vì vậy vẫn phải bật tường minh ở mọi nơi mở DB.
- DDL rải rác ở `db.ts` và 8 script; mỗi nơi tự `CREATE TABLE` / `ALTER`.
- Không có migration theo version.

---

## 2. Nguyên tắc thiết kế

1. **Mỗi dữ liệu chỉ lưu ở một chỗ.** Nơi khác tham chiếu bằng khoá ngoại.
2. **Tách bảng hay để JSON:**
   - **Tách bảng** khi dữ liệu được lọc, join, cập nhật độc lập, hoặc nhiều nơi tham chiếu tới nó.
   - **Cột JSON** khi dữ liệu chỉ thuộc một dòng cha, luôn đọc/ghi nguyên khối và không bao giờ bị lọc theo. Cột JSON luôn có `CHECK (json_valid(...))`.
3. **Mô hình theo bản chất ngôn ngữ, không theo hình dạng dữ liệu crawl hiện có.** Nguồn crawl phẳng không có nghĩa ngôn ngữ phẳng (xem 4.2).
4. **Mọi cột dạng lựa chọn có `CHECK`, danh mục có bảng riêng** (`radicals`, `parts_of_speech`).
5. **Toàn vẹn dữ liệu:** bật `PRAGMA foreign_keys = ON` và `journal_mode = WAL`.
6. **Một nguồn schema duy nhất:** `schema.sql` + migration có version. `db.ts`, các script Node và `align-whisper.py` không tự tạo bảng nữa.
7. **Di chuyển an toàn:** DB cũ chỉ mở ở chế độ đọc, dữ liệu ghi sang file mới `data/hsk.db`. Code chỉ chuyển sang DB mới sau khi đã đối chiếu số liệu.

---

## 3. Tổng quan: 6 nhóm, 23 bảng

| Nhóm | Bảng |
|---|---|
| Chữ Hán | `radicals`, `characters`, `character_components`, `character_strokes` |
| Từ vựng | `words`, `word_characters`, `parts_of_speech`, `word_senses`, `sense_examples`, `words_fts` |
| Bài khóa | `passages`, `passage_sentences` |
| Ngữ pháp | `grammar_points`, `grammar_examples`, `grammar_exercises` |
| Bài kiểm tra | `exams`, `exam_sections`, `exam_question_groups`, `exam_questions`, `exam_attempts`, `exam_answers` |
| Ghi chú | `note_folders`, `note_items` |
| Hệ thống | `schema_migrations` |

---

## 4. Logic từng nhóm

### 4.1 Chữ Hán

**Chữ khác từ.** Chữ 好 xuất hiện ở cả hai bảng, và đó không phải trùng lặp:
- Trong `characters` nó là **chữ**: âm Hán Việt "hảo", bộ nữ 女, hội ý, 6 nét, nét viết.
- Trong `words` nó là **từ**: hǎo, tính từ, nghĩa "tốt", có câu ví dụ, có cấp HSK.

`characters` chỉ nhận đúng 1 ký tự (`CHECK (length(char) = 1)`).

**`radicals` — bộ thủ.**
- Cột cũ `kanji.radical` là text dạng "nữ 女", có 222 giá trị khác nhau. Số này lớn hơn 214 bộ Khang Hy vì có dạng biến thể (氵 của 水, 扌 của 手).
- Mỗi dạng là một dòng. `kangxi_no` gom các dạng biến thể về cùng một bộ.
- `characters.radical_id` là FK. Nhờ vậy có thể lọc "mọi chữ thuộc bộ 女".

**`character_components` — phân tích Ý/Âm (bộ thủ của chữ).**
- Ví dụ: 妈 = 女 (ý) + 马 (âm).
- Tách thành bảng, không để JSON, vì `component` là một chữ và có FK về `characters`. Nhờ vậy query được **cả nhóm chữ cùng âm 马**: 妈, 吗, 码, 骂. Đây là cách học chữ hình thanh hiệu quả.
- Thay cho 3 chỗ lưu trùng: `kanji.botu`, `kanji.botu_claude`, `lessons.data.vocab[].botu`. Đã đối chiếu: 643/643 chữ trong vocab đều có trong `botu_claude`.
- `role`: `meaning` (ý) / `sound` (âm) / `self` (độc thể, chữ không tách được).
- `source` (`ai` / `manual`) để biết dòng nào đã có người duyệt.
- Hiện chỉ có 643 chữ được phân tích (1.146 dòng). 21 thành phần là chữ hiếm (亼, 丩, 咼…) chưa có trong `kanji`. Migration sẽ thêm dòng cho chúng với `crawl_status = 'pending'` để không lỗi FK.

**`hv_meanings`, `hv_compounds`, `hv_dictionary` — dữ liệu tra cứu của Hanzii về chữ.**

| Cột mới | Cột cũ | Nội dung | Số mục |
|---|---|---|---|
| `hv_meanings` | `means_tdpt` | Nghĩa Hán Việt ngắn của chữ ("tốt, hay, đẹp") | 17.437 |
| `hv_compounds` | `means_tg` | Từ ghép Hán Việt chứa chữ ("hảo cảm 好感", "hảo hán 好漢") | 31.124 |
| `hv_dictionary` | `means_tdtd` | Mục từ điển kiểu Thiều Chửu, có trích dẫn cổ văn | 22.919 |

- Cả ba **không phải từ vựng để học**. `hv_compounds` dùng chữ phồn thể, không có pinyin, không có cấp HSK, nên không gộp vào `words`.
- Chúng chỉ hiển thị trong panel chi tiết chữ và không bao giờ bị lọc theo, nên để cột JSON trong `characters` (nguyên tắc 2).
- Phương án đã loại: bảng `character_meanings` (~71k dòng). Tách ra không được lợi gì mà mỗi lần đọc phải thêm một join.

**Lục thư** (`formation`, `formation2`).
- Dữ liệu cũ có 20 kiểu viết, gồm `&amp;`, thứ tự đảo ("hội ý & hình thanh" / "hình thanh & hội ý"), và tối đa 2 phép.
- Quy về 2 cột, mỗi cột chỉ nhận giá trị trong danh mục: `pictograph` (tượng hình), `ideograph` (chỉ sự), `compound` (hội ý), `phono_semantic` (hình thanh), `loan` (giả tá), `derivative` (chuyển chú).

**Độ phổ biến** (`frequency`): text 5 mức → số 1–5 (rất thấp = 1 … rất cao = 5) để sắp xếp được.

**`raw`**: bỏ. Các field cần dùng đã tách ra cột; bản gốc còn trong file backup.

#### Nét viết (`character_strokes`)

**Luồng hiện tại của flash card** (`CharStroke`, [src/app/lesson/[id]/page.tsx:77](../../src/app/lesson/[id]/page.tsx)). Panel chi tiết (`KanjiPanel`) **không** đi theo luồng này: nó gọi `HW.create` mà không truyền `charDataLoader`, nên luôn tải nét từ CDN và bỏ qua dữ liệu trong DB. Hai component còn dùng 2 script id khác nhau, nên HanziWriter có thể bị nạp 2 lần (xem [kanji.md](../features/kanji.md)).

1. Nạp thư viện HanziWriter 3.5 từ `cdn.jsdelivr.net/npm/hanzi-writer@3.5`.
2. Với mỗi chữ, gọi `GET /api/kanji/:char`. API đọc bảng `kanji`; nếu chưa có chữ đó thì gọi API Hanzii, lưu vào DB, rồi trả về.
3. API trả `strokesSvg`, tức `kanji.strokes_svg` đã parse.
4. Có dữ liệu → truyền cho HanziWriter qua `charDataLoader`.
5. Không có dữ liệu → HanziWriter dùng loader mặc định, tải từ `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/<chữ>.json`.

**Về dữ liệu:**
- `strokes_svg` **không phải SVG**. Đó là JSON nét chữ theo định dạng HanziWriter: `{strokes: [path], medians: [[x, y]…], radStrokes: [idx]}`.

| Tình trạng | Số chữ |
|---|---|
| Có dữ liệu | 8.009 |
| … trong đó có `medians` | 7.704 |
| … trong đó thiếu `medians` (animation có thể sai) | 305 |
| Chuỗi rỗng | 3.896 |

- **Bước 5 (tải từ CDN) gần như không bao giờ xảy ra trong thực tế:**
  - Cả 2.883 chữ dùng trong vocab và bài khóa đều đã có dữ liệu nét trong DB.
  - 3.896 chữ rỗng đều là chữ hiếm (không chữ nào có độ phổ biến "cao" hay "rất cao").
  - Thử ngẫu nhiên 30 chữ rỗng trên CDN `hanzi-writer-data`: **0/30 có dữ liệu**. Với những chữ này, CDN cũng không cứu được.

**Thiết kế mới:**
```
character_strokes(char PK → characters, data JSON, has_medians 0/1, source)
```
- Đổi tên cột thành `data` vì nội dung là JSON. `CHECK` bắt buộc phải có mảng `strokes`.
- Tách bảng riêng (25 MB) để đọc thông tin chữ không phải kéo theo dữ liệu nét.
- Chỉ tạo dòng cho 8.009 chữ có dữ liệu. Chữ không có dòng thì UI vẫn chạy như hiện nay.
- `has_medians` đánh dấu 305 chữ cần bù dữ liệu.
- `source`: `hanzii` / `hanzi_writer_data` / `manual`.
- API `/api/kanji/:char` vẫn trả `strokesSvg` cùng định dạng, nên UI không phải sửa.
- Đề xuất ở Phase 7: thêm endpoint `/api/strokes?chars=互联网`. Một request lấy nét cho cả từ (hiện từ 4 chữ phải gọi 4 lần), kèm cache dài hạn vì dữ liệu nét không đổi.

### 4.2 Từ vựng

**Từ (word) khác nghĩa (sense).**
- `words` = cách viết + cách đọc (会 huì). Đây là đơn vị để **tra cứu**. `UNIQUE (hanzi, pinyin)`, nên 行 xíng và 行 háng là 2 từ.
- `word_senses` = một nghĩa + một từ loại. Đây là đơn vị để **học**: ví dụ, bài tập, ghi chú, câu hỏi thi đều gắn vào nghĩa.

**Vì sao phải tách nghĩa** (dữ liệu crawl đã có sẵn bằng chứng):
- Mandarin Bean `wordId 54380` (会 huì) mang 3 nghĩa khác nhau tuỳ ngữ cảnh câu:
  - "can; to know how to" (động từ năng nguyện)
  - "to be likely to" (động từ năng nguyện)
  - "meeting; gathering" (danh từ)
- 行 xíng: "OK" (tính từ), "to walk" (động từ), "to do" (động từ).
- 3.471/7.532 definition gộp nhiều nghĩa bằng " / ".
- Vocab cũ có những ô "Động từ / Danh từ", "Giới từ / Liên từ", vì một cột chỉ chứa được một giá trị.
- Người học học 会 "biết" ở HSK1 nhưng 会 "cuộc họp" ở HSK3. Vì vậy `hsk_level` có ở **cả** word lẫn sense.

**`parts_of_speech`**: danh mục từ loại cố định (n, v, adj, adv, m, conj, pron, prep, num, part, propn, intj, vo = động từ ly hợp, modal, phrase), thay text tự do. Ô gộp như "Động từ / Danh từ" tách thành 2 nghĩa.

**`sense_examples`**: ví dụ gắn vào từng nghĩa. Dữ liệu cũ có đúng 1 ví dụ cho mỗi vocab (5.067).

**`word_characters`**:
- Nối từ với chữ: 爸爸 → 爸 (vị trí 0), 爸 (vị trí 1).
- Dùng để bấm vào một chữ ra mọi từ chứa nó, và để lấy bộ thủ cho từng chữ trong từ.
- Đảm bảo mọi chữ trong `words` đều có trong `characters`.

**Đánh dấu bằng cột, không dùng bảng nối `lesson_words`:**
- 6 "bài" HSK1–HSK6 thực chất là danh sách từ theo cấp → `words.hsk_level`, lấy cấp **thấp nhất**.
- 3 bài chủ đề ("Bài 2 – Giao thông"…) → `words.topic`.
- Đây là 2 cột độc lập, nên một từ vừa thuộc HSK2 vừa thuộc chủ đề "Giao thông" vẫn lưu được. Dữ liệu thật: 34/65 từ của các bài chủ đề đã có trong danh sách HSK.
- Giới hạn: một từ chỉ thuộc được 1 chủ đề. Khi cần nhiều chủ đề thì mới thêm bảng nối.

**106 từ nằm ở 2 danh sách HSK** (ví dụ 举行 ở cả HSK3 và HSK4, 一再 ở cả HSK5 và HSK6):
- Chỉ 12 từ thật sự khác cách đọc. Phần còn lại là cùng một từ, chỉ viết pinyin khác: `jǔxíng` / `jǔ xíng`, `yí zài` / `yīzài` (đọc biến điệu so với dạng từ điển).
- Hai bản ghi của cùng một từ có nghĩa/từ loại khác nhau, và nhiều chỗ sai (以为, 位于, 使 bị ghi "Danh từ").
- Cách xử lý: chuẩn hoá pinyin về dạng từ điển, không khoảng trắng thừa → gộp thành 1 từ → giữ cấp thấp nhất → nghĩa khác nhau thành các sense.

**Chuẩn hoá pinyin:**
- `pinyin` lưu dạng từ điển, không biến điệu (`yīzài`).
- `pinyin_plain` là dạng bỏ dấu (`yizai`), dùng để tìm kiếm.

**`words_fts`** (FTS5, trigram): tìm theo hanzi, pinyin không dấu, âm Hán Việt, nghĩa. Thay cho `searchVocab` đang parse JSON của mọi bài.

**Nguồn dữ liệu và việc ghép nghĩa:**
- Vocab từ bài HSK chỉ có nghĩa tiếng Việt. Từ Mandarin Bean chỉ có nghĩa tiếng Anh.
- Hai nguồn trùng nhau 2.835 từ, nhưng **không ghép tự động được nghĩa vi với nghĩa en**.
- Sau import chúng là các sense riêng. Cần một bước AI ghép, có người duyệt (Phase 9).

### 4.3 Bài khóa

**`passages`** dùng cho 2 tính năng: chép chính tả và đọc bài.
- `source`: `mandarin_bean` (crawl) / `ai` (sinh tự động sau này) / `manual`.
- Bài do AI sinh lưu thêm `ai_model` và `ai_params`: cấp độ, chủ đề, id từ và ngữ pháp mục tiêu. Nhờ vậy biết bài được sinh từ yêu cầu gì và có thể sinh lại.
- `review_status` (`checked` / `unchecked`): trạng thái căn audio. Trước đây nằm lẫn trong `categories`.
- `category`: Story / News / … Một bài cũ có 2 danh mục, sẽ chọn 1.
- `translation_status`: `none` / `ai` / `reviewed`.
- `sentence_count`, `vocab_count`: cache, chỉ có một chỗ ghi (trong `db.ts`).

**`passage_sentences` — mỗi dòng là một câu, đủ mọi thứ của câu đó:**

| passage_id | idx | zh | tokens | vi | en | audio_start | audio_end |
|---|---|---|---|---|---|---|---|
| 12 | 0 | 老师问五岁的小王： | `[{"h":"老师","p":"lǎo shī","s":88},…]` | Cô giáo hỏi bé Vương 5 tuổi: | The teacher asked… | 4.10 | 10.32 |

- **Bản dịch theo câu** nằm cùng dòng (`vi`, `en`). Đọc bài song ngữ chỉ cần một query, sắp xếp theo `idx`.
- **Mốc audio** cùng dòng. Hết tình trạng 2 mảng rời khớp nhau theo thứ tự như `sentence_timestamps` cũ.
- **`tokens` để JSON** vì luôn đọc nguyên câu. Mỗi token gồm:
  - `h`: chữ
  - `p`: pinyin theo ngữ cảnh (chữ đa âm đọc khác nhau tuỳ câu)
  - `s`: `word_senses.id`, tức nghĩa đúng trong câu đó, vì Mandarin Bean đã cho sẵn definition theo ngữ cảnh

  Định nghĩa từ không còn bị copy theo từng token. Token là dấu câu thì không có `s`.

**Phương án đã loại:**
- **Bảng `sentences` dùng chung cho câu bài khóa, ví dụ từ và ví dụ ngữ pháp.** Chỉ 32/6.578 câu xuất hiện ở hơn một bài, nên lợi ích chống trùng gần như bằng 0. `UNIQUE(zh)` còn gây hại: 2 bài có cùng câu "你好。" sẽ bị buộc dùng chung bản dịch và mốc audio.
- **Mảng JSON bản dịch đặt trên bài.** Lặp lại đúng lỗi khớp theo thứ tự của `sentence_timestamps`.
- **Bảng `sentence_translations(passage_id, idx, lang, text, source)`.** Chỉ cần khi có ngôn ngữ thứ 3 hoặc cần nhiều phiên bản dịch cho một câu.

**Bỏ `content_text`**: tính lại được từ `passage_sentences.zh`.

### 4.4 Ngữ pháp

- **Gộp** ngữ pháp Hanzii (1.734) và ngữ pháp trong các bài upload (10, do Claude sinh) vào `grammar_points`. Hai nguồn trước đây có 2 format khác nhau.
- **`source_data`**: `hanzii` (crawl từ Hanzii) / `import` (từ file upload).
- **Chia nhóm duy nhất theo `hsk_level`.** Không giữ cách nhóm theo bài cũ. 10 điểm từ bài upload đều thuộc HSK2 (lấy từ `lessons.level`).
- **Chuẩn hoá cột phân loại:**
  - `hsk_level`: số 1–7 (7 = HSK 7–9).
  - `cefr`: A1–C2.
  - `category`: "Li hợp", "Dịch". Trước đây các giá trị này nằm lẫn trong cột `hsk`/`level`.
- **Parse `contents` của Hanzii một lần lúc migrate** thành `explanation` và `grammar_examples`, thay vì parse regex mỗi lần đọc. Phần `/…/` trong ví dụ là pinyin; code cũ đang để nhầm vào `note`.
- `grammar_exercises`: bảng riêng vì cần id để sau này lưu kết quả làm bài. `options` để JSON.
- `comparisons` (so sánh 帮 / 帮忙 / 帮助): cột JSON, luôn hiển thị nguyên khối cùng điểm ngữ pháp.
- Đã chốt bỏ cách nhóm theo bài cũ (bài "Trạng từ 就 & So sánh 帮/帮忙/帮助" gồm 2 điểm ngữ pháp).
- ⚠️ 437 điểm Hanzii không có cấp HSK (`Li hợp` 294, `Dịch` 143). Mặc định để `hsk_level = NULL`, hiển thị thành nhóm "Chưa xếp cấp" theo `category`.

### 4.5 Bài kiểm tra (format HSK)

**Cấu trúc 4 cấp:**
```
exams → exam_sections (nghe / đọc / viết) → exam_question_groups → exam_questions
exam_attempts → exam_answers
```

**Vì sao cần cấp "nhóm câu hỏi":** đề HSK thường cho nhiều câu dùng chung một thứ:
- một đoạn audio,
- một đoạn văn đọc hiểu,
- một bộ tranh hoặc bộ đáp án A–F dùng chung (dạng nối).

Phần dùng chung lưu ở `group.shared`. Nhóm có thể trỏ tới `passages` (`passage_id`) để tái dùng bài khóa AI sinh làm bài đọc hiểu.

**Cột cố định và nội dung JSON:**
- **Cột cố định** dùng để chấm điểm và thống kê: `type`, `number`, `answer`, `points`.
- **`content` (JSON)** chứa phần hiển thị riêng theo dạng câu hỏi:

| `type` | Dạng HSK | `content` | `answer` |
|---|---|---|---|
| `true_false` | 判断对错 | `{"image","statement"}` | `true` |
| `choice` | 选择 | `{"stem","options":[…]}` | `"B"` |
| `match` | 匹配 | `{"stem"}`; đáp án A–F trong `group.shared` | `"D"` |
| `fill_word` | 选词填空 | `{"stem":"我___去过北京。"}`; bộ từ trong `group.shared` | `"A"` |
| `reorder` | 排列顺序 | `{"parts":{"A","B","C"}}` | `["B","A","C"]` |
| `build_sentence` | 完成句子 | `{"words":[…]}` | `["我把作业写完了。"]` (nhiều đáp án hợp lệ) |
| `write_hanzi` | 看拼音写汉字 | `{"stem":"这 ___ (běn) 书"}` | `"本"` |
| `picture_sentence` | 看图用词造句 | `{"image","keyword"}` | `null` (AI chấm) |
| `essay` | 缩写 / viết đoạn | `{"prompt"}` | `null` (AI chấm) |

- Phương án đã loại: chuẩn hoá đáp án thành bảng `options` A/B/C. Các dạng sắp xếp, xếp câu và viết không có đáp án kiểu đó.

**Các điểm khác:**
- **Audio phần nghe:** 1 file cho cả phần (`exam_sections.audio_url`). Từng nhóm/câu lưu `audio_start`/`audio_end`, cùng cách làm với bài khóa.
- **Chấm điểm:** `exam_answers.graded_by` = `auto` / `ai` / `manual`. `feedback` lưu nhận xét AI cho câu viết. `exam_attempts.section_scores` lưu điểm từng phần.
- **Liên kết kiến thức:** câu hỏi trỏ `sense_id` / `grammar_id`, để thống kê người học hay sai từ hay điểm ngữ pháp nào.
- **Phân loại:** theo `exams.hsk_level`.
- **`source_data`:** `crawl` (bắt buộc có `source_url`) / `ai` (lưu `ai_model`, `ai_params`).
- **Chuẩn đề:** cột `format` = `hsk2` (mặc định, đang dùng) / `hsk3` (để mở rộng). `CHECK` ràng buộc cấp theo chuẩn: `hsk2` cấp 1–6; `hsk3` cấp 1–7, trong đó 7 là bài thi chung cho cấp 7–9. HSK 2.0: HSK1–2 có phần nghe + đọc, HSK3–6 thêm phần viết.

### 4.6 Ghi chú

- `note_items` chỉ lưu `word_id` (và `sense_id` nếu ghi chú một nghĩa cụ thể). Không copy `zh/py/vn/pos` nữa, nên sửa nghĩa ở `words` thì ghi chú tự cập nhật.
- `UNIQUE (folder_id, word_id)`: một thư mục không có từ trùng.
- `source_passage_id` có FK, `ON DELETE SET NULL`.
- Xoá thư mục sẽ xoá các ghi chú bên trong. Hiện nay đã như vậy trong app; v4 bật `foreign_keys` tường minh để script Python và CLI cũng tuân theo.

---

## 5. Lịch sử phương án

| Phiên bản | Thay đổi | Lý do |
|---|---|---|
| v2 | Tách mọi thứ thành bảng (`character_meanings`, `sentences`, `lessons` gộp, `lesson_words`) | Chuẩn hoá tối đa |
| v3 | Gộp `character_meanings` về JSON; bỏ `sentences`; tách bài khóa / ngữ pháp; bỏ `lesson_words`; gộp nghĩa vào `words` | Đo lại số liệu: tách bảng không có lợi |
| v4 | Tách lại `word_senses`; thêm `radicals`, `character_components`, `word_characters`, `parts_of_speech`; tách `formation`; sửa `character_strokes` | v3 đã thoả hiệp sai: mô hình theo dữ liệu thay vì theo bản chất ngôn ngữ (4.2) |

---

## 6. Vấn đề chất lượng dữ liệu cần xử lý khi migrate

| Vấn đề | Số lượng | Xử lý |
|---|---|---|
| Từ nằm ở 2 danh sách HSK | 106 | Gộp, giữ cấp thấp nhất (4.2) |
| Pinyin không thống nhất (khoảng trắng, biến điệu) | — | Chuẩn hoá về dạng từ điển |
| "Danh từ" chiếm 69% vocab, nhiều chỗ sai | 3.516/5.067 | Soát lại bằng AI, có người duyệt |
| Ô từ loại gộp ("Động từ / Danh từ") | 4 | Tách thành nhiều nghĩa |
| Lục thư 20 kiểu viết, có `&amp;` | 11.906 | Quy về `formation`, `formation2` |
| Thành phần Ý/Âm chưa có trong `kanji` | 21 | Thêm dòng `pending` |
| Chữ trong vocab chưa có trong `kanji` | 7 | Thêm dòng `pending` |
| Dữ liệu nét thiếu `medians` | 305 | Đánh dấu `has_medians = 0` |
| Bài khóa có 2 danh mục | 1 | Chọn 1 |
| Thiếu bản dịch câu, nghĩa vi cho từ Mandarin Bean, Ý/Âm cho 11.263 chữ | — | Phase 9 (AI + người duyệt) |

---

## 7. Phát hiện từ tài liệu tính năng ảnh hưởng tới thiết kế

Nguồn: [docs/features/](../features/README.md).

| Phát hiện | Điều chỉnh thiết kế / migration |
|---|---|
| better-sqlite3 bật khoá ngoại mặc định; Python `sqlite3` và CLI thì không | Mọi nơi mở DB (`db.ts`, script Node, `align-whisper.py`) đều phải chạy `PRAGMA foreign_keys = ON` tường minh |
| `words_fts` trigram không trả kết quả với truy vấn dưới 3 ký tự, trong khi phần lớn truy vấn chữ Hán dài 1–2 chữ | Truy vấn ngắn dùng nhánh riêng: `hanzi = ?` / `hanzi LIKE ?` trên index, `pinyin_plain LIKE ?`. Đồng bộ FTS bằng trigger trên `words` và `word_senses` |
| Bỏ dấu `ü → v` hiện không chạy; tìm theo nghĩa phải gõ đúng dấu tiếng Việt | Thêm `meaning_plain` (bỏ dấu tiếng Việt) vào FTS; `pinyin_plain` chuẩn hoá `ü` thành `v` |
| Ngoặc kép cong `“ ” ‘ ’` không được coi là dấu câu ở TS, còn bên Python lại có bộ dấu câu khác | Migration dùng **một** bộ dấu câu chung: token dấu câu không có `s` và không tính vào `vocab_count`. Đưa bộ dấu câu thành hằng số dùng chung cho TS và Python |
| Không code nào ghi Checked/Uncheck; trang align tự tính trạng thái từ số câu thiếu mốc; 3 bài đang lệch | `review_status` là quyết định của người duyệt, chỉ ghi qua UI align. Tiến độ căn mốc tính từ `passage_sentences`, không lưu riêng. Migration lấy theo `categories` và in ra danh sách 3 bài lệch để duyệt |
| Chạy lại `import-mandarin-bean.mjs` ghi đè câu đã tách và mất mốc audio; `migrate-mb-split-sentences` xoá mốc | Ở v4, import chỉ thêm bài mới (`INSERT … ON CONFLICT DO NOTHING`) hoặc cập nhật metadata; không bao giờ ghi đè `passage_sentences` đã có mốc. Bỏ `content_text`, nên không còn nguồn lệch |
| UI align không gửi pinyin khi lưu | Phải gửi `tokens` đầy đủ (gồm `p`) khi lưu `passage_sentences` |
| `kanji.popular` là chuỗi nên ô "Phổ biến" luôn sai | `characters.frequency` 1–5 sửa được lỗi này |
| 69% "Danh từ" do script gán mặc định | Migration **không tin** cột `pos` của vocab: import vào `word_senses.pos` kèm `source='import'`, đánh dấu `verified = 0`, soát lại ở Phase 9; không dùng `fill-pos-local.mjs` nữa |
| Ngữ pháp Hanzii mất nội dung khi parse; `formula` trùng `title` | Parse lại một lần lúc migrate, **giữ nguyên văn `contents`** trong `explanation` thay vì lọc dòng; `formula` chỉ lấy từ dòng "Cấu trúc:" |
| `/lesson/{id}`, `/grammar/[id]` và key `localStorage` `match-hs-<id>` phụ thuộc id bài cũ | Phase 7 cần route mới (`/vocab/hsk/[level]`, `/vocab/topic/[topic]`, `/grammar/[id]` theo `grammar_points.id`), kèm bảng chuyển hướng id cũ → route mới |
| Popup tra từ trong bài khóa lấy kết quả tìm kiếm đầu tiên | Ở v4 token đã có `s` (nghĩa đúng ngữ cảnh), nên popup đọc thẳng `word_senses` theo id, không tìm kiếm nữa |

---

## 8. Còn cần chốt

Đã chốt (2026-10-01):
- Ngữ pháp chia theo cấp HSK, thêm `source_data` = `hanzii` / `import`, không giữ cách nhóm theo bài.
- Đề thi phân loại theo cấp HSK, `source_data` = `crawl` / `ai`.
- App dùng cho một nhóm nhỏ, chưa có đăng nhập, nên chưa thêm `user_id`. Khi cần tách dữ liệu theo người, thêm `user_id` vào `note_folders`, `note_items`, `exam_attempts`.

- 437 điểm ngữ pháp Hanzii không có cấp HSK: để `hsk_level = NULL`, hiển thị thành nhóm "Chưa xếp cấp" và chia theo `category` (Li hợp / Dịch).
- Đề thi hiện theo chuẩn HSK 2.0 (cấp 1–6). Giữ cột `format` (`hsk2` / `hsk3`) để sau mở rộng sang HSK 3.0.
- Giữ SQLite: better-sqlite3 + SQL thuần, bọc async trong `repos/`. Không dùng ORM hay query builder.

Không còn câu hỏi mở. Kế hoạch triển khai: [../migration-plan.md](../migration-plan.md).
