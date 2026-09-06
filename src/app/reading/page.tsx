'use client';
import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

type MBLesson = {
  slug: string; url: string;
  title_en: string; title_zh_simplified: string; title_zh_traditional: string;
  hsk_level: number; categories: string[];
  audio_url: string | null; content_text: string;
};

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};

const HSK_LEVELS = [1, 2, 3, 4, 5];

function CategoryBadge({ cat }: { cat: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      background: '#f3f4f6',
      fontSize: 9.5, color: '#6b7280', fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {cat}
    </span>
  );
}

function ReadingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hsk = searchParams.get('hsk') ? Number(searchParams.get('hsk')) : null;
  const q = searchParams.get('q') ?? '';

  const [lessons, setLessons] = useState<MBLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchVal, setSearchVal] = useState(q);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (hsk) params.set('hsk', String(hsk));
    if (q) params.set('q', q);
    fetch(`/api/reading?${params}`)
      .then(r => r.json())
      .then(d => { setLessons(d.lessons ?? []); setLoading(false); });
  }, [hsk, q]);

  function setFilter(nextHsk: number | null, nextQ?: string) {
    const params = new URLSearchParams();
    if (nextHsk) params.set('hsk', String(nextHsk));
    const qVal = nextQ !== undefined ? nextQ : q;
    if (qVal) params.set('q', qVal);
    startTransition(() => router.replace(`/reading?${params}`));
  }

  function handleSearch(val: string) {
    setSearchVal(val);
    const params = new URLSearchParams();
    if (hsk) params.set('hsk', String(hsk));
    if (val) params.set('q', val);
    startTransition(() => router.replace(`/reading?${params}`));
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginRight: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>← </Link>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, fontWeight: 700, color: '#fff' }}>读课文</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Đọc bài khoá</span>
          </div>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,191,176,0.5)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
            <input
              value={searchVal}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Tìm bài đọc…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 10px 7px 32px',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7, color: '#f5f1e8', fontSize: 13,
                fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none',
              }}
            />
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.5)', whiteSpace: 'nowrap' }}>
            <strong style={{ color: '#f5f1e8' }}>{lessons.length}</strong> bài
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px' }}>
        {/* HSK filter pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            onClick={() => setFilter(null)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: `1.5px solid ${hsk === null ? 'var(--ink)' : 'var(--border)'}`,
              background: hsk === null ? 'var(--ink)' : 'transparent',
              color: hsk === null ? 'var(--paper)' : 'var(--ash)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              transition: 'all 0.15s',
            }}
          >
            Tất cả
          </button>
          {HSK_LEVELS.map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilter(hsk === lvl ? null : lvl)}
              style={{
                padding: '6px 16px', borderRadius: 20,
                border: `1.5px solid ${hsk === lvl ? LEVEL_COLOR[lvl] : 'var(--border)'}`,
                background: hsk === lvl ? LEVEL_COLOR[lvl] : 'transparent',
                color: hsk === lvl ? '#fff' : 'var(--ash)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                transition: 'all 0.15s',
              }}
            >
              HSK {lvl}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>Đang tải…</div>
        ) : lessons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)' }}>Không tìm thấy bài nào.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {lessons.map(l => (
              <Link
                key={l.slug}
                href={`/reading/${l.slug}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 14, overflow: 'hidden',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                    transition: 'box-shadow 0.15s, transform 0.15s',
                    height: '100%', display: 'flex', flexDirection: 'column',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 24px rgba(0,0,0,0.11)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'none';
                  }}
                >
                  {/* Color bar */}
                  <div style={{ height: 3, background: LEVEL_COLOR[l.hsk_level] ?? 'var(--ash)' }} />

                  <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Level + audio */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                        background: (LEVEL_COLOR[l.hsk_level] ?? '#888') + '18',
                        color: LEVEL_COLOR[l.hsk_level] ?? '#888', fontSize: 11, fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
                      }}>
                        HSK {l.hsk_level}
                      </span>
                      {l.audio_url && (
                        <span style={{ fontSize: 13, color: 'var(--ash-light)' }}>🎧</span>
                      )}
                    </div>

                    {/* Chinese title */}
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
                      {l.title_zh_simplified}
                    </div>

                    {/* English title */}
                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4, flex: 1 }}>
                      {l.title_en}
                    </div>

                    {/* Categories */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, paddingBottom: 4 }}>
                      {l.categories.slice(0, 3).map(cat => <CategoryBadge key={cat} cat={cat} />)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ReadingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--ash)' }}>Đang tải…</div>}>
      <ReadingPageInner />
    </Suspense>
  );
}
