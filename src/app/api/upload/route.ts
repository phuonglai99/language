import { NextRequest, NextResponse } from 'next/server';
import { extractSegmentsFromDocx, parseHskXlsx } from '@/lib/parse-docx';
import { analyzeLesson } from '@/lib/claude';
import { saveLesson } from '@/lib/db';
import { nanoid } from '@/lib/nanoid';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const isDocx = file.name.endsWith('.docx');
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isDocx && !isXlsx) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ file .docx và .xlsx' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Excel: parse trực tiếp, không cần Claude
    if (isXlsx) {
      const lessonDrafts = parseHskXlsx(buffer);
      if (lessonDrafts.length === 0) {
        return NextResponse.json({ error: 'Không đọc được dữ liệu từ file Excel' }, { status: 400 });
      }
      const now = new Date().toISOString();
      const lessons = lessonDrafts.map(d => ({ ...d, id: nanoid(12), createdAt: now }));
      for (const l of lessons) saveLesson(l);
      return NextResponse.json({ lessons });
    }

    // .docx: tách sections rồi dùng Claude phân tích
    const segments = await extractSegmentsFromDocx(buffer);
    if (!segments.full || segments.full.length < 50) {
      return NextResponse.json({ error: 'File rỗng hoặc không đọc được nội dung' }, { status: 400 });
    }
    const baseName = file.name.replace(/\.docx$/, '');
    const analyzed = await analyzeLesson(segments, baseName);
    const lesson = { ...analyzed, id: nanoid(12), createdAt: new Date().toISOString() };
    saveLesson(lesson);
    return NextResponse.json({ lesson });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Phân tích thất bại. Kiểm tra ANTHROPIC_API_KEY.' }, { status: 500 });
  }
}
