/** UI text: api. See src/i18n/README.md. */
export const api = {
  common: {
    notFound: 'Not found',
  },
  upload: {
    noFile: 'No file provided',
    unsupportedType: 'Chỉ hỗ trợ file .docx và .xlsx',
    excelUnreadable: 'Không đọc được dữ liệu từ file Excel',
    emptyFile: 'File rỗng hoặc không đọc được nội dung',
    analyzeFailed: 'Phân tích thất bại. Kiểm tra ANTHROPIC_API_KEY.',
  },
  lessons: {
    deleteFailed: 'Không xoá được bài này',
  },
  dictationAlign: {
    sentencesRequired: 'sentences required',
    endBeforeStart: (n: number) => `Câu ${n}: end phải lớn hơn start`,
    sentenceMissingText: (n: number) => `Câu ${n} chưa gắn text`,
    saveFailed: 'Save failed',
  },
} as const;
