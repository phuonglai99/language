import { NextRequest, NextResponse } from 'next/server';
import { getPassage, savePassageAlignment } from '@/server';
import type { SentenceTimestamp } from '@/types/api';
import { cleanHanzi, extractSentences, remapContentToSentences } from '@/lib/dictation';
import { t } from '@/i18n';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lesson = await getPassage(slug);
  if (!lesson) return NextResponse.json({ error: t.api.common.notFound }, { status: 404 });

  const tsByIndex = new Map((lesson.sentence_timestamps ?? []).map(mark => [mark.index, mark]));
  const sentences = extractSentences(lesson.content).map(s => {
    const mark = tsByIndex.get(s.index);
    return {
      index: s.index,
      hanzi: s.hanzi,
      pinyin: s.pinyin,
      wordCount: s.wordCount,
      start: mark?.start ?? null,
      end: mark?.end ?? null,
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
    pinyin?: string;
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
  const lesson = await getPassage(slug);
  if (!lesson) return NextResponse.json({ error: t.api.common.notFound }, { status: 404 });

  const body = await req.json() as AlignPayload;
  if (!Array.isArray(body.sentences) || body.sentences.length === 0) {
    return NextResponse.json({ error: t.api.dictationAlign.sentencesRequired }, { status: 400 });
  }

  const incoming: { hanzi: string; pinyin: string; start: number | null; end: number | null }[] = [];
  for (let i = 0; i < body.sentences.length; i++) {
    const s = body.sentences[i];
    const hanzi = (s.hanzi ?? '').trim();
    const start = asTime(s.start);
    const end = asTime(s.end);
    if (start != null && end != null && end <= start) {
      return NextResponse.json({ error: t.api.dictationAlign.endBeforeStart(i + 1) }, { status: 400 });
    }
    incoming.push({ hanzi, pinyin: (s.pinyin ?? '').trim(), start, end });
  }

  const original = extractSentences(lesson.content);
  const sameShape =
    incoming.length === original.length &&
    incoming.every((s, i) => cleanHanzi(s.hanzi) === cleanHanzi(original[i].hanzi));

  if (!sameShape) {
    const emptyAt = incoming.findIndex(s => !s.hanzi);
    if (emptyAt >= 0) {
      return NextResponse.json({ error: t.api.dictationAlign.sentenceMissingText(emptyAt + 1) }, { status: 400 });
    }
  }

  let timestamps: SentenceTimestamp[];
  if (sameShape) {
    timestamps = incoming.map((s, i) => ({
      index: original[i].index,
      start: s.start,
      end: s.end,
    }));
    const ok = await savePassageAlignment(slug, timestamps);
    if (!ok) return NextResponse.json({ error: t.api.dictationAlign.saveFailed }, { status: 500 });
  } else {
    const content = remapContentToSentences(
      lesson.content,
      incoming.map(s => s.hanzi),
    );
    // A sentence that matched no original tokens comes back as one token without pinyin;
    // keep the pinyin typed for it in the align screen.
    content.forEach((para, i) => {
      if (para.length === 1 && !para[0].pinyin && incoming[i].pinyin) para[0] = { ...para[0], pinyin: incoming[i].pinyin };
    });
    timestamps = incoming.map((s, i) => ({
      index: i,
      start: s.start,
      end: s.end,
    }));
    const ok = await savePassageAlignment(slug, timestamps, content);
    if (!ok) return NextResponse.json({ error: t.api.dictationAlign.saveFailed }, { status: 500 });
  }

  return NextResponse.json({ ok: true, timestamps, contentUpdated: !sameShape });
}
