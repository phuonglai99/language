# Duyệt kết quả P3 — Bài khóa

Sinh từ lần chạy `npm run migrate:v4` ngày 2026-10-02.

## 1. Trạng thái review lệch với mốc audio (4 bài)

`review_status` lấy từ `categories` ("Checked" / "Uncheck"). Trang căn audio lại tự tính trạng thái từ số câu thiếu mốc. Hai cách đang cho kết quả khác nhau ở:

| Bài | `review_status` | Câu chưa có mốc | Đề xuất |
|---|---|---|---|
| `climb-mountain` | unchecked | 0 | Nghe lại; đúng thì chuyển `checked` |
| `distribute-watermelon` | unchecked | 0 | Nghe lại; đúng thì chuyển `checked` |
| `shopping-story` | unchecked | 0 | Nghe lại; đúng thì chuyển `checked` |
| `wechat-social-etiquette` | checked | 1 (câu 17) | Căn lại câu 17 (xem mục 2) |

## 2. Mốc audio dài 0 giây (1 câu)

- [ ] `wechat-social-etiquette` câu 17: `start = end = 151.28`. Đã chuyển thành chưa có mốc (NULL); cần căn lại.

## 3. Bài có nhiều danh mục (1 bài)

- [ ] `the-global-ranking-of-the-smart-city`: Lifestyle, News → giữ **Lifestyle**.

## 4. Thay đổi số từ của bài (`vocab_count`) — không cần duyệt

117 bài có số từ giảm vì ngoặc kép cong (`“ ” ‘ ’`), `《》`, `……`, dấu ASCII không còn bị đếm là từ. Văn bản ghép từ các câu khớp `content_text` cũ ở 729/729 bài.
