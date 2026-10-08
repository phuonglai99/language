# Kiểm thử tự động

Yêu cầu Node 22+ và dependency cài bằng `npm ci`.

```bash
npm test                  # unit + integration
npm run test:watch        # chạy lại khi sửa test/dependency được theo dõi
npm run typecheck
npm run lint
npm run check             # lint → typecheck → test; dừng khi có lỗi
```

Test dùng Node test runner và tsx có sẵn. Test DB mở `:memory:`, chạy migration thực và đóng kết nối sau mỗi test; không import getDb(), không cần DB_PATH, API key, mạng hoặc DB thật. Chưa kiểm tra toàn bộ service import, UI hoặc trình duyệt.

GitHub Actions chạy lint/typecheck/test thành các job độc lập trên push/PR, nên lint lỗi không che kết quả test. Workflow hoạt động khi code được push lên GitHub có Actions bật; chưa cấu hình branch protection.

Kiểm tra local ngày 2026-10-04: lint không còn error; còn 4 cảnh báo ảnh/font. `npm run check` đạt với 17 tests. Xem [chuẩn bị deploy](../deployment/vps.md) để biết phạm vi kiểm tra và các bước production còn lại.

## Bổ sung tiếp theo

- Fixture DB riêng để production build và E2E không truy cập dữ liệu thật.
- Test transaction của service import, bảo toàn alignment và validation API.
- E2E trình duyệt cho học/quiz/notes/reading/dictation, mock Claude/Hanzii, audio mẫu cục bộ.
- Lưu trace/screenshot khi E2E thất bại; kiểm tra thủ công chất lượng phát âm.
