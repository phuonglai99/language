# Chi tiết chữ Hán và nét viết

## Mục đích

- **Panel Hán tự** (`KanjiPanel`): bấm một chữ trên flashcard → panel bên phải hiện âm Hán Việt, pinyin, bộ thủ, số nét, lục thư, hình thái, nét bút, độ phổ biến, phân tích Ý/Âm, nghĩa, từ ghép, hoạt ảnh nét viết.
- **Hoạt ảnh nét viết trên thẻ** (`CharStroke` / `WordStroke`): mặt trước flashcard vẽ nét từng chữ của từ.
- Dữ liệu chữ lấy từ bảng `kanji` (crawl sẵn từ Hanzii); chữ chưa có thì API tự gọi Hanzii, giải mã, lưu DB rồi trả về.

Chỉ trang `/lesson/[id]` (chế độ flash) dùng tính năng này: không nơi nào khác gọi `/api/kanji` (đã grep `src/`).

## Màn hình & route

| Thành phần | File | Ghi chú |
|---|---|---|
| `ClickableHanzi` | `src/app/lesson/[id]/page.tsx:38-52` | Chỉ chữ trong `U+4E00–U+9FFF` bấm được |
| `loadHW` | `page.tsx:61-75` | Tải HanziWriter cho `CharStroke` (script id `hanzi-writer-js`) |
| `CharStroke` | `page.tsx:77-122` | Vẽ 1 chữ, nút ↺ phát lại |
| `WordStroke` | `page.tsx:124-133` | Lọc chữ CJK của từ; cỡ 72/64/56 px theo số chữ (≤2 / 3 / ≥4) |
| `KanjiPanel` | `page.tsx:146-282` | Panel cố định `top: 66`, rộng 320 px; nội dung chính thu lại `marginRight: 320` (`page.tsx:400, 471`) |
| `GET /api/kanji/[char]` | `src/app/api/kanji/[char]/route.ts` | Cache DB → Hanzii |

Mở panel: bấm chữ ở mặt trước hoặc mặt sau thẻ (`page.tsx:484, 493`). Đóng: nút ✕, `Esc` (`page.tsx:375`), chuyển thẻ (‹ › ← →), đổi chế độ.

## Luồng xử lý

### A. Panel Hán tự
1. Bấm chữ → `setKanjiChar(c)` → render `KanjiPanel`.
2. `fetch('/api/kanji/' + encodeURIComponent(char))` (`page.tsx:151-157`).
3. API: `decodeURIComponent(params.char)` → `getKanji` (`route.ts:64-69`, `db.ts:142-150`): `SELECT char, cn_vi, …, strokes_svg, botu, botu_claude FROM kanji WHERE char = ?`.
4. Không có dòng → `fetchFromHanzii` (`route.ts:31-60`):
   1. `GET https://api2.hanzii.net/api/search/all/vi/kanji/?key=<char>&page=1&limit=5`, header `Referer: https://hanzii.net/`.
   2. Body `{data: <base64>}` → giải mã AES-256-CBC (`route.ts:7-27`): khoá = SHA-256 của chuỗi thu được khi base64-decode `SECRET_KEY`, đảo ngược byte, XOR lặp với `"myPepper123"`; IV = 16 byte đầu của dữ liệu.
   3. Lấy `result[0]`: `cn_vi`, `pinyin`, `count`→`strokes`, `sets`→`radical`, `lucthu`, `hinhthai`, `netbut`, `popular`, `content[0].means.{tdpt,tg,tdtd}`, `strokes`→`strokes_svg`.
   4. `saveKanji` (`db.ts:152-191`): tạo bảng `kanji` nếu chưa có, `INSERT … ON CONFLICT(char) DO UPDATE` (không ghi `raw`, không đụng `botu_claude`), rồi `getKanji` lại.
