import { NextRequest, NextResponse } from 'next/server';
import { getMBLesson } from '@/lib/db';
import { extractSentences, diffHanzi, cleanHanzi } from '@/lib/dictation';

export async function POST(req: NextRequest) {
  const body = await req.json() as { slug: string; sentence_index: number; user_input: string };
  const { slug, sentence_index, user_input } = body;

  if (!slug || sentence_index == null || user_input == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const lesson = getMBLesson(slug);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const sentences = extractSentences(lesson.content);
  const sentence = sentences.find(s => s.index === sentence_index);
  if (!sentence) return NextResponse.json({ error: 'Sentence not found' }, { status: 404 });

  const result = diffHanzi(user_input, sentence.hanzi);
  const is_perfect = cleanHanzi(user_input) === cleanHanzi(sentence.hanzi);

  return NextResponse.json({
    result,
    correct_hanzi: sentence.hanzi,
    pinyin: sentence.pinyin,
    is_perfect,
  });
}
