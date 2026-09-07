import { NextRequest, NextResponse } from 'next/server';
import { getMBLesson, saveMBLessonAlignment, type SentenceTimestamp } from '@/lib/db';
import { cleanHanzi, extractSentences, remapContentToSentences } from '@/lib/dictation';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lesson = getMBLesson(slug);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tsByIndex = new Map((lesson.sentence_timestamps ?? []).map(t => [t.index, t]));
  const sentences = extractSentences(lesson.content).map(s => {
    const t = tsByIndex.get(s.index);
    return {
      index: s.index,
      hanzi: s.hanzi,
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
      hsk_level: lesson.hsk_level,
      audio_url: lesson.audio_url,
      content_text: lesson.content_text,
      content: lesson.content.map(para => para.map(w => ({
        hanzi: w.hanzi,
        pinyin: w.pinyin,
      }))),
    },
    sentences,
  });
}

type AlignPayload = {
  sentences?: {
    index?: number;
    hanzi?: string;
    start?: number | null;
    end?: number | null;
  }[];
};

function asTime(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lesson = getMBLesson(slug);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as AlignPayload;
  if (!Array.isArray(body.sentences) || body.sentences.length === 0) {
    return NextResponse.json({ error: 'sentences required' }, { status: 400 });
  }

  const incoming: { hanzi: string; start: number | null; end: number | null }[] = [];
  for (let i = 0; i < body.sentences.length; i++) {
    const s = body.sentences[i];
    const hanzi = (s.hanzi ?? '').trim();
    const start = asTime(s.start);
    const end = asTime(s.end);
    if (start != null && end != null && end <= start) {
      return NextResponse.json({ error: `Câu ${i + 1}: end phải lớn hơn start` }, { status: 400 });
    }
    incoming.push({ hanzi, start, end });
  }

  const original = extractSentences(lesson.content);
  const sameShape =
    incoming.length === original.length &&
    incoming.every((s, i) => cleanHanzi(s.hanzi) === cleanHanzi(original[i].hanzi));

  if (!sameShape) {
    const emptyAt = incoming.findIndex(s => !s.hanzi);
    if (emptyAt >= 0) {
      return NextResponse.json({ error: `Câu ${emptyAt + 1} chưa gắn text` }, { status: 400 });
    }
  }

  let timestamps: SentenceTimestamp[];
  if (sameShape) {
    timestamps = incoming.map((s, i) => ({
      index: original[i].index,
      start: s.start,
      end: s.end,
    }));
    const ok = saveMBLessonAlignment(slug, timestamps);
    if (!ok) return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  } else {
    const content = remapContentToSentences(
      lesson.content,
      incoming.map(s => s.hanzi),
    );
    timestamps = incoming.map((s, i) => ({
      index: i,
      start: s.start,
      end: s.end,
    }));
    const ok = saveMBLessonAlignment(slug, timestamps, content);
    if (!ok) return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, timestamps, contentUpdated: !sameShape });
}
