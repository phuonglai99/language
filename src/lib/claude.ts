import Anthropic from '@anthropic-ai/sdk';
import type { Lesson, VocabCard, GrammarPoint } from '@/types';
import { nanoid } from './nanoid';
import type { DocxSegments } from './parse-docx';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích tài liệu học tiếng Trung (HSK).
Nhận văn bản đã được tách sẵn thành hai phần TỪ VỰNG và NGỮ PHÁP, hãy trích xuất chính xác:
1. Phần TỪ VỰNG → chỉ lấy danh sách từ vựng (không lấy điểm ngữ pháp)
2. Phần NGỮ PHÁP → chỉ lấy các điểm ngữ pháp kèm bài tập (không lấy từ vựng)

Luôn trả về JSON hợp lệ theo schema được yêu cầu.
Với bộ thủ:
- type "y" = ý (bộ thủ ngữ nghĩa), type "am" = âm (thanh bàng), type "solo" = độc thể
- Tên bộ thủ viết theo âm Hán Việt`;

function buildPrompt(segments: DocxSegments, filename: string): string {
  const hasSegments = segments.vocab || segments.grammar;
  const body = hasSegments
    ? `=== PHẦN TỪ VỰNG ===
${segments.vocab || '(không có)'}

=== PHẦN NGỮ PHÁP ===
${segments.grammar || '(không có)'}`
    : `=== NỘI DUNG ĐẦY ĐỦ ===
${segments.full}`;

  return `Phân tích file bài học: "${filename}"

${body}

QUAN TRỌNG:
- Chỉ đưa vào mảng "vocab" những từ trong phần TỪ VỰNG (không đưa công thức ngữ pháp vào vocab)
- Chỉ đưa vào mảng "grammar" những điểm ngữ pháp trong phần NGỮ PHÁP (không lặp từ vựng vào grammar)

Trả về JSON với cấu trúc sau (không thêm markdown code block):
{
  "title": "Tên bài học ngắn gọn",
  "subtitle": "Mô tả ngắn về chủ đề bài",
  "level": "HSK2",
  "vocab": [
    {
      "zh": "汉字",
      "py": "hànyǔ",
      "pos": "Danh từ",
      "vn": "Nghĩa tiếng Việt",
      "botu": [
        {
          "char": "汉",
          "parts": [
            {"t": "y", "ph": "氵", "n": "thủy·nước"},
            {"t": "am", "ph": "又", "n": "hựu"}
          ]
        }
      ],
      "ex": {"zh": "Câu ví dụ tiếng Trung", "vn": "Dịch tiếng Việt"}
    }
  ],
  "grammar": [
    {
      "title": "Tên điểm ngữ pháp tiếng Trung",
      "titleVn": "Tên tiếng Việt",
      "formula": "S + V + 了 + O",
      "explanation": "Giải thích chi tiết bằng tiếng Việt",
      "examples": [
        {"zh": "Câu ví dụ", "vn": "Dịch", "note": "Ghi chú nếu cần"}
      ],
      "exercises": [
        {
          "type": "fill",
          "question": "我_____完了。(吃/喝/看)",
          "blank": "_____",
          "answer": "吃",
          "explanation": "Giải thích"
        },
        {
          "type": "choice",
          "question": "Chọn đáp án đúng: 我__饭了。",
          "options": ["吃", "喝", "看", "走"],
          "answer": "吃",
          "explanation": "Giải thích"
        }
      ],
      "comparisons": [
        {
          "wordA": "帮忙", "pinyinA": "bāngmáng", "meaningA": "giúp đỡ (không tân ngữ)",
          "wordB": "帮助", "pinyinB": "bāngzhù", "meaningB": "giúp đỡ (có tân ngữ)",
          "tip": "帮忙 là động từ không tân ngữ, 帮助 có thể có tân ngữ",
          "exA": {"zh": "你能帮忙吗？", "vn": "Bạn có thể giúp không?"},
          "exB": {"zh": "他帮助我学习。", "vn": "Anh ấy giúp tôi học."}
        }
      ]
    }
  ]
}

Chỉ trả về JSON, không có gì khác.`;
}

export async function analyzeLesson(
  textOrSegments: string | DocxSegments,
  filename: string,
): Promise<Omit<Lesson, 'id' | 'createdAt'>> {
  const segments: DocxSegments =
    typeof textOrSegments === 'string'
      ? { full: textOrSegments, vocab: '', grammar: '' }
      : textOrSegments;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(segments, filename) }],
  });

  const raw = (message.content[0] as { text: string }).text.trim();
  const parsed = JSON.parse(raw);

  const vocab: VocabCard[] = (parsed.vocab || []).map((v: Omit<VocabCard, 'id'>) => ({ ...v, id: nanoid() }));
  const grammar: GrammarPoint[] = (parsed.grammar || []).map((g: Omit<GrammarPoint, 'id'>) => ({
    ...g,
    id: nanoid(),
    exercises: (g.exercises || []).map((e: object) => ({ ...e, id: nanoid() })),
  }));

  return {
    title: parsed.title || filename,
    subtitle: parsed.subtitle || '',
    level: parsed.level || 'HSK',
    vocab,
    grammar,
  };
}
