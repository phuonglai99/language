# Chép chính tả (Dictation / 听写)

> Viết dựa trên code ở working tree ngày 2026-10-01. Số liệu DB lấy từ `data/lessons.db` bằng `SELECT` chỉ đọc. Các ví dụ thuật toán được chạy lại bằng một bản copy của `src/lib/dictation.ts` trong scratchpad, với `node --experimental-strip-types`.

## Mục đích

Người học nghe từng câu của bài Mandarin Bean và gõ lại bằng chữ Hán. Hệ thống tô màu từng từ ngay khi đang gõ. Khi người học yêu cầu, hệ thống chấm cả câu trên server, rồi hiển thị đáp án và tiến độ cả bài.

## Màn hình & route

| Route | File | Loại |
|---|---|---|
| `/dictation` | `src/app/dictation/page.tsx` | Client Component (bọc `Suspense`), fetch API |
| `/dictation/[slug]` | `src/app/dictation/[slug]/page.tsx` | Client Component, fetch API |
| Thư viện | `src/lib/dictation.ts` | Dùng chung client + server |

Trang `/dictation/[slug]` chia 3 cột (`[slug]/page.tsx:413`):
- Trái: điều khiển nghe (tốc độ, Audio/TTS, audio gốc, phím tắt).
- Giữa: chọn độ khó, chuyển câu, các ô từ, textarea, nút chấm, kết quả.
- Phải: "Bàn chép", tiến độ từng câu, thanh điểm, tổng kết.

## Luồng xử lý

### A. Danh sách `/dictation`
1. Đọc `hsk`, `q`, `status` từ URL (`dictation/page.tsx:60-62`).
2. `useEffect` gọi `GET /api/dictation/lessons?hsk_level=&q=&status=` mỗi khi filter đổi (dòng 69-78).
3. API gọi `queryMBLessons({..., searchContentText: true})` (`api/dictation/lessons/route.ts:8-13`). Ô tìm kiếm khớp cả `content_text`. Logic SQL được mô tả trong `reading.md`.
4. Gõ ô tìm thì `router.replace` ngay, **không debounce** (dòng 88-95). Bấm pill HSK hoặc trạng thái cũng `router.replace` (dòng 80-86).
5. Thẻ bài có badge Checked/Uncheck (lấy từ `categories`), 🎧/🔇 và `vocabCount`. Bấm thẻ thì sang `/dictation/[slug]`.

### B. Làm bài `/dictation/[slug]`
1. Lúc mount: `GET /api/dictation/lessons/[slug]` (`[slug]/page.tsx:176-181`).
2. API (`api/dictation/lessons/[slug]/route.ts:9-41`):
   - `getMBLesson` → `extractSentences(content)`.
   - Ghép timestamp theo `index`, dùng `Map(sentence_timestamps.index → {start,end})`.
   - Trả về `sentences[{index, hanzi, pinyin, wordCount, words, start, end}]` và meta bài. `vocabCount` được tính lại bằng `countLessonVocab`.
3. Người dùng nghe câu (Space, nút ▶ hoặc Tab). Cách chọn nguồn âm thanh xem mục "Phát âm thanh" bên dưới.
4. Người dùng gõ vào textarea. Mỗi lần render, client chạy `matchDictationWords(input, words)` để có `liveSlots` (dòng 369). `WordBlanks` tô màu từng ô từ, và bộ đếm "x/y từ" cập nhật theo.
5. Nhấn Enter (không giữ Shift) hoặc nút "✓ Chấm điểm":
   - `checkAnswer` POST `/api/dictation/check {slug, sentence_index: sentences[currentIndex].index, user_input}` (dòng 209-223).
   - Server load lại bài, `extractSentences`, tìm câu theo `index`, chạy `matchDictationWords` và `isDictationPerfect` (`api/dictation/check/route.ts:13-28`).
   - Kết quả trả về là `{result: WordSlot[], correct_hanzi, pinyin, is_perfect}`. Client lưu vào `results[currentIndex]`.
