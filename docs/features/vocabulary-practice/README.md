# Luyện từ vựng theo hai hướng

Trạng thái: **đã triển khai code v1, đang chờ kiểm thử IME thủ công trước phát hành**. Ngày lập: 2026-10-07; cập nhật: 2026-10-08.

## Phạm vi

| Tính năng | Cách nhập | Ví dụ | Mục tiêu |
|---|---|---|---|
| Nhìn chữ Hán → trả lời | Pinyin đầy đủ, có số thanh | 学校 → `xue2 xiao4` | Nhớ cách đọc và thanh điệu |
| Nhìn chữ Hán → trả lời | Dùng bộ gõ tiếng Trung chọn chữ Hán | 学校 → `学校` | Làm quen bộ gõ, đối chiếu và chọn chữ |
| Nhìn nghĩa tiếng Việt → trả lời | Dùng bộ gõ tiếng Trung chọn chữ Hán | trường học → `学校` | Chủ động nhớ từ theo nghĩa |

Đây là **hai tính năng**, trong đó tính năng nhìn chữ Hán có **hai chế độ nhập**. Điểm của ba dạng bài được theo dõi riêng trong tab **Luyện nhập** tại `/lesson/[id]`. Chép chính tả nghe → chữ Hán vẫn thuộc [dictation](../dictation.md).

Ở màn cấu hình, người học chọn HSK 1–6 hoặc **Ngẫu nhiên**. Một cấp HSK chỉ lấy từ đúng cấp đó; Ngẫu nhiên dùng toàn bộ kho từ HSK 1–6 trong DB. Khi bắt đầu phiên, danh sách được xáo và lấy theo số lượng 10/20/30/tất cả đã chọn.

Quy tắc đang chạy: nhập đầy đủ pinyin bằng số, thanh nhẹ dùng **5**; bỏ qua khoảng trắng khi chấm cả pinyin và Hán tự. `xue2xiao4` và `xue2 xiao4` đều được chấp nhận; số thanh kết thúc mỗi âm tiết. Đáp án được chấm phía server theo đúng word/sense của bài; tiến trình phiên lưu trên thiết bị.

Trong lúc làm bài, Enter dùng để kiểm tra sau khi bộ gõ đã xác nhận ứng viên. Đúng thì tự chuyển câu; sai thì giữ câu, chọn lại nội dung và focus ô nhập để sửa. Đáp án chỉ mở khi người học chọn **Xem đáp án**; nút phát âm trên thẻ đáp án hiển thị bằng icon loa.

Người học có thể bật **Tự lưu từ chưa vững vào Notes**, rồi chọn hoặc tạo một thư mục trong popup. Từ trả lời sai, bỏ qua hoặc xem đáp án được lưu vào `localStorage` của trình duyệt và xuất hiện trong trang Notes với nhãn **Trên thiết bị**; luồng này không ghi dữ liệu vào DB của server.

## Tài liệu và phiên bản

- [Kế hoạch v1](v1-plan.md): UX, dữ liệu, chấm đáp án, API, tiến trình, các bước triển khai và nghiệm thu.
- [Lịch sử thay đổi](CHANGELOG.md): thay đổi yêu cầu và trạng thái thực hiện.

Quy ước theo dõi:

1. `v1-plan.md` là kế hoạch cho phiên bản tính năng v1; mục trạng thái/checklist được cập nhật theo bằng chứng thực hiện.
2. Thay đổi yêu cầu hoặc quy tắc chấm phải ghi vào changelog, kèm lý do và liên kết PR/commit nếu có. Khi thay đổi phạm vi lớn, thêm `v2-plan.md`, giữ v1 để tra cứu.
3. Mỗi lần triển khai ghi ngày, phạm vi thực tế, kiểm thử đã chạy và việc còn lại. Không đánh dấu hoàn tất chỉ vì đã viết kế hoạch.
4. Phiên bản tài liệu, `scoringVersion` và `progressVersion` là ba khái niệm riêng. Thay nội dung hướng dẫn không tự động đổi định dạng lưu tiến trình; thay quy tắc đúng/sai phải xem xét tăng `scoringVersion`.
5. Sau khi phát hành, bổ sung tài liệu hành vi thực tế và liên kết tại đây. Không mô tả đề xuất chưa triển khai như tính năng đang hoạt động.
