# Lịch sử tính năng luyện từ vựng

## v1 — 2026-10-08 — Chuyển toàn bộ Notes anonymous sang localStorage

- `NoteModal`, trang `/notes`, `/notes/[id]` và thư mục từ sai của Quiz đều dùng chung `hsk:notes:local:v1`; client không còn gọi Notes API.
- Vô hiệu hóa các route `/api/notes/**` cũ bằng `410 Gone`. Dữ liệu SQLite legacy được giữ nguyên, không tự nhập sang browser khi chưa có định danh người dùng.
- Thêm thư mục hệ thống **Từ chưa vững**, kiểm tra schema, chống trùng, xử lý quota và giới hạn tối đa 500 từ.
- Hiển thị số từ/500 và dung lượng trên `/notes`; 500 từ HSK ước tính chiếm khoảng 0,22 MiB.

## v1 — 2026-10-08 — Tự lưu từ chưa vững vào Notes cục bộ

- Thêm tùy chọn tự lưu trong cấu hình phiên. Khi bật, popup cho chọn thư mục local hiện có hoặc tạo thư mục mới.
- Tự lưu từ khi trả lời sai, bỏ qua hoặc xem đáp án; chống trùng theo nguồn từ và chữ/cách đọc.
- Dữ liệu dùng `localStorage`, không gọi API ghi Notes và không lưu xuống DB. Thư mục local xuất hiện ở `/notes` với nhãn **Trên thiết bị** và vẫn hỗ trợ xem, ôn, đổi tên, xóa.
- Tiến trình cũ được tương thích với mặc định tắt tự lưu; lỗi localStorage không chặn phiên luyện.

## v1 — 2026-10-08 — Phím Enter và luồng sửa đáp án

- Đổi nút chữ “Nghe phát âm” trên thẻ đáp án thành icon loa, giữ nhãn trợ năng và tooltip.
- Enter kiểm tra đáp án sau khi đã qua guard IME; đúng tự chuyển câu, sai giữ nguyên câu và focus/chọn lại nội dung ô nhập để sửa.
- Không hiện đáp án hoặc chi tiết kỳ vọng ngay khi trả lời sai. Người học vẫn có thể chọn **Xem đáp án**; lượt sai tiếp tục được ghi nhận và đưa vào hàng ôn.

## v1 — 2026-10-08 — Chọn nguồn từ theo HSK

- Thêm lựa chọn HSK 1–6 ngay trên màn cấu hình luyện nhập.
- Thêm lựa chọn **Ngẫu nhiên**: lấy pool từ toàn bộ kho HSK 1–6 trong DB; mỗi phiên tiếp tục xáo và chọn số từ theo cấu hình 10/20/30/tất cả.
- Tiến trình được lưu riêng theo từng cấp HSK và nguồn ngẫu nhiên; API kiểm tra/xem đáp án dùng đúng nguồn đã chọn.
- Kiểm tra sau thay đổi: `npm run check` đạt 26/26 test (còn 4 warning nền); production build bằng webpack đạt. Turbopack vẫn bị sandbox chặn bind cổng nội bộ.

## v1 — 2026-10-08 — Triển khai code

- Thêm tab **Luyện nhập** vào màn bài học cho ba dạng `hanzi-to-pinyin`, `hanzi-to-hanzi` và `vi-to-hanzi`.
- Thêm parser pinyin nguồn lưu liền, parser input số thanh nghiêm ngặt, căn chỉnh lỗi âm tiết và chấm Hán tự bỏ qua khoảng trắng Unicode.
- Thêm repo chọn đúng sense có nghĩa Việt, metadata override có version, chữ ký nội dung và API GET/check/reveal. Đáp án không nằm trong DTO đề và server không tin dữ liệu đáp án từ client.
- Thêm cấu hình 10/20/30/tất cả, luyện kết hợp, lượt riêng cho pool nhỏ, ôn lại tối đa một lần, tổng kết riêng theo dạng và local progress v1 có xử lý nội dung đổi/storage lỗi/xung đột tab.
- Thêm hướng dẫn thanh nhẹ 5, `ü`/`v`, label/`aria-describedby`/`aria-live`, guard IME (`isComposing`, `keyCode 229`) và giữ draft khi lỗi request.
- Kiểm kê snapshot DB: HSK1–6 có 145/148/290/578/1295/2420 mục đủ pinyin; sáu bài upload có 63 câu pinyin và 65 câu cho mỗi dạng Hán tự.
- Kiểm tra ngày 2026-10-08: `npm run check` đạt (lint còn 4 warning nền về ảnh/font), sau khi bổ sung ca nghĩa mơ hồ có 25/25 test đạt; production build bằng webpack đạt. Turbopack build bị môi trường sandbox chặn thao tác bind cổng nội bộ. Kiểm thử IME thực tế trên desktop/mobile vẫn là việc trước phát hành.

## Điều chỉnh kế hoạch v1 — 2026-10-07 — Khoảng trắng tùy chọn

- Theo yêu cầu người dùng, bỏ quy định bắt buộc cách âm tiết pinyin và quy định từ chối khoảng trắng bên trong bài nhập Hán tự.
- Chọn cách xử lý: loại khoảng trắng trong bản dùng để chấm; pinyin tách theo số thanh 1–5 kết thúc âm tiết. `xue2xiao4` = `xue2 xiao4`; `学校` = `学 校`.
- Giữ yêu cầu đầy đủ số thanh, kể cả thanh nhẹ 5; parser phải kiểm tra toàn bộ chuỗi, không bỏ ký tự sai hoặc tự bổ sung thanh thiếu.
- Cập nhật hướng dẫn UI và ma trận nghiệm thu trong [kế hoạch v1](v1-plan.md). Giữ nguyên input hiển thị và không can thiệp IME.
- Chỉ đổi kế hoạch, chưa có code chấm đang phát hành nên chưa tăng `scoringVersion` thực thi.

## v1 — 2026-10-07 — Kế hoạch, chưa triển khai

- Thống nhất hai hướng luyện: nhìn chữ Hán và nhìn nghĩa tiếng Việt.
- Nhìn chữ Hán có hai cách nhập: pinyin đầy đủ có số thanh; hoặc nhập chữ Hán bằng bộ gõ của thiết bị.
- Chốt mỗi âm tiết pinyin phải có số thanh 1–5; **5 là thanh nhẹ**. Thay thế đề xuất trước đó cho phép bỏ số ở thanh nhẹ.
- Bắt buộc có hướng dẫn UI và ví dụ `xue2 xiao4`, `ma1 ma5`, `lv4`.
- Đề xuất tích hợp ở màn học từ vựng theo bài, chấm riêng từng dạng, hỗ trợ luyện kết hợp và ôn lỗi.
- Ghi nhận rủi ro nguồn dữ liệu: nghĩa fallback tiếng Anh, pinyin lưu liền, chữ đa âm và từ đồng nghĩa.
- Tạo [kế hoạch v1](v1-plan.md). Chưa thay đổi code ứng dụng, schema DB hoặc chạy kiểm thử tính năng.

Các mục triển khai sau này cần ghi PR/commit, kết quả kiểm thử và khác biệt so với kế hoạch.
