-- HSK Web — schema thiết kế lại (v4)
--
-- Quy tắc chọn giữa "tách bảng" và "cột JSON":
--   • TÁCH BẢNG khi dữ liệu được query / lọc / join / cập nhật độc lập, hoặc được nhiều nơi tham chiếu.
--   • CỘT JSON khi dữ liệu chỉ thuộc về 1 dòng cha, luôn đọc/ghi nguyên khối, không bao giờ lọc theo nó.
--   • Không lặp dữ liệu: nghĩa từ chỉ nằm trong `words`, nơi khác chỉ giữ words.id.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ═══════════════════════════════════════════════════════════ 1. CHỮ HÁN (chỉ chữ đơn)
-- Bộ thủ: 214 bộ Khang Hy + dạng biến thể (cũ: kanji.radical text "nữ 女", 222 giá trị)
CREATE TABLE radicals (
  id            INTEGER PRIMARY KEY,
  form          TEXT NOT NULL UNIQUE,            -- 女 / 氵
  han_viet      TEXT NOT NULL,                   -- nữ
  kangxi_no     INTEGER CHECK (kangxi_no BETWEEN 1 AND 214),  -- 氵 và 水 cùng số 85
  meaning_vi    TEXT,                            -- phụ nữ
  stroke_count  INTEGER
);
CREATE INDEX radicals_kangxi ON radicals(kangxi_no);

CREATE TABLE characters (
  char            TEXT PRIMARY KEY CHECK (length(char) = 1),  -- 好
  radical_id      INTEGER REFERENCES radicals(id),
  han_viet        TEXT,                          -- hảo (cũ: cn_vi)
  pinyin          TEXT,                          -- các âm đọc của chữ: hǎo, hào
  stroke_count    INTEGER,
  -- Lục thư: tối đa 2 phép (cũ: text tự do, 20 kiểu viết, có '&amp;', thứ tự đảo lộn)
  formation       TEXT CHECK (formation  IN ('pictograph','ideograph','compound','phono_semantic','loan','derivative')),  -- tượng hình / chỉ sự / hội ý / hình thanh / giả tá / chuyển chú
  formation2      TEXT CHECK (formation2 IN ('pictograph','ideograph','compound','phono_semantic','loan','derivative')),
  structure       TEXT,                          -- ⿰,女,子 (cũ: hinhthai)
  stroke_order    TEXT,                          -- (cũ: netbut)
  frequency       INTEGER CHECK (frequency BETWEEN 1 AND 5),  -- 1 rất thấp .. 5 rất cao (cũ: popular, text)
  -- Dữ liệu tham khảo crawl từ Hanzii về CHỮ (không phải từ vựng) — chỉ hiển thị → JSON
  hv_meanings     TEXT CHECK (hv_meanings    IS NULL OR json_valid(hv_meanings)),     -- ["tốt, hay, đẹp","sung sướng"] (cũ: means_tdpt)
  hv_compounds    TEXT CHECK (hv_compounds   IS NULL OR json_valid(hv_compounds)),    -- ["hảo cảm 好感","hảo hán 好漢"] (cũ: means_tg)
  hv_dictionary   TEXT CHECK (hv_dictionary  IS NULL OR json_valid(hv_dictionary)),   -- mục từ điển Thiều Chửu (cũ: means_tdtd)
  crawl_status    TEXT NOT NULL DEFAULT 'pending' CHECK (crawl_status IN ('pending','ok','error')),
  crawl_error     TEXT,
  crawled_at      TEXT
);
CREATE INDEX characters_radical ON characters(radical_id);

-- Phân tích Ý / Âm: 妈 = 女 (ý) + 马 (âm). Thành phần là một chữ → FK về characters,
-- nên query được "các chữ có âm 马": 妈 吗 码 骂 (cũ: botu, botu_claude, vocab[].botu — 3 chỗ)
CREATE TABLE character_components (
  char        TEXT NOT NULL REFERENCES characters(char) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  component   TEXT NOT NULL REFERENCES characters(char),
  role        TEXT NOT NULL CHECK (role IN ('meaning','sound','self')),  -- ý / âm / độc thể
  note        TEXT,                              -- "phụ nữ", "mã - đọc mā"
  source      TEXT NOT NULL CHECK (source IN ('ai','manual')),
  verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),  -- đã có người duyệt
  PRIMARY KEY (char, position)
) WITHOUT ROWID;
CREATE INDEX character_components_component ON character_components(component, role);