6. Hiển thị kết quả: "✓ Hoàn hảo!" hoặc "a/b từ đúng" kèm "Đáp án đúng" (hanzi + pinyin) (dòng 690-710). Bên phải, thẻ câu đổi viền xanh hoặc đỏ và hiện tối đa 12 slot.
7. Nút "↩" xóa kết quả của câu hiện tại để làm lại (dòng 672-686).
8. Chuyển câu (◄ ►, ←/→ khi focus không ở textarea, hoặc bấm thẻ bên phải) sẽ reset input, gợi ý và dừng mọi âm thanh (dòng 187-197).

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/dictation/lessons` | query `hsk_level` (hoặc `hsk`), `q`, `status` | `{lessons:[{slug,title_en,title_zh_simplified,title_zh_traditional,hsk_level,categories,audio_url,vocabCount}]}` | `src/app/api/dictation/lessons/route.ts:4-27` |
| GET | `/api/dictation/lessons/[slug]` | path `slug` | `{lesson:{…,vocabCount}, sentences:[{index,hanzi,pinyin,wordCount,words,start,end}]}` hoặc 404 | `src/app/api/dictation/lessons/[slug]/route.ts:5-42` |
| POST | `/api/dictation/check` | JSON `{slug, sentence_index, user_input}` | `{result: WordSlot[], correct_hanzi, pinyin, is_perfect}`; 400 thiếu field; 404 không thấy bài hoặc câu | `src/app/api/dictation/check/route.ts:5-29` |

`WordSlot = {expected, typed, status: 'empty'|'partial'|'correct'|'wrong'|'extra', kind: 'hanzi'|'number'|'latin'|'mixed', showHint}` (`src/lib/dictation.ts:19-28`).

## Dữ liệu

Tính năng này chỉ đọc DB, không ghi.

| Dùng cho | DB cũ (`mb_lessons`) | DB mới v4 |
|---|---|---|
| Danh sách, filter | như `reading.md` (`categories` LIKE, `content_text` LIKE khi tìm) | `passages` (+ `review_status`); tìm nội dung qua `passage_sentences.zh` |
| Câu | `content[i]` (1 phần tử = 1 câu sau migrate tách câu) | 1 dòng `passage_sentences` (`idx`) |
| Hanzi của câu | `content[i].map(w=>w.hanzi).join('')` | `passage_sentences.zh` |
| Danh sách từ cần gõ | `content[i][].hanzi` đã chuẩn hóa | `tokens[].h` |
| Pinyin gợi ý | `content[i][].pinyin` | `tokens[].p` |
| Mốc audio | `sentence_timestamps[k]` với `k.index == i` | `passage_sentences.audio_start`, `audio_end` (cùng dòng) |
| Audio | `audio_url` | `passages.audio_url` |
| Số từ | `countLessonVocab(content)` tính lại mỗi request | `passages.vocab_count` |

## Logic chi tiết

### Tách câu: `extractSentences` (`dictation.ts:145-154`)
- Mỗi phần tử `content[i]` là một câu, `index = i` (giữ nguyên index gốc).
- `hanzi`: nối mọi token, kể cả dấu câu.
- `pinyin`: nối pinyin của từng token bằng dấu cách. Token không có pinyin chỉ được giữ nếu hanzi là số hoặc Latin thuần (`pinyinHintToken`, dòng 137-143).
- `words = extractContentWords(para)`: chuẩn hóa từng token, bỏ những token trở thành rỗng (dòng 96-98).
- Bỏ các câu có `wordCount = 0`, tức câu chỉ gồm dấu câu.

### Chuẩn hóa: `cleanHanzi` / `normalizeDictationInput` (`dictation.ts:30,38-47`)
- `PUNCT_RE = /[，。？！：；「」『』、""''【】（）…—·\s]/g`. Regex xóa dấu câu full-width, khoảng trắng, và `"` `'` ASCII.
  - **Không xóa** `“ ” ‘ ’`: đã kiểm tra byte, trong file là U+0022/U+0027.
  - **Không xóa** dấu câu ASCII `, . ? ! : ;`.
