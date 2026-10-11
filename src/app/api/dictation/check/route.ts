import { NextRequest, NextResponse } from 'next/server';
import { getPassage } from '@/server';
import { extractSentences, isDictationPerfect, matchDictationWords } from '@/lib/dictation';

export const runtime = 'nodejs';

const MAX_SLUG_LENGTH = 300;
const MAX_INPUT_LENGTH = 20_000;

function validRequestBody(value: unknown): value is { slug: string; sentence_index: number; user_input: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return typeof body.slug === 'string' && body.slug.length > 0 && body.slug.length <= MAX_SLUG_LENGTH &&
    typeof body.sentence_index === 'number' && Number.isInteger(body.sentence_index) && body.sentence_index >= 0 &&
    typeof body.user_input === 'string' && body.user_input.length <= MAX_INPUT_LENGTH;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!validRequestBody(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { slug, sentence_index, user_input } = body;

  const lesson = await getPassage(slug);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const sentences = extractSentences(lesson.content);
  const sentence = sentences.find(s => s.index === sentence_index);
  if (!sentence) return NextResponse.json({ error: 'Sentence not found' }, { status: 404 });

  const result = matchDictationWords(user_input, sentence.tokens);
  const is_perfect = isDictationPerfect(result);

  return NextResponse.json({
    result,
    correct_hanzi: sentence.hanzi,
    pinyin: sentence.pinyin,
    is_perfect,
  });
}
