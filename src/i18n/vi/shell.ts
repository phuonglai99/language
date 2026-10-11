/** UI text: shell. See src/i18n/README.md. */
export const shell = {
  sidebar: {
    sections: {
      listen: 'Luyện nghe',
      game: 'Trò chơi',
    },
    openMenu: 'Mở menu',
    collapse: 'Thu gọn',
    notes: 'Ghi chú của tôi',
    search: {
      placeholder: 'Tìm từ vựng (pinyin, hán tự…)',
      searching: 'Đang tìm…',
      noResults: 'Chưa cập nhật, không tìm thấy',
      error: 'Không thể tìm kiếm lúc này, vui lòng thử lại.',
    },
    reading: {
      all: (n: number) => `Tất cả ${n} bài →`,
      levelCount: (n: number) => `${n} bài →`,
    },
    listen: {
      dictation: 'Chép chính tả Tiếng Trung',
    },
    grammar: {
      pointCount: (n: number) => `${n} điểm →`,
    },
    vocab: {
      wordCount: (n: number) => `${n} từ`,
      allWords: 'Tất cả từ vựng →',
    },
  },
  pagination: {
    prev: '← Trước',
    next: 'Sau →',
    summary: (page: number, totalPages: number, total: number) => `Trang ${page}/${totalPages} · ${total} mục`,
  },
} as const;
