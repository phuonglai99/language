import { NextRequest, NextResponse } from 'next/server';
import { getMBLesson } from '@/lib/db';
import { extractSentences } from '@/lib/dictation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lesson = getMBLesson(slug);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sentences = extractSentences(lesson.content).map(s => ({
    index: s.index,
    pinyin: s.pinyin,
    wordCount: s.wordCount,
    // hanzi NOT included here — returned only via /check to prevent spoilers
  }));

  return NextResponse.json({
    lesson: {
      slug: lesson.slug,
      title_en: lesson.title_en,
      title_zh_simplified: lesson.title_zh_simplified,
      title_zh_traditional: lesson.title_zh_traditional,
      hsk_level: lesson.hsk_level,
      categories: lesson.categories,
      audio_url: lesson.audio_url,
    },
    sentences,
  });
}
