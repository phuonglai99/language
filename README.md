# HSK 汉语学习 — Web App

## Chạy local

1. Điền API key vào `.env.local`:
   ANTHROPIC_API_KEY=sk-ant-...

2. Khởi động:
   npm run dev
   → Mở http://localhost:3000

## Deploy Vercel

1. Push lên GitHub
2. Import vào vercel.com
3. Thêm env var ANTHROPIC_API_KEY trong Vercel Settings → Deploy

## Cách dùng

- Import bài học (.docx) → Claude tự phân tích từ vựng + ngữ pháp
- Flashcard: lật thẻ học từ, có phát âm
- Kiểm tra: trắc nghiệm chọn nghĩa từ chữ Hán
- Ngữ pháp: giải thích cấu trúc, so sánh từ dễ nhầm, bài tập điền
