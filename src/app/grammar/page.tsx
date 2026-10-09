'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LoadingIndicator } from '@/app/components/LoadingIndicator';
import { GRAMMAR_LEVEL_LABELS } from '@/shared/grammar';
import { t } from '@/i18n';

const LEVEL_ACCENT: Record<string, string> = {
  HSK1: '#3a8a5c', HSK2: '#4a72a0', HSK3: '#a0720a', HSK4: '#c8392b',
  HSK5: '#7a3db0', HSK6: '#2a6080', 'HSK7-9': '#0f766e', 'Chưa xếp cấp': '#64748b',
};

export default function GrammarIndexPage() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/grammar', { signal: controller.signal })
      .then(response => response.json())
      .then((data: { counts?: { hsk: string; count: number }[] }) => {
        if (controller.signal.aborted) return;
        setCounts(Object.fromEntries((data.counts ?? []).map(row => [row.hsk, row.count])));
      })
      .catch(() => { if (!controller.signal.aborted) setCounts({}); });
    return () => controller.abort();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <header style={{ background: 'var(--sidebar-bg)', color: '#fff' }}>
        <div style={{ maxWidth: 900, height: 64, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: 13 }}>{t.common.backHome}</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)' }} />
          <strong>{t.grammar.index.title}</strong>
        </div>
      </header>
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>{t.grammar.index.title}</h1>
        <p style={{ color: 'var(--ash)', margin: '8px 0 28px' }}>{t.grammar.index.subtitle}</p>
        {!counts ? <LoadingIndicator label={t.common.loading} /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
            {GRAMMAR_LEVEL_LABELS.filter(level => (counts[level] ?? 0) > 0).map(level => {
              const accent = LEVEL_ACCENT[level] ?? 'var(--ash)';
              return (
                <Link key={level} href={`/grammar/hsk/${encodeURIComponent(level)}`} style={{ padding: 20, border: '1px solid var(--border)', borderTop: `4px solid ${accent}`, borderRadius: 12, background: 'var(--card-bg)', color: 'var(--ink)', textDecoration: 'none', boxShadow: '0 6px 20px rgba(15,23,42,0.06)' }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, color: accent }}>{level}</div>
                  <div style={{ marginTop: 8, color: 'var(--ash)', fontSize: 13 }}>{t.grammar.pointCount(counts[level] ?? 0)}</div>
                  <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: accent }}>{t.grammar.index.openLevel} →</div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