5. Vẫn không có → 404 `{error:'not found'}` → panel hiện "Chưa có dữ liệu cho chữ này".
6. Có → API trả JSON (xem bảng API); panel render và tải HanziWriter (script id `hanzi-writer-script`, `page.tsx:159-179`) để vẽ chữ 120 px.

### B. Nét viết trên flashcard
1. `WordStroke` render một `CharStroke` cho mỗi chữ CJK; key gồm `idx` + `card.id` + vị trí, nên đổi thẻ là tạo lại.
2. `CharStroke` gọi **cùng API** `/api/kanji/[char]` (toàn bộ payload) và chỉ lấy `strokesSvg` (`page.tsx:85-89`). Cache miss cũng kích hoạt crawl Hanzii như luồng A.
3. `loadHW()` chèn `<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js">` một lần (promise dùng chung).
4. `HanziWriter.create(el, char, opts)` rồi `animateCharacter()` (`page.tsx:94-101`):
   - Có `strokesSvg` → `opts.charDataLoader = (_c, onLoad) => onLoad(charData)` (dữ liệu từ DB).
   - Không có → không đặt loader → HanziWriter dùng loader mặc định, tự tải `hanzi-writer-data@2.0` từ jsDelivr. Lỗi tải bị nuốt (`onLoadCharDataError: () => {}`), ô vẽ để trống.

## API

| Method | Path | Input | Output | File |
|---|---|---|---|---|
| GET | `/api/kanji/[char]` | `char` (1 chữ, URL-encoded) | `{char, cnVi, pinyin, strokes, radical, lucthu, hinhthai, netbut, popular, pos, meansTdpt[], meansTg[], meansTdtd[], strokesSvg (object hoặc null), botu (BotuPart[] hoặc null), botuSource ('claude' hoặc null)}`; 404 `{error}` | `src/app/api/kanji/[char]/route.ts:64-118` |

Cách tính một số trường (`route.ts:96-117`):
- `pos` = nội dung ngoặc đầu của `meansTdtd[0]`, vd `"(Tính) Tốt, lành…"` → `"Tính"`.
- `strokesSvg` = `JSON.parse(strokes_svg)` nếu chuỗi khác rỗng, ngược lại `null`.
- `botu` = `JSON.parse(botu_claude || botu)`; `botuSource` = `'claude'` nếu một trong hai có giá trị.

Gọi ngoài: Hanzii API (server), jsDelivr (trình duyệt: `hanzi-writer@3.5`, `hanzi-writer-data@2.0`).

## Dữ liệu

Bảng `kanji` cũ: 11.906 dòng.

| Trường UI | DB cũ (`kanji`) | DB mới v4 |
|---|---|---|
| `char` | `char` | `characters.char` |
| `cnVi` ("hảo.hiếu") | `cn_vi` | `characters.han_viet` |
| `pinyin` ("hǎo, hào") | `pinyin` | `characters.pinyin` |
| `strokes` | `strokes` | `characters.stroke_count` |
| `radical` ("nữ 女") | `radical` (text) | `characters.radical_id` → `radicals.han_viet`, `radicals.form` |
| `lucthu` | `lucthu` (text tự do, 20 kiểu) | `characters.formation`, `formation2` (mã tiếng Anh, UI phải map lại tiếng Việt) |
| `hinhthai` | `hinhthai` | `characters.structure` |
| `netbut` | `netbut` | `characters.stroke_order` |
| `popular` | `popular` (**text**: rất thấp/thấp/trung bình/cao/rất cao) | `characters.frequency` 1–5 |
| `meansTdpt` / `meansTg` / `meansTdtd` | `means_tdpt` / `means_tg` / `means_tdtd` (JSON) | `characters.hv_meanings` / `hv_compounds` / `hv_dictionary` |
| `strokesSvg` | `strokes_svg` (JSON HanziWriter `{strokes, medians, radStrokes}`, không phải SVG) | `character_strokes.data` (+ `has_medians`, `source`) |
| `botu`, `botuSource` | `botu_claude` (643 dòng), `botu` (130 dòng, đã copy sang `botu_claude`) | `character_components(char, position, component, role, note, source)` |
| (không dùng ở UI) | `raw` (39 MB), `crawled_at` | bỏ `raw`; `crawl_status`, `crawl_error`, `crawled_at` |