-- Dữ liệu nét cho HanziWriter (flash card, panel chi tiết). Cũ: kanji.strokes_svg — tên sai, thực chất là
-- JSON {strokes:[path SVG], medians:[[x,y]...], radStrokes:[idx]}. Chỉ có dòng cho chữ có dữ liệu;
-- chữ không có dòng → UI để HanziWriter tự tải từ CDN như hiện nay.
CREATE TABLE character_strokes (
  char        TEXT PRIMARY KEY REFERENCES characters(char) ON DELETE CASCADE,
  data        TEXT NOT NULL CHECK (json_valid(data) AND json_type(data, '$.strokes') = 'array'),
  has_medians INTEGER NOT NULL CHECK (has_medians IN (0,1)),   -- thiếu medians thì không animate/quiz chuẩn
  source      TEXT NOT NULL DEFAULT 'hanzii' CHECK (source IN ('hanzii','hanzi_writer_data','manual'))
);

-- ═══════════════════════════════════════════════════════════ 2. TỪ VỰNG (từ đơn + từ ghép)
-- word  = cách viết + cách đọc  (会 huì)            → đơn vị tra từ
-- sense = một nghĩa + một từ loại (会 huì: biết / sẽ / cuộc họp) → đơn vị HỌC:
--         ví dụ, bài tập, ghi chú, câu hỏi thi đều gắn vào sense.
CREATE TABLE words (
  id            INTEGER PRIMARY KEY,
  hanzi         TEXT NOT NULL,                   -- 会 / 爸爸 / 互联网
  traditional   TEXT,
  pinyin        TEXT NOT NULL,                   -- chuẩn hoá: không khoảng trắng thừa, dạng từ điển (yīzài, không phải yí zài)
  pinyin_plain  TEXT NOT NULL,                   -- huì → hui, lǜ → lv (tìm kiếm không dấu)
  han_viet      TEXT,                            -- hội / bả bả
  hsk_level     INTEGER CHECK (hsk_level BETWEEN 1 AND 7),  -- cấp THẤP NHẤT mà từ xuất hiện
  topic         TEXT,
  source        TEXT NOT NULL CHECK (source IN ('import','mandarin_bean','ai','manual')),
  mb_word_id    TEXT UNIQUE,                     -- Mandarin Bean: 1 wordId = 1 word (54380 = 会 huì)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (hanzi, pinyin)                         -- 行 xíng và 行 háng là 2 word
);
CREATE INDEX words_hsk   ON words(hsk_level);
CREATE INDEX words_topic ON words(topic) WHERE topic IS NOT NULL;
CREATE INDEX words_hanzi ON words(hanzi);

-- Từ ↔ chữ: 爸爸 = 爸 + 爸. Bấm vào 1 chữ → mọi từ chứa chữ đó; bộ thủ lấy qua characters.
CREATE TABLE word_characters (
  word_id   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  char      TEXT NOT NULL REFERENCES characters(char),
  PRIMARY KEY (word_id, position)
) WITHOUT ROWID;
CREATE INDEX word_characters_char ON word_characters(char);

-- Danh mục từ loại cố định (cũ: text tự do, có cả 'Động từ / Danh từ' gộp chung 1 ô)
CREATE TABLE parts_of_speech (
  code      TEXT PRIMARY KEY,                    -- n, v, adj, adv, m, conj, pron, prep, num, part, propn, intj, vo (ly hợp), modal, phrase
  name_vi   TEXT NOT NULL,                       -- Danh từ
  name_zh   TEXT                                 -- 名词
);

