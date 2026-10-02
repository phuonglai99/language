import { NextRequest, NextResponse } from 'next/server';
import { queryMBLessons } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hsk = searchParams.get('hsk_level') ?? searchParams.get('hsk');

  const lessons = queryMBLessons({
    hsk: hsk ? Number(hsk) : null,
    q: searchParams.get('q'),
    status: searchParams.get('status'),
    searchContentText: true,
  });

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
