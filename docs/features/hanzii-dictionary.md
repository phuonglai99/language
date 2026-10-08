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
