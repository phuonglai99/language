import { NextRequest, NextResponse } from 'next/server';
import { extractSegmentsFromDocx, parseHskXlsx } from '@/lib/parse-docx';
import { analyzeLesson } from '@/lib/claude';
import { importLesson, importWordLists } from '@/server';
import { t } from '@/i18n';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: t.api.upload.noFile }, { status: 400 });

    const isDocx = file.name.endsWith('.docx');
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isDocx && !isXlsx) {
      return NextResponse.json({ error: t.api.upload.unsupportedType }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Excel: parse trực tiếp, không cần Claude
    if (isXlsx) {
      const lessonDrafts = parseHskXlsx(buffer);
      if (lessonDrafts.length === 0) {
        return NextResponse.json({ error: t.api.upload.excelUnreadable }, { status: 400 });
      }
      const lists = await importWordLists(lessonDrafts);
      return NextResponse.json({ lists });
    }

    // .docx: tách sections rồi dùng Claude phân tích
    const segments = await extractSegmentsFromDocx(buffer);
    if (!segments.full || segments.full.length < 50) {
      return NextResponse.json({ error: t.api.upload.emptyFile }, { status: 400 });
    }
    const baseName = file.name.replace(/\.docx$/, '');
    const analyzed = await analyzeLesson(segments, baseName);
    const lesson = await importLesson(analyzed);
    return NextResponse.json({ lesson });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: t.api.upload.analyzeFailed }, { status: 500 });
  }
}
