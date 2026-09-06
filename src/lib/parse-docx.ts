import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { VocabCard, Lesson } from '@/types';
import { nanoid } from '@/lib/nanoid';

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export interface DocxSegments {
  full: string;
  vocab: string;
  grammar: string;
}

// Split docx raw text into vocab and grammar sections based on common Vietnamese HSK doc headers
export async function extractSegmentsFromDocx(buffer: Buffer): Promise<DocxSegments> {
  const result = await mammoth.extractRawText({ buffer });
  const full = result.value.trim();
  const lines = full.split('\n');

  // Match numbered section headers like "2. TỪ VỰNG" or "II. NGỮ PHÁP" — require leading number/roman to avoid matching inline labels
  const VOCAB_RE   = /^\s*(?:[IVXLCDM]+|\d+)[.\s]+\s*(TỪ\s*VỰNG|TỪ\s*MỚI|VOCABULARY|词汇|词语)\s*$/i;
  const GRAMMAR_RE = /^\s*(?:[IVXLCDM]+|\d+)[.\s]+\s*(NGỮ\s*PHÁP|GRAMMAR|语法|语言点)\s*$/i;

  let vocabStart = -1, grammarStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (vocabStart < 0   && VOCAB_RE.test(lines[i]))   vocabStart   = i;
    if (grammarStart < 0 && GRAMMAR_RE.test(lines[i])) grammarStart = i;
  }

  const vocabLines   = vocabStart   >= 0 ? lines.slice(vocabStart   + 1, grammarStart >= 0 ? grammarStart : undefined) : [];
  const grammarLines = grammarStart >= 0 ? lines.slice(grammarStart + 1) : [];

  return {
    full,
    vocab:   vocabLines.join('\n').trim()   || full,
    grammar: grammarLines.join('\n').trim() || '',
  };
}

export function extractTextFromXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
    lines.push(`=== Sheet: ${sheetName} ===`);
    for (const row of rows) {
      const cells = (row as string[]).map(c => String(c ?? '').trim()).filter(Boolean);
      if (cells.length > 0) lines.push(cells.join('\t'));
    }
  }
  return lines.join('\n').trim();
}

// STT | Từ mới | Phiên âm | Giải thích | Ví dụ (chữ hán) | Phiên âm | Dịch
function isHskRow(row: unknown[]): boolean {
  return row.length >= 4 && typeof row[0] === 'number' && row[0] > 0;
}

export function parseHskXlsx(buffer: Buffer): Omit<Lesson, 'id' | 'createdAt'>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const lessons: Omit<Lesson, 'id' | 'createdAt'>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    const vocab: VocabCard[] = [];
    for (const row of rows) {
      if (!isHskRow(row)) continue;
      const zh  = String(row[1] ?? '').trim();
      const py  = String(row[2] ?? '').trim();
      const vn  = String(row[3] ?? '').trim();
      const exZh = String(row[4] ?? '').trim();
      const exVn = String(row[6] ?? '').trim();
      if (!zh) continue;
      vocab.push({ id: nanoid(10), zh, py, pos: '', vn, botu: [], ex: { zh: exZh, vn: exVn } });
    }

    if (vocab.length === 0) continue;

    lessons.push({
      title: sheetName,
      subtitle: `${vocab.length} từ vựng ${sheetName}`,
      level: sheetName,
      vocab,
      grammar: [],
    });
  }

  return lessons;
}
