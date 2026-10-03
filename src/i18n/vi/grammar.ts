/** UI text: grammar. See src/i18n/README.md. */
export const grammar = {
  searchPlaceholder: 'Tìm ngữ pháp…',
  pointCount: (n: number) => `${n} điểm ngữ pháp`,
  noMatch: (query: string) => `Không tìm thấy ngữ pháp nào khớp với "${query}"`,
  section: {
    examples: 'Ví dụ',
    comparisons: 'So sánh từ dễ nhầm',
    exercises: 'Bài tập',
  },
  exercise: {
    label: (n: number) => `Bài ${n}`,
    fillPlaceholder: 'Điền câu trả lời...',
    check: 'Kiểm tra',
    answerPrefix: ' — Đáp án: ',
  },
  lesson: {
    empty: 'Không có điểm ngữ pháp nào được trích xuất từ bài này.',
  },
  level: {
    empty: 'Chưa có dữ liệu ngữ pháp. Chạy scripts/crawl-hanzii-grammar.mjs để tải về.',
  },
} as const;
