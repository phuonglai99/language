/** UI text shared by several screens. See src/i18n/README.md. */
export const common = {
  loading: 'Đang tải…',
  saving: 'Đang lưu…',
  all: 'Tất cả',
  start: 'Bắt đầu →',
  back: '← Về',
  backHome: '← Về trang chủ',
  backToList: '← Quay lại danh sách',
  speak: 'Phát âm',
  notes: '📝 Ghi chú',
  saveToNotes: 'Lưu vào ghi chú',
  emptyLessons: 'Không tìm thấy bài nào.',
  lessonCountSuffix: ' bài',
  /** Display labels for the alignment status values the code filters on. */
  alignmentStatus: { Checked: 'Checked', Uncheck: 'Uncheck' },
  /** Feature names used in menus, cards and page titles. */
  features: {
    home: 'Trang chủ',
    flashcard: 'Flashcard',
    quiz: 'Kiểm tra',
    match: 'Ghép thẻ',
    grammar: 'Ngữ pháp',
    vocab: 'Từ vựng',
    reading: 'Đọc bài khoá',
    align: 'Cắt audio thủ công',
  },
} as const;
