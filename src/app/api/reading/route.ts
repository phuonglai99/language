import { NextRequest, NextResponse } from 'next/server';
import { getAllMBLessons, getMBLessonsByHsk } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hsk = searchParams.get('hsk');
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const status = searchParams.get('status')?.toLowerCase() ?? '';

  let lessons = hsk ? getMBLessonsByHsk(Number(hsk)) : getAllMBLessons();

  if (status === 'checked') {
    lessons = lessons.filter(l => l.categories.includes('Checked'));
  } else if (status === 'uncheck' || status === 'unchecked') {
    lessons = lessons.filter(l => l.categories.includes('Uncheck'));
  }

  if (q) {
    lessons = lessons.filter(
      l =>
        l.title_en.toLowerCase().includes(q) ||
        l.title_zh_simplified.includes(q) ||
        l.categories.some(c => c.toLowerCase().includes(q)),
    );
  }

  return NextResponse.json({ lessons });
}