- Sau đó đổi chữ số và chữ Latin full-width (U+FF10–19, FF21–3A, FF41–5A) sang ASCII.

### Phân loại token: `tokenKind` (`dictation.ts:49-56`)
| kind | Điều kiện (sau chuẩn hóa) | Cách so sánh |
|---|---|---|
| `number` | `^[0-9]+$` | Bằng nhau, hoặc người dùng gõ số Hán `零〇一二两三…九` được đổi từng chữ một thành chữ số (`chineseDigitsToArabic`, dòng 62-70). Ví dụ `一〇` khớp `10`; `十` không được hỗ trợ |
| `latin` | `^[A-Za-z]+$` | Không phân biệt hoa thường |
| `mixed` | có `[0-9A-Za-z]` | Không phân biệt hoa thường |
| `hanzi` | còn lại | So khớp tuyệt đối |

Token khác `hanzi` có `showHint = true`, tức ô từ hiện sẵn đáp án dạng nhỏ khi đang ở ô đó hoặc đã gõ (`[slug]/page.tsx:72`). Người học không phải đoán cách viết số hoặc tên riêng Latin.

### Chấm điểm thực tế: `matchDictationWords` (`dictation.ts:100-131`)
Đây là hàm duy nhất được dùng để chấm, ở cả client (`[slug]/page.tsx:369`) lẫn server (`check/route.ts:20`).
1. `cleaned = normalizeDictationInput(userInput)`, sau đó `cursor = 0`.
2. Với từng từ `expected` (theo thứ tự): `typed = cleaned.slice(cursor, cursor + expected.length)`, rồi `cursor += typed.length`.
   - `typed` rỗng → `empty`.
   - `typed` ngắn hơn `expected` → `partial` nếu là tiền tố (`tokenPrefixMatch`), ngược lại `wrong`.
   - Đủ độ dài → `correct` nếu `tokensEqual`, ngược lại `wrong`.
3. Nếu còn ký tự sau từ cuối → thêm 1 slot `extra` chứa toàn bộ phần dư.
4. `isDictationPerfect` = có ít nhất 1 slot và mọi slot đều `correct` (dòng 133-135). Có slot `extra` thì không hoàn hảo.

Thuật toán **cắt theo vị trí và độ dài từ**, không căn chỉnh (alignment). Gõ thiếu hoặc thừa một ký tự ở giữa câu sẽ làm lệch mọi từ phía sau. Ví dụ đã chạy thật:

```
words = [我, 喜欢, 吃, 苹果], input = "我欢吃苹果" (thiếu 喜)
→ 我:我:correct | 喜欢:欢吃:wrong | 吃:苹:wrong | 苹果:果:wrong     (1/4 đúng, dù chỉ thiếu 1 chữ)
```

Một hệ quả khác: chuẩn hóa số Hán chỉ đổi từng ký tự một, còn độ dài cắt lấy theo `expected.length`. Vì vậy `一〇` chỉ khớp `10` khi số ký tự bằng nhau.

### Xác minh ghi nhận "diffHanzi dùng positional scan ngây thơ"
- **Vẫn đúng, chưa sửa.** `diffHanzi` (`src/lib/dictation.ts:229-246`) so từng cặp `u[i]` với `c[i]` theo cùng chỉ số trong vòng lặp `for (i < max(len))`, không dùng LCS hay edit distance. Chạy thật: `diffHanzi('我欢吃苹果','我喜欢吃苹果')` → `我:correct 欢:wrong 吃:wrong 苹:wrong 果:wrong 果:missing`.
- **Nhưng `diffHanzi` là code chết.** Grep toàn bộ `src/` không thấy chỗ nào gọi; chỉ có định nghĩa của nó. Kiểu `CharResult`/`CharStatus` (dòng 11-17) cũng chỉ phục vụ hàm này.
- **Hàm chấm đang chạy là `matchDictationWords`, và nó có cùng lỗi lệch vị trí ở cấp từ** (ví dụ ở trên). Muốn sửa lỗi "gõ thiếu giữa câu" thì phải sửa `matchDictationWords`, ví dụ căn LCS hoặc edit distance trên chuỗi ký tự rồi chiếu kết quả về ranh giới từ. Sửa `diffHanzi` không có tác dụng.

