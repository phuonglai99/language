# Chép chính tả (Dictation / 听写)

Người học nghe từng câu của bài Mandarin Bean tại `/dictation/[slug]`, nhập lại nội dung và nhận kết quả chấm từ server. Màn hình là Client Component; API và client dùng chung quy tắc tách token/chấm trong `src/lib/dictation.ts`.

## API và dữ liệu

`GET /api/dictation/lessons/[slug]` trả metadata bài cùng các câu:

- `index`: chỉ số câu bền vững từ API/DB;
- `hanzi`, `pinyin`, `wordCount`, `words`;
- `tokens`: `{ id, text, kind, pinyin, scorable }[]` để render và gợi ý theo từ;
- `start`, `end`: mốc audio, có thể là `null`.

`POST /api/dictation/check` nhận `{ slug, sentence_index, user_input }`. Route giới hạn độ dài input, kiểm tra kiểu dữ liệu runtime, tự tải đáp án từ DB và không tin token/đáp án do client gửi.

`src/lib/dictation.ts` chuẩn hoá full-width digits/Latin về ASCII và loại toàn bộ Unicode punctuation, symbol và whitespace khi chấm. Vì vậy dấu câu/ký hiệu được hiện đúng chỗ nhưng có hoặc không gõ đều không thay đổi điểm; chữ số, Latin và Hán tự vẫn được chấm.

## Tiến trình trên trình duyệt

Mỗi bài lưu một lượt học ở localStorage với key:

```
hsk:dictation:progress:v1:<encodeURIComponent(slug)>
```

`src/lib/dictationProgress.ts` kiểm tra JSON không tin cậy trước khi khôi phục: version, slug, enum, giới hạn độ dài/số phần tử, chỉ số câu, gợi ý và kết quả chấm. JSON lỗi chỉ bị bỏ qua cho bài đó; không dùng `localStorage.clear()`.

Tiến trình gồm bản nháp, bài đã nộp/kết quả, vị trí câu theo `sentence.index`, gợi ý, tốc độ, độ khó và lựa chọn gợi ý từ. Không lưu audio đang phát, IME, refs hay trạng thái mở gợi ý. Bản nháp được debounce 500 ms; đổi câu, chấm xong, đổi thiết lập, dùng gợi ý và làm lại sẽ flush ngay. `visibilitychange`, `pagehide` và cleanup cũng cố flush dữ liệu còn chờ.

Nội dung bài có chữ ký ổn định không gồm timestamp audio. Nếu nội dung/tách câu/token đổi, tiến trình bài bị reset nhưng giữ tốc độ, độ khó và kiểu gợi ý. Nếu chỉ đổi phiên bản chấm, bản nháp/cài đặt được giữ còn kết quả cũ bị bỏ.

Hai tab cùng bài không được hợp nhất: khi nhận sự kiện `storage` từ tab khác, tab hiện tại ngừng ghi, hủy request/timer và yêu cầu tải lại để tránh ghi đè. Nếu storage bị chặn hoặc đầy, màn học vẫn hoạt động trong React state và hiện cảnh báo.

## Trải nghiệm nhập và gợi ý

- Vùng đối chiếu có hai hàng Pinyin/Hán tự theo cùng token. Từ nhập đúng mở ngay cả pinyin và Hán tự; từ chưa hoàn thành vẫn bị che bằng `*`.
- Các cụm `*` là nút gợi ý tại chỗ. Bấm vào mở popup nhỏ để chọn **Pinyin** hoặc **Hán tự** riêng cho token đó; không còn dãy nút “Gợi ý từ” tách rời. Thiếu pinyin sẽ báo rõ và không tự lộ Hán tự.
- Mỗi chữ số chưa nhập hiện `*` màu đỏ; ký hiệu như `.`, `/`, `%`, `。` hiện sẵn. Hướng dẫn bằng chữ và nhãn truy cập không chỉ dựa vào màu.
- Gợi ý toàn câu vẫn là pinyin và được mở ngay trên hàng Pinyin. Pinyin từng từ lấy từ token nguồn thay vì tách/ghép pinyin cả câu.
- Xem gợi ý không đổi điểm nhưng lưu cờ đã dùng. Làm lại câu chỉ xóa draft/kết quả câu đó và giữ lịch sử gợi ý; **Làm lại bài** xóa toàn bộ bài làm/kết quả/gợi ý của bài hiện tại, giữ các lựa chọn tốc độ/độ khó/chế độ gợi ý.
- Response chấm được gắn với slug, `sentence.index`, nội dung đã gửi và mã phiên. Response đến muộn sau reset, đổi bài hoặc hủy request không thể ghi lại dữ liệu cũ.

## Audio và phím tắt

Nếu có `start/end` thì dùng clip audio gốc; nếu không có thì dùng TTS Trung Quốc. Tốc độ 0.75x/1x được lưu theo từng bài. Thẻ hướng dẫn phím tắt luôn hiện ở cột trái: Space phát câu, Tab phát lại, Enter chấm, Ctrl/Cmd+H bật pinyin toàn câu và phím mũi tên chuyển câu. Tab/Enter/Ctrl/Cmd+H có handler riêng trong ô nhập; phím tắt không can thiệp khi đang composition IME.

## Kiểm thử cần có trước deploy

Kiểm thử hồi quy nên bao phủ restore/reset, JSON hỏng/storage bị chặn, event nhiều tab, response HTTP lỗi/đến muộn, IME, content signature, số full-width, token hỗn hợp và punctuation. `npm run check` đạt ngày 2026-10-08; kiểm tra popup/vị trí wrap và IME trên trình duyệt thật vẫn cần thực hiện trước deploy.
