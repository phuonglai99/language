import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLessonBySlug, getLessonSlugs } from '@/lib/lessons';
import type { LessonWord } from '@/types/lesson';

export async function generateStaticParams() {
  return getLessonSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) return {};
  return {
    title: `${lesson.title_en} (${lesson.title_zh_simplified}) | HSK ${lesson.hsk_level}`,
    description: lesson.content_text.substring(0, 150),
  };
}

const HSK_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  2: 'bg-sky-100 text-sky-800 border-sky-200',
  3: 'bg-violet-100 text-violet-800 border-violet-200',
  4: 'bg-amber-100 text-amber-800 border-amber-200',
  5: 'bg-rose-100 text-rose-800 border-rose-200',
};

function WordTooltip({ word }: { word: LessonWord }) {
  return (
    <span className="group relative inline-block mx-0.5 cursor-default">
      {/* Tooltip above */}
      {word.definition && (
        <span className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1">
          {word.definition}
          {word.hsk && <span className="ml-1 opacity-50">HSK{word.hsk}</span>}
        </span>
      )}
      {/* Ruby annotation: pinyin above, hanzi below */}
      <ruby className="[ruby-position:over]">
        <span className="text-xl font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
          {word.hanzi}
        </span>
        <rt className="text-[11px] text-gray-400 not-italic font-normal leading-none">
          {word.pinyin}
        </rt>
      </ruby>
    </span>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) notFound();

  const hskColor = HSK_COLORS[lesson.hsk_level] ?? 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Back nav */}
      <Link
        href={`/lessons?hsk=${lesson.hsk_level}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <span>←</span>
        <span>Back to HSK {lesson.hsk_level} lessons</span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${hskColor}`}>
            HSK {lesson.hsk_level}
          </span>
          {lesson.categories.map((cat) => (
            <span key={cat} className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
              {cat}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{lesson.title_en}</h1>
        <p className="text-xl text-gray-500 font-medium">{lesson.title_zh_simplified}</p>
      </div>

      {/* Audio player */}
      {lesson.audio_url && (
        <div className="mb-8 bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Audio</p>
          <audio
            controls
            src={lesson.audio_url}
            className="w-full"
            preload="metadata"
          />
        </div>
      )}

      {/* Reading content */}
      <article className="mb-10">
        <div className="space-y-6">
          {lesson.content.map((paragraph, pi) => (
            <p key={pi} className="leading-loose">
              {paragraph.map((word, wi) => (
                <WordTooltip key={`${pi}-${wi}-${word.hanzi}`} word={word} />
              ))}
            </p>
          ))}
        </div>
      </article>

      {/* Plain text (for reading without Pinyin) */}
      <details className="border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 select-none">
          Plain Chinese text (no Pinyin)
        </summary>
        <div className="px-4 py-4 bg-gray-50 text-gray-800 leading-relaxed whitespace-pre-wrap text-lg border-t border-gray-200">
          {lesson.content_text}
        </div>
      </details>
    </main>
  );
}
