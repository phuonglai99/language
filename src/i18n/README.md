# Chữ giao diện (i18n)

Mọi chữ người dùng nhìn thấy nằm trong `src/i18n/vi/<nhóm>.ts`, **không viết thẳng trong component**.

```ts
import { t } from '@/i18n';

<button>{t.lesson.flashcard.next}</button>
<span>{t.home.card.vocabCount(lesson.vocabCount)}</span>
```

## Quy ước

- `common`: chữ dùng ở nhiều màn hình ("Đang tải…", "← Về trang chủ", "📝 Ghi chú"…) và tên tính năng (`common.features.*`: Flashcard, Kiểm tra, Ngữ pháp…). Chữ nào đã có ở đây thì dùng lại, không tạo key mới trùng nội dung.
- Một file cho mỗi nhóm trang: `home`, `shell` (sidebar, phân trang), `lesson` (học từ, quiz, ghép thẻ), `notes`, `reading`, `dictation` (chép chính tả, căn audio), `grammar`, `vocab`, `api` (thông báo lỗi API trả về cho giao diện).
- Chữ trùng mặt chữ nhưng khác nghĩa thì để riêng (ví dụ "Kiểm tra" là tên tính năng ở `common.features.quiz`, nhưng là nút chấm bài ở `grammar.exercise.check`).
- Bên trong mỗi file, nhóm tiếp theo màn hình/component; tên key là tiếng Anh mô tả ý nghĩa (`deleteConfirm`, `emptyState`).
- Chữ có tham số dùng hàm: `vocabCount: (n: number) => \`${n} từ vựng\``.
- Giữ nguyên chữ, dấu câu và emoji như bản gốc.

## Không đặt ở đây

- Tên web, mô tả, logo → `src/config/site.ts`.
- Prompt gửi cho AI → `src/lib/claude.ts`.
- Nhãn dữ liệu mà code so khớp (từ loại "Danh từ", lục thư "hình thanh", nhãn cấp "Chưa xếp cấp" trong URL…) → `src/shared/*`.
- Nội dung học (nghĩa, ví dụ, ngữ pháp, bài khóa) → DB.

## Thêm ngôn ngữ

Tạo `src/i18n/<mã ngôn ngữ>/` với cùng cấu trúc và kiểu `Messages`, rồi chọn bộ chữ theo ngôn ngữ (xem hướng dẫn i18n của Next: `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`).
