import type { NextConfig } from "next";

/**
 * Pre-v4 "lessons" HSK1–HSK6 were Excel word lists, not lessons; in v4 they are the HSK word
 * lists /lesson/hsk-<n>. Uploaded lessons kept their ids, so they need no redirect.
 */
const LEGACY_WORD_LISTS: { id: string; level: number }[] = [
  { id: 'powog2xw13ya', level: 1 },
  { id: 'w1a2505qwiwb', level: 2 },
  { id: '5xcm8kp9kgvd', level: 3 },
  { id: 'e0umqbarxq31', level: 4 },
  { id: 'wfthhppwwwv3', level: 5 },
  { id: 'cspym5dxc10n', level: 6 },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'mammoth', 'xlsx'],
  async redirects() {
    return LEGACY_WORD_LISTS.flatMap(l => [
      { source: `/lesson/${l.id}`, destination: `/lesson/hsk-${l.level}`, permanent: true },
      { source: `/grammar/${l.id}`, destination: `/grammar/hsk/HSK${l.level}`, permanent: true },
    ]);
  },
};

export default nextConfig;