Số liệu nét viết (README §2.1, DESIGN §4.1, đo 2026-10-01):
- 8.009 chữ có dữ liệu nét; trong đó 7.704 có `medians`, **305 thiếu `medians`**.
- **3.896 chữ `strokes_svg = ''`** (Hanzii không trả): đều là chữ hiếm; thử 30 chữ trên CDN `hanzi-writer-data` thì 0/30 có.
- **2.883 chữ dùng trong vocab và bài khóa đều có dữ liệu nét** trong DB → ở flashcard, nhánh tải từ CDN gần như không xảy ra.
- 1 dòng `strokes_svg IS NULL`, 1 dòng `cn_vi IS NULL`, 0 dòng `crawled_at` dạng `ERROR:`.

## Logic chi tiết

### Hiển thị panel (`page.tsx:199-281`)
- Đầu: chữ lớn 72 px + ô HanziWriter 120 px.
- Pinyin; `cnVi` thay `.` bằng ` · ` và viết hoa; nhãn `pos` + tên đầy đủ qua `POS_NAMES` (Đại, Đt, Dt, Tt, Tr, P, C, K, T; mã khác chỉ hiện mã, `page.tsx:189-192`).
- Lưới 2 cột, chỉ hiện ô có giá trị: Bộ thủ (text nguyên "nữ 女"), Số nét, Lục thư, Hình thái, Nét bút, Phổ biến.
- "Phổ biến": `popularLabel(n)` so sánh số ≥ 80 / 60 / 40 (`page.tsx:181-187`) → xem Vấn đề #1.
- "Phân tích bộ thủ" + nhãn "Claude": mỗi thành phần một dòng, màu đỏ = ý, vàng = âm, đen = độc (`page.tsx:236-254`). Khác màu với flashcard (flashcard: vàng = ý, xanh = âm).
- "Nghĩa": danh sách `meansTdpt`. Dòng nghiêng: `meansTdtd[0]` bỏ phần "(…) " đầu. "Từ ghép": 8 mục đầu của `meansTg`.

### HanziWriter
- Thẻ: `strokeColor #333333`, `outlineColor rgba(0,0,0,0.12)`, `drawingColor #e01a3c`, `delayBetweenStrokes 200`, `strokeAnimationSpeed 1.1`, `padding 6` (`page.tsx:94-99`).
- Panel: 120 px, `padding 10`, `strokeAnimationSpeed 1`, **không truyền `charDataLoader`** (`page.tsx:167-171`).
- 305 chữ "thiếu `medians`" thực chất lưu dạng **mảng đường nét trần**, không phải object `{strokes, medians}` mà HanziWriter cần, nên khả năng cao là không vẽ được (chưa kiểm thử trên UI). Không chữ nào trong số này nằm trong nội dung học (xác minh 2026-10-02).

### Crawl hàng loạt (`scripts/crawl-hanzii.mjs`)
Xem Script liên quan.