### Phát âm thanh (`[slug]/page.tsx:153-309`)
Gọi `s = sentences[currentIndex]`:
1. **Audio gốc theo timestamp** khi `s.start != null && s.end != null` (`hasAlignedAudio`, dòng 153-154):
   - `playSentence(start, end)`: gán `currentTime = start`, gán `playbackRate`, rồi `play()`.
   - Gắn listener `timeupdate` để `pause()` khi `currentTime >= end + 0.15` (dòng 244-254).
   - Nếu `readyState < 1` thì đợi `loadedmetadata` rồi `load()` (dòng 264-273).
   - Độ chính xác điểm dừng phụ thuộc tần suất `timeupdate` của trình duyệt (chưa đo).
2. **TTS Web Speech API** khi câu chưa có timestamp nhưng có `hanzi`:
   - `speakSentence`: `SpeechSynthesisUtterance(hanzi)`, `lang='zh-CN'`, `rate = playbackRate * 0.85` (dòng 225-236).
   - `ttsSupported` = `'speechSynthesis' in window` (dòng 165).
   - TTS đọc cả dấu câu trong `hanzi`, vì chuỗi này chưa bị làm sạch.
3. **Phát audio gốc từ đầu** (`currentTime = 0`) chỉ khi câu không có `hanzi` (dòng 282-285, 305-308). Thực tế hầu như không xảy ra.
4. Nút ▶ và ↺ bị disable khi `!(hasAlignedAudio || ttsSupported)` (dòng 367, 477, 491).
5. Tốc độ: 0.75x hoặc 1x (dòng 432). `useEffect` gán `audio.playbackRate` khi giá trị đổi (dòng 183-185).
6. Thẻ `<audio controls>` "Audio gốc (cả bài)" chỉ render khi có `audio_url` (dòng 453-469). `audioRef` cũng chỉ tồn tại khi có thẻ này.

### Gợi ý (hint)
- Gợi ý pinyin cả câu (`currentSentence.pinyin`) hiện khi `showHint` bật, hoặc khi độ khó là `easy` (dòng 592-596).
- Ctrl/Cmd+H hoặc nút "Hiện gợi ý" bật/tắt gợi ý, đồng thời đánh dấu `hintUsed[currentIndex] = true` (dòng 326-331, 656-659). Thẻ câu bên phải hiện nhãn "hint" (dòng 752).
- Ở chế độ `easy`, pinyin luôn hiện và nút gợi ý bị ẩn. Lúc này `hintUsed` **không** được đánh dấu.
- Gợi ý theo từ: token số, Latin hoặc mixed tự hiện đáp án (`showHint`). Với các từ chữ Hán sai mà đã gõ đủ độ dài, `WordBlanks showExpectedOnWrong` hiện đáp án đúng phía trên ô (dòng 73-77, 586).

### Độ khó
`'easy' | 'normal' | 'hard'` (dòng 142). Code chỉ kiểm tra `difficulty === 'easy'` (dòng 592, 654). **`hard` hoạt động giống hệt `normal`.**

### Tiến độ & điểm (dòng 199-207)
- `totalAnswered` = số câu đã chấm. `totalCorrect` = số câu `is_perfect`.
- `scorePercent` = trung bình độ chính xác theo từ (`correct / slot không phải extra`) cộng lại rồi **chia cho tổng số câu của bài**. Câu chưa làm tính là 0. Slot `extra` không làm giảm điểm phần trăm.
- Header hiển thị `vocabCount từ · totalAnswered/sentences.length câu`.
- Header có link "Cắt thủ công" sang `/dictation/align/[slug]` khi còn câu thiếu mốc (dòng 400-408).

