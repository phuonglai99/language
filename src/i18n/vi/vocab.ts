/** UI text: vocab. See src/i18n/README.md. */
export const vocab = {
  speech: {
    title: 'Giọng phát âm',
    automatic: 'Tự động (ưu tiên Quan thoại)',
    speed: 'Tốc độ đọc',
    preview: 'Nghe thử',
    sample: '你好，欢迎学习中文。',
    unavailable: 'Trình duyệt này không hỗ trợ đọc từ.',
    noVoices: 'Chưa tìm thấy giọng Quan thoại. Bạn có thể cài thêm giọng tiếng Trung trong cài đặt giọng nói của thiết bị.',
    deviceHint: 'Chất lượng giọng phụ thuộc vào trình duyệt và các giọng đã cài trên thiết bị.',
  },
  level: {
    loadError: 'Không tải được từ vựng. Vui lòng tải lại trang.',
    wordCount: (n: number) => `${n} từ`,
    filterPlaceholder: 'Lọc từ…',
    empty: 'Không có từ vựng nào',
  },
} as const;
