import Link from 'next/link';
import { t } from '@/i18n';
import { getAdjacentPassages, getPassage } from '@/server';
import LessonReader from './LessonReader';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = await getPassage(slug);
  if (!lesson) return { title: t.reading.lesson.notFound };
  return {
    title: t.reading.lesson.metaTitle(lesson.title_zh_simplified, lesson.title_en, lesson.hsk_level),
    description: lesson.content_text.slice(0, 150),
  };
}

export default async function ReadingLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Rendered on the server, so the lesson text is in the first response instead
  // of waiting on hydration + a /api/reading/[slug] round-trip.
  const lesson = await getPassage(slug);

  if (!lesson) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'transparent' }}>
      <div style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>{t.reading.lesson.notFound}</div>
      <Link href="/reading" style={{ color: 'var(--red)', textDecoration: 'none', fontSize: 13 }}>{t.common.backToList}</Link>
    </div>
  );

  const neighbors = await getAdjacentPassages(lesson.slug, lesson.hsk_level);
  return (
    <LessonReader
      lesson={lesson}
      prev={neighbors.prev}
      next={neighbors.next}
      position={{ index: neighbors.index, total: neighbors.total }}
    />
  );
}