### Phím tắt (dòng 311-342)
| Phím | Điều kiện | Hành động |
|---|---|---|
| Space | focus không ở textarea/input | `togglePlay` |
| Tab | luôn luôn (kể cả trong textarea) | `replayAudio` |
| Enter | ngoài textarea; trong textarea thì do `onKeyDown` riêng xử lý (Enter không kèm Shift) | `checkAnswer` |
| Ctrl/Cmd+H | luôn luôn | bật/tắt gợi ý |
| ← / → | ngoài textarea | chuyển câu |

### IME
Khi đang gõ bằng bộ gõ (composition), `liveSlots` tính trên `inputBeforeIme`, tức nội dung trước lúc bắt đầu composition. Nhờ vậy pinyin tạm của IME không bị tô đỏ. Khi `compositionend`, giá trị mới được set (dòng 602-609).

## Trạng thái phía client

| State | Dòng | Ghi chú |
|---|---|---|
| `lesson`, `sentences`, `loading`, `notFound` | 129-132 | Lấy từ API |
| `currentIndex` | 134 | Vị trí trong mảng `sentences` (khác `sentence.index`) |
| `userInput`, `composing`, `inputBeforeIme` | 135, 144-145 | |
| `results: Record<currentIndex, CheckResult>` | 137 | Khóa là **vị trí mảng** |
| `showHint`, `hintUsed` | 138-139 | |
| `playbackRate`, `isPlaying`, `ttsSupported` | 140-143 | |
| `difficulty` | 142 | |
| refs `audioRef`, `utteranceRef`, `stopHandlerRef`, `textareaRef`, `rightPanelRef` | 147-151 | |

**Không lưu gì bền vững.** Grep `localStorage`/`sessionStorage` trong `src/app/dictation` không có kết quả. Reload trang là mất toàn bộ kết quả, gợi ý và độ khó. Không có cache API phía client.

## Script liên quan

- `scripts/migrate-mb-split-sentences.mjs`: tách `content` thành câu. Đây là điều kiện để mỗi phần tử `content[i]` là một câu nghe được.
- `scripts/align-whisper.py`: tạo `sentence_timestamps`. Câu nào không có timestamp thì phải dùng TTS.

Chi tiết ở `dictation-align.md` và `mandarin-bean-pipeline.md`.

## Vấn đề phát hiện

