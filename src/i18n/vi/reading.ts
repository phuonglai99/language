/** UI text: reading. See src/i18n/README.md. */
export const reading = {  breadcrumb: {
    ariaLabel: 'Đường dẫn',
  },
  list: {
    titleZh: '读课文',
    vocabCount: (n: number) => `${n} từ`,
  },
  filters: {
    searchPlaceholder: 'Tìm bài đọc…',
  },
  lesson: {
    notFound: 'Không tìm thấy bài đọc',
    metaTitle: (zh: string, en: string, hsk: number) => `${zh} — ${en} | HSK ${hsk}`,
    backToReading: '← Đọc bài khoá',
    prevTitle: (title: string) => `Bài trước: ${title}`,
    nextTitle: (title: string) => `Bài sau: ${title}`,
    prevAria: 'Bài trước',
    nextAria: 'Bài sau',
    traditional: (title: string) => `繁體：${title}`,
    vocabCount: (n: number) => `${n} từ vựng`,
    tapHint: 'Nhấn vào từ để tra nghĩa · click lại để đóng',
    hidePinyin: '拼 Ẩn pinyin',
    showPinyin: '拼 Hiện pinyin',
    navAria: 'Bài cùng level HSK',
    prev: '← Bài trước',
    next: 'Bài sau →',
    firstOfLevel: (hsk: number) => `Đầu HSK ${hsk}`,
    lastOfLevel: (hsk: number) => `Hết HSK ${hsk}`,
  },
  word: {
    translation: (word: string) => `Nghĩa của ${word}`,
    speakAria: (hanzi: string) => `Phát âm ${hanzi}`,
    lookingUp: 'Đang tra…',
  },
} as const;
