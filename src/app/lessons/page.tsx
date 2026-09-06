import Link from 'next/link';
import { Suspense } from 'react';
import { getAllLessons, getLessonsByHsk } from '@/lib/lessons';
import type { HskLevel } from '@/types/lesson';
import { SearchBar } from './SearchBar';

const HSK_LEVELS: HskLevel[] = [1, 2, 3, 4, 5];

const HSK_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-800',
  2: 'bg-sky-100 text-sky-800',
  3: 'bg-violet-100 text-violet-800',
  4: 'bg-amber-100 text-amber-800',
  5: 'bg-rose-100 text-rose-800',
};

interface Props {
  searchParams: Promise<{ hsk?: string; q?: string }>;
}

export default async function LessonsPage({ searchParams }: Props) {
  const params = await searchParams;
  const hskFilter = params.hsk ? parseInt(params.hsk) : null;
  const searchQuery = (params.q ?? '').toLowerCase().trim();

  let lessons = hskFilter && HSK_LEVELS.includes(hskFilter as HskLevel)
    ? getLessonsByHsk(hskFilter as HskLevel)
    : getAllLessons();

  if (searchQuery) {
    lessons = lessons.filter(
      (l) =>
        l.title_en.toLowerCase().includes(searchQuery) ||
        l.title_zh_simplified.includes(searchQuery) ||
        l.categories.some((c) => c.toLowerCase().includes(searchQuery))
    );
  }

  const allLessons = getAllLessons();
  const countByHsk = HSK_LEVELS.reduce<Record<number, number>>((acc, hsk) => {
    acc[hsk] = allLessons.filter((l) => l.hsk_level === hsk).length;
    return acc;
  }, {});

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">HSK Reading Lessons</h1>
        <p className="text-gray-500">Graded Chinese reading practice with Pinyin and vocabulary</p>
      </div>

      {/* Search + Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <Suspense fallback={null}>
          <SearchBar defaultValue={params.q ?? ''} />
        </Suspense>
        {searchQuery && (
          <p className="text-sm text-gray-500">
            {lessons.length} result{lessons.length !== 1 ? 's' : ''} for &ldquo;{params.q}&rdquo;
          </p>
        )}
      </div>

      {/* HSK Level Filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/lessons"
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            !hskFilter
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({allLessons.length})
        </Link>
        {HSK_LEVELS.map((level) => (
          <Link
            key={level}
            href={`/lessons?hsk=${level}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              hskFilter === level
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            HSK {level} ({countByHsk[level] ?? 0})
          </Link>
        ))}
      </div>

      {/* Lesson Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map((lesson) => (
          <Link
            key={lesson.slug}
            href={`/lessons/${lesson.slug}`}
            className="block border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                  HSK_COLORS[lesson.hsk_level] ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                HSK {lesson.hsk_level}
              </span>
              {lesson.categories[0] && (
                <span className="text-xs text-gray-400">{lesson.categories[0]}</span>
              )}
            </div>
            <h2 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors mb-1 line-clamp-2">
              {lesson.title_en}
            </h2>
            <p className="text-lg text-gray-600 font-medium">{lesson.title_zh_simplified}</p>
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span>{lesson.content.length} paragraphs</span>
              {lesson.audio_url && <span>🎧 Audio</span>}
            </div>
          </Link>
        ))}
      </div>

      {lessons.length === 0 && (
        <div className="text-center py-16 text-gray-400">No lessons found</div>
      )}
    </main>
  );
}
