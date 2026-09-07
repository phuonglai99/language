import { NextRequest, NextResponse } from 'next/server';
import { getMBLesson, countLessonVocab } from '@/lib/db';
import { extractSentences } from '@/lib/dictation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lesson = getMBLesson(slug);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tsByIndex = new Map(
    (lesson.sentence_timestamps ?? []).map(t => [t.index, t]),
  );
  const sentences = extractSentences(lesson.content).map(s => {
    const t = tsByIndex.get(s.index);
    return {
      index: s.index,
      hanzi: s.hanzi,   // needed for TTS fallback when not yet aligned
      pinyin: s.pinyin,
      wordCount: s.wordCount,
      start: t?.start ?? null,
      end: t?.end ?? null,
    };
  });

  return NextResponse.json({
    lesson: {
      slug: lesson.slug,
      title_en: lesson.title_en,
      title_zh_simplified: lesson.title_zh_simplified,
      title_zh_traditional: lesson.title_zh_traditional,
      hsk_level: lesson.hsk_level,
      categories: lesson.categories,
      audio_url: lesson.audio_url,
      vocabCount: countLessonVocab(lesson.content),
    },
    sentences,
  });
}