CREATE TABLE word_senses (
  id          INTEGER PRIMARY KEY,
  word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,                  -- thứ tự hiển thị, nghĩa phổ biến trước
  pos         TEXT NOT NULL REFERENCES parts_of_speech(code),
  meaning_vi  TEXT,                              -- biết (làm gì)
  meaning_en  TEXT,                              -- can; to know how to
  hsk_level   INTEGER CHECK (hsk_level BETWEEN 1 AND 7),  -- nghĩa này được dạy ở cấp nào (会 "biết" HSK1, "cuộc họp" HSK3)
  note        TEXT,                              -- cách dùng, lưu ý
  source      TEXT NOT NULL CHECK (source IN ('import','mandarin_bean','ai','manual')),
  verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),  -- pos/nghĩa đã có người duyệt (pos cũ: 69% "Danh từ" mặc định)
  UNIQUE (word_id, position)
);
CREATE INDEX word_senses_word ON word_senses(word_id);

CREATE TABLE sense_examples (
  sense_id   INTEGER NOT NULL REFERENCES word_senses(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  zh         TEXT NOT NULL,                      -- 我会说汉语。
  pinyin     TEXT,
  vi         TEXT,
  en         TEXT,
  PRIMARY KEY (sense_id, position)
) WITHOUT ROWID;

-- rowid = words.id. Do repo words ghi lại mỗi khi lưu word/sense (không dùng trigger vì meanings gộp từ nhiều sense).
-- Trigram cần ≥ 3 ký tự: truy vấn 1–2 ký tự đi nhánh riêng (words.hanzi = ? / LIKE, pinyin_plain LIKE).
CREATE VIRTUAL TABLE words_fts USING fts5(
  hanzi, pinyin_plain, han_viet,
  meanings,                                      -- gộp meaning_vi + meaning_en của mọi sense
  meanings_plain,                                -- meanings bỏ dấu tiếng Việt ("hoc" tìm ra "học")
  tokenize='trigram'
);

-- ═══════════════════════════════════════════════════════════ 3. BÀI KHÓA
-- Chép chính tả + đọc bài. Crawl (Mandarin Bean) hoặc AI sinh ra.
CREATE TABLE passages (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  source          TEXT NOT NULL CHECK (source IN ('mandarin_bean','ai','manual')),
  source_url      TEXT,                          -- khi source = 'mandarin_bean'
  ai_model        TEXT,                          -- khi source = 'ai', vd 'claude-opus-5-5'
  ai_params       TEXT CHECK (ai_params IS NULL OR json_valid(ai_params)),  -- {level, topic, target_words:[id], grammar:[id]}
  title_zh        TEXT NOT NULL,
  title_zh_trad   TEXT,
  title_en        TEXT,
  title_vi        TEXT,
  hsk_level       INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 7),
  category        TEXT,                          -- Story / News / ... (cũ: categories JSON)
  audio_url       TEXT,
  audio_source    TEXT CHECK (audio_source IN ('crawl','tts')),
  review_status   TEXT NOT NULL DEFAULT 'unchecked' CHECK (review_status IN ('checked','unchecked')),  -- căn audio
  translation_status TEXT NOT NULL DEFAULT 'none' CHECK (translation_status IN ('none','ai','reviewed')),
  sentence_count  INTEGER NOT NULL DEFAULT 0,    -- cache, ghi lại mỗi khi lưu câu (chỉ 1 chỗ ghi)
  vocab_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX passages_list ON passages(hsk_level, review_status, category);

-- 1 dòng = 1 câu: chữ + tách từ + bản dịch + mốc audio nằm cùng nhau
-- (cũ: content[][] và sentence_timestamps[] là 2 mảng rời, khớp nhau theo index)
CREATE TABLE passage_sentences (
  passage_id   INTEGER NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  zh           TEXT NOT NULL,                    -- 老师问五岁的小王：
  tokens       TEXT NOT NULL CHECK (json_valid(tokens)),  -- [{"h":"老师","p":"lǎo shī","s":123}, {"h":"："}]  s = word_senses.id (nghĩa đúng ngữ cảnh)
  vi           TEXT,                             -- bản dịch theo câu
  en           TEXT,
  audio_start  REAL,
  audio_end    REAL,
  PRIMARY KEY (passage_id, idx),
  CHECK (audio_start IS NULL OR audio_end IS NULL OR audio_start < audio_end)
) WITHOUT ROWID;

-- ═══════════════════════════════════════════════════════════ 4. NGỮ PHÁP
-- Gộp hanzii_grammar + grammar trong bài upload (cũ: lessons.data.grammar[]).
-- Chia nhóm DUY NHẤT theo hsk_level; không giữ cách nhóm theo bài cũ.
CREATE TABLE grammar_points (
  id            INTEGER PRIMARY KEY,
  source_data   TEXT NOT NULL CHECK (source_data IN ('hanzii','import')),  -- crawl Hanzii / upload file (Claude sinh)
  external_uid  TEXT UNIQUE,                     -- uid Hanzii (NULL khi import)
  title         TEXT NOT NULL,                   -- 还是……吧
  title_vi      TEXT,
  formula       TEXT,
  explanation   TEXT,
  use_for       TEXT,
  keywords      TEXT,
  hsk_level     INTEGER CHECK (hsk_level BETWEEN 1 AND 7),  -- 7 = HSK 7-9; NULL = nhóm "Chưa xếp cấp" (437 điểm "Li hợp"/"Dịch", phân theo category)
  cefr          TEXT CHECK (cefr IN ('A1','A2','B1','B2','C1','C2')),
  category      TEXT,                            -- 'Li hợp', 'Dịch' (cũ: nằm lẫn trong level/hsk)
  comparisons   TEXT CHECK (comparisons IS NULL OR json_valid(comparisons)),  -- so sánh 帮/帮忙/帮助
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX grammar_points_hsk ON grammar_points(hsk_level, source_data);

CREATE TABLE grammar_examples (
  grammar_id  INTEGER NOT NULL REFERENCES grammar_points(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  zh          TEXT NOT NULL,
  pinyin      TEXT,
  vi          TEXT,
  note        TEXT,
  PRIMARY KEY (grammar_id, position)
) WITHOUT ROWID;

CREATE TABLE grammar_exercises (
  id           INTEGER PRIMARY KEY,
  grammar_id   INTEGER NOT NULL REFERENCES grammar_points(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('fill','choice')),
  question     TEXT NOT NULL,
  blank        TEXT,
  options      TEXT CHECK (options IS NULL OR json_valid(options)),
  answer       TEXT NOT NULL,
  explanation  TEXT,
  UNIQUE (grammar_id, position)
);

-- ═══════════════════════════════════════════════════════════ 5. BÀI KIỂM TRA (format HSK)
-- Hiện dùng chuẩn HSK 2.0 (format = 'hsk2'): HSK1–2 nghe + đọc; HSK3–6 nghe + đọc + viết. 'hsk3' để mở rộng.
-- Cây: exam → section (听力/阅读/书写) → group (1 audio / 1 đoạn văn / 1 bộ đáp án dùng chung) → question
CREATE TABLE exams (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,                   -- HSK3 – Đề 01
  format        TEXT NOT NULL DEFAULT 'hsk2' CHECK (format IN ('hsk2','hsk3')),  -- hiện chỉ dùng hsk2; hsk3 để mở rộng
  hsk_level     INTEGER NOT NULL,
  source_data   TEXT NOT NULL CHECK (source_data IN ('crawl','ai')),
  source_url    TEXT,                            -- khi crawl
  ai_model      TEXT,                            -- khi AI sinh
  ai_params     TEXT CHECK (ai_params IS NULL OR json_valid(ai_params)),  -- {hsk_level, sections, target senses/grammar}
  duration_min  INTEGER,
  pass_score    INTEGER,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (source_data <> 'crawl' OR source_url IS NOT NULL),
  CHECK ((format = 'hsk2' AND hsk_level BETWEEN 1 AND 6)
      OR (format = 'hsk3' AND hsk_level BETWEEN 1 AND 7))   -- HSK 3.0: cấp 7 = bài thi chung cho 7–9
);
CREATE INDEX exams_level ON exams(format, hsk_level, source_data);

CREATE TABLE exam_sections (
  id            INTEGER PRIMARY KEY,
  exam_id       INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  skill         TEXT NOT NULL CHECK (skill IN ('listening','reading','writing')),
  title         TEXT,                            -- 一、听力
  audio_url     TEXT,                            -- 1 file audio cho cả phần nghe
  duration_min  INTEGER,
  max_score     INTEGER NOT NULL DEFAULT 100,
  UNIQUE (exam_id, position)
);

CREATE TABLE exam_question_groups (
  id            INTEGER PRIMARY KEY,
  section_id    INTEGER NOT NULL REFERENCES exam_sections(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,                -- 第一部分, 第二部分...
  type          TEXT NOT NULL CHECK (type IN (
                  'true_false',      -- 判断对错 (nghe/đọc, có thể kèm tranh)
                  'choice',          -- 选择 A/B/C(/D)
                  'match',           -- 匹配 tranh/câu dùng chung bộ đáp án
                  'fill_word',       -- 选词填空
                  'reorder',         -- 排列顺序 (đọc)
                  'build_sentence',  -- 完成句子 (xếp từ thành câu)
                  'write_hanzi',     -- 看拼音写汉字
                  'picture_sentence',-- 看图，用词造句
                  'essay'            -- 缩写 / viết đoạn
                )),
  instructions  TEXT,
  shared        TEXT CHECK (shared IS NULL OR json_valid(shared)),   -- đáp án/tranh dùng chung, đoạn văn
  passage_id    INTEGER REFERENCES passages(id),  -- đọc hiểu dựa trên bài khóa có sẵn
  audio_start   REAL,                            -- đoạn audio trong exam_sections.audio_url
  audio_end     REAL,
  UNIQUE (section_id, position)
);

CREATE TABLE exam_questions (
  id            INTEGER PRIMARY KEY,
  group_id      INTEGER NOT NULL REFERENCES exam_question_groups(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,                -- số câu trên đề (1..100)
  content       TEXT NOT NULL CHECK (json_valid(content)),  -- đề bài, theo type của group
  answer        TEXT CHECK (answer IS NULL OR json_valid(answer)),  -- NULL với essay
  points        REAL NOT NULL DEFAULT 1,
  transcript    TEXT,                            -- lời thoại (câu nghe)
  explanation   TEXT,
  audio_start   REAL,
  audio_end     REAL,
  sense_id      INTEGER REFERENCES word_senses(id),      -- kiến thức câu này kiểm tra
  grammar_id    INTEGER REFERENCES grammar_points(id)
);
CREATE INDEX exam_questions_group ON exam_questions(group_id, number);

CREATE TABLE exam_attempts (
  id            INTEGER PRIMARY KEY,
  exam_id       INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  submitted_at  TEXT,
  total_score   REAL,
  section_scores TEXT CHECK (section_scores IS NULL OR json_valid(section_scores))  -- {"listening":80,...}
);

CREATE TABLE exam_answers (
  attempt_id    INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  response      TEXT CHECK (response IS NULL OR json_valid(response)),
  is_correct    INTEGER CHECK (is_correct IN (0,1)),
  score         REAL,
  graded_by     TEXT CHECK (graded_by IN ('auto','ai','manual')),
  feedback      TEXT,                            -- nhận xét AI cho câu viết
  PRIMARY KEY (attempt_id, question_id)
) WITHOUT ROWID;

-- ═══════════════════════════════════════════════════════════ 6. GHI CHÚ
CREATE TABLE note_folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE note_items (
  id                 TEXT PRIMARY KEY,
  folder_id          TEXT NOT NULL REFERENCES note_folders(id) ON DELETE CASCADE,
  word_id            INTEGER NOT NULL REFERENCES words(id),
  sense_id           INTEGER REFERENCES word_senses(id),  -- NULL = lưu cả từ
  source_passage_id  INTEGER REFERENCES passages(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (folder_id, word_id)
);
