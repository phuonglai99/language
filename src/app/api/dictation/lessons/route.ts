import { NextRequest, NextResponse } from 'next/server';
import { getAllMBLessons, getMBLessonsByHsk } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hsk = searchParams.get('hsk_level') ?? searchParams.get('hsk');
  const q = searchParams.get('q')?.toLowerCase() ?? '';

  let lessons = hsk ? getMBLessonsByHsk(Number(hsk)) : getAllMBLessons();

  if (q) {
    lessons = lessons.filter(
      l =>
        l.title_en.toLowerCase().includes(q) ||
        l.title_zh_simplified.includes(q) ||
        l.content_text.includes(q) ||
        l.categories.some(c => c.toLowerCase().includes(q)),
    );
  }

  const result = lessons.map(l => ({
    slug: l.slug,
    title_en: l.title_en,
    title_zh_simplified: l.title_zh_simplified,
    title_zh_traditional: l.title_zh_traditional,
    hsk_level: l.hsk_level,
    categories: l.categories,
    audio_url: l.audio_url,
    vocabCount: l.vocabCount,
  }));

  return NextResponse.json({ lessons: result });
}
