# Third-party service

Các adapter gọi dịch vụ bên ngoài đặt trong package nội bộ `src/server/third-party-service/`:

- `hanzii.ts`: API Hanzii (chữ đơn, từ vựng, ngữ pháp), giải mã và kiểm tra phản hồi.
- `claude.ts`: gọi Anthropic để phân tích tài liệu bài học.

Import trực tiếp adapter cần dùng, ví dụ `@/server/third-party-service/hanzii`. Không dùng barrel nạp đồng thời tất cả provider: tra Hanzii không cần khởi tạo Anthropic hoặc có API key của Anthropic.

Adapter không đọc/ghi DB và không quyết định thứ tự fallback. Điều phối nghiệp vụ nằm trong `server/services/`; lưu dữ liệu nằm trong `server/repos/`.

Tra từ Hanzii trả `[]` khi API báo `found: false`: đây là tra thành công nhưng không có mục từ. Lỗi HTTP, timeout hoặc payload không hợp lệ phát sinh exception để caller retry/log lỗi, thay vì coi đó là một lần tra không tìm thấy.

Chữ toast thuộc cấu hình giao diện `src/i18n/vi/shell.ts`, không đặt trong adapter hoặc hardcode trong component.