### Các hàm trong `src/lib/db.ts`
- `getKanji(char)` (`:142-150`): gọi `ensureKanjiClaudeColumn` rồi SELECT 15 cột (không lấy `raw`).
- `ensureKanjiClaudeColumn` (`:101-108`): mỗi lần gọi đều thử `ALTER TABLE kanji ADD COLUMN botu` và `botu_claude` (lỗi bị nuốt); lần đầu trong tiến trình chạy `backfillKanjiBotuClaude`.
- `backfillKanjiBotuClaude` (`:115-140`): (1) `botu_claude = botu` nếu `botu_claude` rỗng; (2) duyệt mọi `lessons.data.vocab[].botu[]`, ghi `parts` vào `kanji.botu_claude` của `char` tương ứng nếu đang rỗng. Không bao giờ ghi đè. Chỉ UPDATE, không tạo dòng mới cho chữ chưa có trong `kanji`.
- `saveKanji(data)` (`:152-191`): `CREATE TABLE IF NOT EXISTS kanji` (+ tạo rồi xoá bảng `kanji_tmp_check`), upsert các cột Hanzii; cột `botu` chỉ được ghi khi INSERT mới (nhánh `DO UPDATE` không cập nhật `botu`); `botu_claude` không đụng.
- `updateKanjiBotu(char, botu)` (`:194-202`): upsert `botu_claude`. **Không có nơi nào gọi.**

## Trạng thái phía client

| State | Nơi |
|---|---|
| `kanjiChar` (chữ đang mở panel) | `page.tsx:331` |
| `data`, `loading` trong `KanjiPanel` | `page.tsx:147-148` |
| `writerRef` (instance HanziWriter) trong `CharStroke` | `page.tsx:79` |
| `_hwPromise` (biến module, tải thư viện 1 lần) | `page.tsx:61` |
| `window.HanziWriter` | toàn cục |

Không có cache phía client cho `/api/kanji`: mỗi lần mở thẻ / mở panel đều gọi lại API (cache HTTP của trình duyệt: chưa xác minh, route không đặt header cache).

## Script liên quan

### `scripts/crawl-hanzii.mjs`
- Chạy: `node scripts/crawl-hanzii.mjs [--limit N] [--concurrency 3]`.
- Lấy danh sách chữ từ `https://hanzii.net/db/hanzi.json` (key của object), bỏ chữ đã có trong `kanji`, crawl theo lô `CONCURRENCY` (mặc định 3), nghỉ 400 ms giữa các lô.
- Giải mã giống API route (code trùng lặp, `:19-43`). Ghi `INSERT OR REPLACE` gồm cả `raw = JSON.stringify(data)` (`:139-142`).
- Không tìm thấy (`found=false`) → không ghi gì, lần sau crawl lại.
- Lỗi HTTP/giải mã → `INSERT OR IGNORE INTO kanji(char, crawled_at='ERROR:<msg>')` (`:160`) → lần sau bị coi là "đã có", không crawl lại. Hiện có 0 dòng như vậy.

## Vấn đề phát hiện

