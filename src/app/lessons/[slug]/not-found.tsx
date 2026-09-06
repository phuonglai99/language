import Link from 'next/link';

export default function LessonNotFound() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Lesson not found</h1>
      <p className="text-gray-500 mb-8">This lesson doesn&apos;t exist or may have been removed.</p>
      <Link
        href="/lessons"
        className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-full font-medium hover:bg-gray-700 transition-colors text-sm"
      >
        ← Back to all lessons
      </Link>
    </main>
  );
}
