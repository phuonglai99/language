/** UI text: home. See src/i18n/README.md. */
export const home = {
  header: {
    lessonsUnit: 'bài học',
    vocabUnit: 'từ vựng',
    importButton: '+ Import bài học',
    uploadingButton: (progress: string) => `⏳ ${progress}`,
  },
  upload: {
    readingExcel: 'Đang đọc file Excel...',
    analyzing: 'Claude đang phân tích bài học...',
    failed: 'Upload thất bại',
    durationHint: 'Có thể mất 30–60 giây cho file .docx',
  },
  deleteConfirm: 'Xoá bài học này?',
  empty: {
    title: 'Chưa có bài học nào',
    // Rendered as: before <strong>docx</strong> or <strong>xlsx</strong> after
    description: {
      before: 'Import file ',
      docx: '.docx',
      or: ' hoặc ',
      xlsx: '.xlsx',
      after: ' — Claude tự động trích xuất từ vựng & ngữ pháp cho bạn.',
    },
    uploadFirst: '+ Tải lên bài học đầu tiên',
  },
  card: {
    vocabUnit: 'từ vựng',
    grammarUnit: 'ngữ pháp',
    grammarButtonLevel: (level: string) => `Ngữ pháp ${level}`,
    deleteTitle: 'Xoá bài học',
  },
} as const;
