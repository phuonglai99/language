# Kế hoạch cải thiện kiến trúc và kiểm thử

Ngày lập: 2026-10-03. Trạng thái: đang thực hiện đợt khởi đầu.

Giữ Next.js + SQLite trên VPS. Mỗi đợt là một thay đổi có thể review và rollback riêng; cập nhật tài liệu cùng code. Checklist chỉ đánh dấu khi đã hoàn thành và kiểm chứng.

## 1. Tài liệu

- [x] Lưu kế hoạch và tạo mục lục tài liệu.
- [x] Sửa README về DB v4, lệnh pipeline và yêu cầu DB có sẵn.
- [ ] Phân nhóm architecture, guides, operations, development, decisions, archive; sửa liên kết khi di chuyển.
- [ ] Tách lịch sử trong data-layer.md khỏi mô tả hiện tại; archive kế hoạch và báo cáo migration đã hoàn tất.
- [ ] Viết hướng dẫn người học, quản lý nội dung, setup và vận hành.
- [x] Tạo CHANGELOG với Unreleased, không suy đoán lịch sử phát hành.

Giữ src/i18n/README.md cạnh code. Git/tag quản lý version tài liệu; chỉ tách docs theo version khi hỗ trợ nhiều phiên bản đồng thời.

## 2. Baseline và auto test

- [x] Bỏ qua worktree, build và môi trường Python trong ESLint.
- [x] Thêm typecheck, test, test:watch và check.
- [x] Khởi tạo unit/integration bằng Node test runner + tsx hiện có.
- [x] Dùng SQLite in-memory cho test migration/repository, không mở DB ứng dụng.
- [x] Thêm workflow GitHub Actions chạy trên push/PR.
- [ ] Sửa các lỗi lint hiện hữu, không tắt rule để vượt kiểm tra.
- [ ] Production build đạt với DB fixture riêng.
- [ ] Thêm E2E trình duyệt, seed DB tạm, mock Claude/Hanzii và audio cục bộ; lưu trace khi lỗi.

Hoàn thành đợt khi lint, typecheck, test và build đạt. CI ban đầu phản ánh lỗi còn tồn tại, không coi việc tạo workflow là đã có baseline xanh.

## 3. Quyền truy cập và dữ liệu

- [ ] Chốt mô hình người dùng và ghi chú riêng/chung trước khi thiết kế ownership.
- [ ] Bảo vệ API ghi, upload và alignment phía server; giới hạn upload/lượt gọi AI.
- [ ] Production giữ dữ liệu phát sinh; local cung cấp nội dung để import có chọn lọc.
- [ ] Backup nhất quán, thử restore trên DB tạm; migration là bước deploy rõ ràng.
- [ ] Bỏ quy trình chép đè DB production khỏi hướng dẫn hiện hành.

Tiêu chí: không có quyền thì không ghi được; khôi phục được bản backup. Tách PR auth và PR vận hành DB.

## 4. Validation và API

- [ ] Schema runtime cho notes, upload, alignment và đầu ra Claude.
- [ ] Giới hạn kích thước, số phần tử, độ dài chuỗi; chuẩn hoá mã lỗi/HTTP status/i18n.
- [ ] Test dữ liệu sai bị từ chối trước khi ghi DB.

## 5. Backend

- [ ] Chuyển SQL của lessonImport vào repository; service điều phối transaction.
- [ ] Chuyển cache-aside Hanzii từ repository sang service; gộp request cùng chữ đang chạy.
- [ ] Kiểm soát import vượt ranh giới bằng lint; giữ contract API hiện có.
- [ ] Test import lỗi rollback toàn bộ và import lại bảo toàn alignment.

Không đặt await trong callback transaction better-sqlite3. Hàm async bao ngoài không làm SQL chạy bất đồng bộ.

## 6. Hiệu năng và frontend

- [ ] Đo baseline truy vấn/payload trên fixture lớn, batch thành phần chữ trong getLesson.
- [ ] Phân trang bài đọc ở DB/API/UI; test dữ liệu tương đương và biên trang.
- [ ] Huỷ hoặc bỏ qua response search cũ; test phản hồi đảo thứ tự.
- [ ] Tách dictation (audio/session/result), lesson (chế độ học), shell (navigation/search/layout).
- [ ] Server Component tải dữ liệu ban đầu ở trang phù hợp.

Tách PR tối ưu dữ liệu khỏi refactor UI. Không đặt chỉ tiêu hiệu năng số học trước khi đo.

## 7. Hoàn thiện và phát hành

- [ ] Smoke test upload → học/quiz → ghi chú; reading → dictation → alignment.
- [ ] Hoàn thiện hướng dẫn sử dụng, deploy, restore và quyết định kiến trúc.
- [ ] Chạy lint, typecheck, unit/integration, build, E2E; cập nhật changelog/version khi phát hành.

## Thứ tự và phạm vi hiện tại

Khởi đầu: kế hoạch, mục lục/README, phạm vi lint, test và CI tối thiểu. Tiếp theo: sửa baseline lint/build, mở rộng test và tổ chức lại tài liệu; sau đó các đợt 3–7. Chưa triển khai auth hoặc thay đổi DB production trong đợt khởi đầu.

## Kết quả đợt khởi đầu — 2026-10-03

- `npm test`: 5/5 đạt (chuẩn hoá pinyin/search, migration lặp lại, dedup từ và rollback dữ liệu/search trong transaction).
- `npm run typecheck`: đạt.
- `npm run lint`: còn 15 lỗi và 8 cảnh báo hiện hữu; đã loại nhiễu từ worktree.
- `git diff --check`: đạt.
- Chưa chạy production build/E2E; workflow CI đã tạo nhưng chưa chạy trên GitHub.
- Bước tiếp theo: sửa 15 lỗi lint, chuẩn bị DB fixture riêng cho build/E2E, tiếp tục phân loại tài liệu. Không coi 5 test khởi đầu là đã bao phủ toàn bộ luồng import và alignment.
