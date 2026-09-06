import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-gray-50 min-h-screen">
      <main className="text-center px-6 py-24">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">HSK Reading Practice</h1>
        <p className="text-gray-500 text-lg mb-10 max-w-md mx-auto">
          Graded Chinese reading lessons from HSK 1 to 5 with Pinyin, audio, and vocabulary
        </p>
        <Link
          href="/lessons"
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full font-medium hover:bg-gray-700 transition-colors"
        >
          Browse Lessons →
        </Link>
      </main>
    </div>
  );
}