1. **Chấm lệch vị trí khi gõ thiếu hoặc thừa giữa câu.** `matchDictationWords` cắt chuỗi theo `expected.length` tuần tự (`dictation.ts:102-107`). Ví dụ đã chạy ở trên cho kết quả 1/4 từ đúng khi chỉ thiếu 1 chữ. `diffHanzi` (dòng 229-246) có cùng kiểu lỗi nhưng là code chết.
2. **Dấu ngoặc kép cong biến thành "từ" bắt buộc phải gõ.** `PUNCT_RE` không chứa `“ ” ‘ ’` (dòng 30), nên `extractContentWords` giữ lại `“`, và `。”` sau chuẩn hóa thành `”`. Chạy thật với `[他说, ：“, 你好, 。”]` → `words = ["他说","“","你好","”"]`. Gõ `他说你好` cho kết quả `他说:correct | “:你:wrong | 你好:好:wrong | ”::empty`. **799 câu** trong DB chứa token có `“”‘’`.
3. **Dấu câu ASCII không được bỏ.** Người dùng gõ `,` (IME ở chế độ half-width) thì mọi từ phía sau bị lệch. Chạy thật `matchDictationWords('他说,你好',['他说','你好'])` → `你好:,你:wrong | :好:extra`. Ngoài ra, 132 câu trong DB có token chứa `, . ? ! ; :` ASCII. Số này có thể bao gồm cả số thập phân, chưa phân loại.
4. **`checkAnswer` không kiểm tra `res.ok`** (`[slug]/page.tsx:218-219`). Khi API trả 400/404 `{error}`, object lỗi vẫn bị lưu vào `results`. Lúc render, `currentResult.result.filter(...)` (dòng 698) và `r.result.filter` (dòng 759) sẽ ném TypeError vì `result` là `undefined`. Không có `catch`, nên lỗi mạng cũng không báo cho người dùng.
5. **Câu có timestamp nhưng bài không có `audio_url`** thì `playSentence` thoát âm thầm vì `audioRef.current` null (dòng 239-240). Câu đó cũng không fallback sang TTS, trong khi nút vẫn bật. Hiện 729/729 bài có `audio_url` nên lỗi này chưa xảy ra, nhưng code không chặn.
6. **Danh sách `/dictation` không debounce và không hủy request cũ** (`dictation/page.tsx:69-78, 88-95`). Gõ nhanh tạo nhiều fetch song song; response về sau có thể ghi đè kết quả mới hơn. Fetch lỗi thì `loading` kẹt ở `true` vì không có `catch`.
7. **Độ khó `hard` không có tác dụng** (dòng 592, 654).
8. **Tiến độ không lưu**: không có localStorage hay DB.
9. **TTS đọc cả dấu câu** vì `hanzi` không được làm sạch (dòng 228). Mức ảnh hưởng tới giọng đọc phụ thuộc engine (chưa xác minh).
10. **Chấm trùng lặp client/server.** Client đã tính `liveSlots` bằng chính `matchDictationWords`, rồi server tính lại. Kết quả giống nhau vì cùng code và cùng dữ liệu. Round-trip chỉ có thêm `correct_hanzi`/`pinyin`, mà client đã có sẵn trong `sentences`.
11. **Code thừa**: `diffHanzi`, `CharResult`, `CharStatus`, `isHintToken` (dòng 58-60) không được dùng (đã grep). State `utteranceRef` chỉ được gán, không đọc (dòng 150, 234).
12. **`results` khóa theo vị trí mảng.** Nếu sau này danh sách câu thay đổi khi đang làm bài thì kết quả sẽ gắn nhầm câu. Hiện không xảy ra trong một phiên, vì `sentences` chỉ load một lần.

## Ảnh hưởng khi chuyển DB v4

1. `/api/dictation/lessons`: đổi theo `queryMBLessons` mới. `searchContentText` phải tìm qua `passage_sentences.zh`, ví dụ `EXISTS (SELECT 1 FROM passage_sentences WHERE passage_id = p.id AND zh LIKE ?)`, vì không còn cột `content_text`. Status lấy từ `review_status`.
2. `/api/dictation/lessons/[slug]`:
   - Bỏ `extractSentences(content)` + `Map` timestamp. Thay bằng `SELECT idx, zh, tokens, audio_start, audio_end FROM passage_sentences WHERE passage_id=? ORDER BY idx`.
   - `words` = `tokens.map(t => normalize(t.h)).filter(Boolean)`; `pinyin` = `tokens[].p`.
   - `start`/`end` = `audio_start`/`audio_end`.
   - `vocabCount` = `passages.vocab_count`.
3. `/api/dictation/check`: tìm câu bằng `(passage_id, idx)` thay vì parse cả bài. `sentence_index` giữ nghĩa là `idx`.
4. `src/lib/dictation.ts`:
   - `extractSentences` và `pinyinHintToken` đang nhận `MBLessonWord[][]`; cần bản mới nhận `tokens {h,p,s}`.
   - Quy tắc "bỏ câu có wordCount = 0" phải giữ để `idx` khớp. Hiện DB không có câu nào chỉ gồm dấu câu: `SUM(sentence_count) = 6629 = tổng số câu`.
   - Nên sửa `PUNCT_RE` trước hoặc cùng lúc migrate. `align-whisper.py:28` ghi "Keep in sync" nhưng hiện đang lệch (xem `dictation-align.md`).
5. Nếu thêm `passage_sentences.vi/en` thì có thể hiển thị bản dịch sau khi chấm (hiện chưa có UI).
6. Nếu muốn lưu tiến độ thì schema v4 chưa có bảng cho dictation attempts. `exam_attempts`/`exam_answers` chỉ dành cho đề thi.