1. **"Phổ biến" luôn hiện "Thấp"**: `kanji.popular` thực tế là text ("rất thấp" 5.714, "rất cao" 1.676, "trung bình" 1.537, "cao" 1.528, "thấp" 1.450 dòng), nhưng `popularLabel` so sánh số (`page.tsx:181-187`); chuỗi khác rỗng so với 80/60/40 đều `false` → mọi chữ có dữ liệu hiện "Thấp". Kiểu TS (`popular: number`) ở `db.ts:85`, `route.ts:54`, `page.tsx:140` đều sai.
2. **Panel không dùng dữ liệu nét trong DB**: `KanjiPanel` gọi `HW.create` không có `charDataLoader` (`page.tsx:167-171`) → luôn tải từ CDN `hanzi-writer-data`, dù API đã trả `strokesSvg`. Chữ có trong DB nhưng CDN không có sẽ không vẽ được ở panel (nhưng vẽ được trên thẻ). Không có `onLoadCharDataError`.
3. **HanziWriter có thể bị nạp 2 lần**: `loadHW` dùng script id `hanzi-writer-js`, panel dùng `hanzi-writer-script` (`page.tsx:66, 161`); mỗi bên không thấy script của bên kia. Ngoài ra panel: nếu script của panel đã chèn nhưng chưa tải xong mà `data` đổi, `initWriter` thoát vì `HanziWriter` chưa có → không vẽ (`page.tsx:173`).
4. **Mỗi chữ trên thẻ gọi 1 request lấy toàn bộ thông tin chữ** chỉ để lấy nét (`page.tsx:87`); từ 4 chữ = 4 request; mở panel gọi lại lần nữa. Cache miss → gọi Hanzii ngay trong lúc học.
5. **Không có cache âm**: chữ Hanzii không tìm thấy → 404, mỗi lần xem lại gọi Hanzii lại (`route.ts:72-94`).
6. **Ghi DB trên đường đọc**: `getKanji` chạy 2 câu `ALTER TABLE` (thất bại) mỗi request (`db.ts:101-104, 144`); lần đầu mỗi tiến trình còn backfill toàn bộ `lessons`. `saveKanji` tạo rồi xoá bảng `kanji_tmp_check` mỗi lần (`db.ts:166-167`), không có tác dụng.
7. `JSON.parse` không bọc try/catch ở `route.ts:96, 111-115`: một dòng JSON hỏng → 500.
8. `botuSource` tính 2 nhánh cùng ra `'claude'` (`route.ts:116`) — thừa.
9. `saveKanji` không cập nhật `botu` khi upsert; `updateKanjiBotu` là code chết (`db.ts:194-202`).
10. Mã giải mã Hanzii và khoá bí mật bị chép ở 2 nơi (`route.ts:7-27`, `crawl-hanzii.mjs:19-43`).
11. Dòng nghĩa từ điển (`meansTdtd[0]`) chứa nhiều dòng `\n` nhưng hiển thị trong `div` không có `white-space: pre-line` (`page.tsx:264`) → dồn thành một đoạn.
12. `params.char` được `decodeURIComponent` thêm lần nữa (`route.ts:66`); Next đã decode params hay chưa: chưa xác minh. Nếu đã decode, chữ `%` sẽ làm route ném lỗi.
13. `ClickableHanzi` / `WordStroke` bỏ qua chữ ngoài `U+4E00–U+9FFF` (CJK Extension A, chữ phồn thể hiếm).

## Ảnh hưởng khi chuyển DB v4

1. `getKanji` → JOIN `characters` + `radicals` (+ LEFT JOIN `character_strokes`, `character_components` ORDER BY `position`). Giữ nguyên shape response để UI không phải sửa (DESIGN §4.1): `radical` = `han_viet + ' ' + form`, `strokesSvg` = `character_strokes.data`, `botu` = components map `role` meaning/sound/self → `t` y/am/solo, `component` → `ph`, `note` → `n`; `botuSource` từ `source` (`'ai'` → hiện nhãn "Claude").
2. `popular` → `frequency` 1–5: sửa luôn `popularLabel` theo thang 1–5 (khắc phục Vấn đề #1). `lucthu` → map `formation`/`formation2` sang tiếng Việt.
3. `saveKanji` (cache miss) → ghi `characters` (`crawl_status`, `crawled_at`), tra/thêm `radicals`, chỉ thêm `character_strokes` khi `strokes` khác rỗng và hợp lệ (CHECK `json_type(data,'$.strokes')='array'`), đặt `has_medians`, `source='hanzii'`. Popular text → số trước khi ghi.
4. Chữ Hanzii không có → có thể ghi `characters(crawl_status='error')` làm cache âm.
5. Bỏ `ensureKanjiClaudeColumn`, `backfillKanjiBotuClaude`, `updateKanjiBotu` (dữ liệu đã migrate vào `character_components`).
6. `scripts/crawl-hanzii.mjs` viết lại sang bảng mới, bỏ `raw`, dùng `crawl_status='error'` thay cho `crawled_at='ERROR:…'`.
7. Đề xuất ở DESIGN §4.1: endpoint `/api/strokes?chars=…` trả nét cho cả từ, cache dài hạn → `CharStroke` không phải gọi `/api/kanji` từng chữ. Khi làm, sửa luôn `KanjiPanel` dùng `charDataLoader`.
