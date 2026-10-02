import type { NextConfig } from "next";

/**
 * Pre-v4 lesson ids (lessons table, removed in DB v4) → virtual lesson ids
 * ("hsk-<n>" / "topic-<slug>", see src/shared/lessons.ts). Generated from data/lessons.db.
 * Grammar of those lessons now lives on the HSK level pages.
 */
const LEGACY_LESSONS: { id: string; to: string; grammarLevel: string }[] = [
  { id: 'powog2xw13ya', to: 'hsk-1', grammarLevel: 'HSK1' },
  { id: 'w1a2505qwiwb', to: 'hsk-2', grammarLevel: 'HSK2' },
  { id: '5xcm8kp9kgvd', to: 'hsk-3', grammarLevel: 'HSK3' },
  { id: 'e0umqbarxq31', to: 'hsk-4', grammarLevel: 'HSK4' },
  { id: 'wfthhppwwwv3', to: 'hsk-5', grammarLevel: 'HSK5' },
  { id: 'cspym5dxc10n', to: 'hsk-6', grammarLevel: 'HSK6' },
  { id: 'a9ndqofjyrz0', to: 'topic-giao-thong', grammarLevel: 'HSK2' },
  { id: '8f3zju4xcder', to: 'topic-hoat-dong-hang-ngay', grammarLevel: 'HSK2' },
  { id: '4a2me3b6urwd', to: 'topic-den-nha-ban-trung-quoc', grammarLevel: 'HSK2' },
  { id: 'apayqvfq7igr', to: 'topic-trang-tu-就-so-sanh-帮-帮忙-帮助', grammarLevel: 'HSK2' },
  { id: 'nyp9zhvlnr5l', to: 'topic-bo-ngu-ket-qua', grammarLevel: 'HSK2' },
  { id: 'q9o8acs98j85', to: 'topic-nhan-manh-thong-tin', grammarLevel: 'HSK2' },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'mammoth', 'xlsx'],
  async redirects() {
    return LEGACY_LESSONS.flatMap(l => [
      { source: `/lesson/${l.id}`, destination: `/lesson/${encodeURIComponent(l.to)}`, permanent: true },
      { source: `/grammar/${l.id}`, destination: `/grammar/hsk/${l.grammarLevel}`, permanent: true },
    ]);
  },
};

export default nextConfig;
