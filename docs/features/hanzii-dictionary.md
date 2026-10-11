# Tra từ và bổ sung nghĩa Hanzii

Các lời gọi Hanzii nằm trong `src/server/third-party-service/hanzii.ts`; Anthropic nằm cùng package trong `claude.ts`. Chữ toast được cấu hình tại `src/i18n/vi/shell.ts`.

`GET /api/search?q=` dùng `src/server/services/dictionarySearch.ts`:

1. Tra nghĩa Việt trong `characters` (chữ đơn), sau đó `words` / `word_senses`.
2. Nếu chưa có kết quả Việt phù hợp, gọi API Hanzii `/api/search/all/vi/word/` (timeout 10 giây). Với truy vấn chữ Hán, kết quả chứa từ dài hơn không ngăn tra chính xác từ đang hỏi.
3. Lưu các mục Hanzii trả về vào DB, cập nhật `words_fts` rồi trả nghĩa Việt.
4. Nếu không có nghĩa Việt phù hợp, dùng nghĩa Anh trong DB (nguồn Mandarin Bean). Không gọi crawl bài Mandarin Bean trong request tìm kiếm.
5. Không có kết quả: trả `results: []`; sidebar hiện toast “Chưa cập nhật, không tìm thấy”. Lỗi HTTP của ứng dụng hiện thông báo thử lại riêng.

Chữ đơn lấy `hv_meanings`, thiếu thì dùng `hv_dictionary`. Tìm chữ đơn hỗ trợ chữ Hán, pinyin và nghĩa Việt không dấu. Kết quả chữ đơn đứng trước từ vựng, giữ link bài học nếu có. Cùng truy vấn đang chạy dùng chung request Hanzii. Cache kết quả tra bên ngoài trong tiến trình 5 phút; lỗi mạng thử lại sau 15 giây. Dữ liệu nghĩa đã nhập lưu bền trong SQLite.

## Lưu dữ liệu

- `words`: ghép theo chữ Hán và cách đọc; tự tạo stub `characters` cho chữ chưa có để giữ khóa ngoại.
- `word_senses`: thêm nghĩa Việt; `source = 'import'` theo schema hiện tại, `note` chứa ID và URL Hanzii. Không ghi đè nghĩa Việt/Anh có sẵn, không thay `sense_id` của bài học hoặc bài đọc.
- `sense_examples`: lưu ví dụ Trung–Việt và pinyin, chống trùng.
- Không đưa cấp HSK của Hanzii vào `words.hsk_level` vì không mặc định cùng thang HSK với danh sách đang dùng.

## Vá từ ghép còn thiếu nghĩa Việt

```bash
npm run crawl:words
npm run crawl:words -- --limit 20 --concurrency 3
DB_PATH=data/other.db npm run crawl:words -- --report data/other-report.json
```

Script `scripts/crawl-hanzii-words.ts` mặc định xử lý toàn bộ mục có từ hai chữ Hán và chưa có `meaning_vi` khác rỗng. Mỗi lần chạy backup DB trước khi ghi. Mặc định 3 request song song, nghỉ 400 ms giữa các batch; retry lỗi tối đa 2 lần. Có thể chạy lại, các từ đã có nghĩa Việt được bỏ qua.

Chỉ nhập kết quả trùng chữ Hán và pinyin (chuẩn hóa dấu cách, thanh nhẹ và biến điệu 一/不). Không tự gán nghĩa cho cách đọc khác. Tên người, cụm từ không có trong từ điển hoặc pinyin không khớp được ghi vào `missing` của `data/hanzii-words-report.json`; lỗi API/ghi DB nằm trong `errors`. Có lỗi thì script kết thúc với exit code 1. Báo cáo cập nhật sau mỗi batch, `completedAt` chỉ có khi hoàn tất.

Kiểm thử: `tests/integration/dictionary.test.ts` dùng DB bộ nhớ và mock Hanzii, kiểm tra thứ tự nguồn, fallback, cache, bảo toàn nghĩa cũ, khóa ngoại, FTS và chống trùng.

## Đối chiếu từ loại và tái sử dụng dữ liệu crawl

Dữ liệu cũ vẫn dùng được:
- `data/lessons.db.kanji.raw` giữ phản hồi gốc; các trường nghĩa đã chuyển sang `characters.hv_meanings`, `hv_dictionary` trong DB hiện tại.
- `word_senses` có các nghĩa từ API word Hanzii, nhận diện qua `note` chứa nguồn `Hanzii word`.
- Không lấy nhãn đầu tiên của chữ để gán cho mọi nghĩa. Chữ nhiều cách đọc và dẫn chiếu giản/phồn thể cần đối chiếu thêm; từ điển chữ cổ không đồng nhất với nghĩa từ hiện đại.

`npm run repair:pos` mặc định **offline**: dùng nghĩa Hanzii đã có trong DB, nhãn `(Động)/(Danh)/…` của từ điển chữ có cách đọc đơn nhất, rồi các phản hồi từ đã lưu tại `data/hanzii-word-cache/`. Chỉ cập nhật nghĩa import chưa duyệt khi các thành phần nghĩa Việt khớp chính xác và cho một từ loại duy nhất. Không sửa mục đã duyệt, không đổi ID nghĩa hay liên kết bài học. Mỗi lần chạy tạo backup và báo cáo riêng `data/hanzii-pos-report-<timestamp>.json`, gồm thay đổi, nguồn chứng minh và mục chưa đối chiếu được.

- `npm run repair:pos -- --replay-cache`: nhập lại phản hồi đã lưu, hữu ích khi bổ sung ánh xạ mã từ loại.
- `npm run repair:pos -- --fetch-missing`: cho phép truy vấn Hanzii khi thiếu cache. Không cần tùy chọn này để dùng dữ liệu có sẵn.
- Nhãn ghép như `v, n` tạo hai nghĩa/từ loại riêng; nhãn không nhận diện giữ `NULL`, không mặc định thành danh từ.
- Import bài học đối chiếu với nghĩa Hanzii đã lưu và từ điển chữ ngay trong transaction, tránh đưa lại nhãn cũ đã được sửa.
- `verified` vẫn là 0 cho kết quả đối chiếu tự động; `note` giữ nguồn và nhãn trước đó. Không đánh dấu như đã được người duyệt.

Danh sách HSK và luyện nhập ưu tiên nghĩa Việt đã duyệt hoặc có nguồn Hanzii khi chọn nghĩa chính. Giao diện trả tất cả nghĩa, mặc định hiện hai nghĩa và có “Xem thêm”. Nghĩa chưa có tiếng Việt dùng nghĩa tiếng Anh; nhãn sai chưa có đủ bằng chứng vẫn được giữ và ghi trong báo cáo để duyệt.
