'use client';
import { useState, useEffect, useTransition, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type DictationLesson = {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
  title_zh_traditional: string;
  hsk_level: number;
  categories: string[];
  audio_url: string | null;
  vocabCount?: number;
};

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};

const HSK_LEVELS = [1, 2, 3, 4, 5];
type AlignmentStatus = 'Checked' | 'Uncheck';

function getAlignmentStatus(categories: string[]): AlignmentStatus | null {
  if (categories.includes('Uncheck')) return 'Uncheck';
  if (categories.includes('Checked')) return 'Checked';
  return null;
}

function getAlignmentStatusParam(status: string | null): AlignmentStatus | null {
  const normalized = status?.toLowerCase();
  if (normalized === 'checked') return 'Checked';
  if (normalized === 'uncheck' || normalized === 'unchecked') return 'Uncheck';
  return null;
}

function isAlignmentStatus(cat: string) {
  return cat === 'Checked' || cat === 'Uncheck';
}

function AlignmentStatusBadge({ status }: { status: AlignmentStatus }) {
  const isChecked = status === 'Checked';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      background: isChecked ? 'rgba(22,163,74,0.12)' : 'rgba(200,57,43,0.12)',
      border: `1px solid ${isChecked ? 'rgba(22,163,74,0.32)' : 'rgba(200,57,43,0.32)'}`,
      fontSize: 9.5, color: isChecked ? '#16a34a' : '#c8392b',
      fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
      letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function DictationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hsk = searchParams.get('hsk') ? Number(searchParams.get('hsk')) : null;
  const q = searchParams.get('q') ?? '';
  const status = getAlignmentStatusParam(searchParams.get('status'));

  const [lessons, setLessons] = useState<DictationLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchVal, setSearchVal] = useState(q);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (hsk) params.set('hsk_level', String(hsk));
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    fetch(`/api/dictation/lessons?${params}`)
      .then(r => r.json())
      .then(d => { setLessons(d.lessons ?? []); setLoading(false); });
  }, [hsk, q, status]);

  function setFilter(nextHsk: number | null, nextStatus = status) {
    const params = new URLSearchParams();
    if (nextHsk) params.set('hsk', String(nextHsk));
    if (q) params.set('q', q);
    if (nextStatus) params.set('status', nextStatus);
    startTransition(() => router.replace(`/dictation?${params}`));
  }

  function handleSearch(val: string) {
    setSearchVal(val);
    const params = new URLSearchParams();
    if (hsk) params.set('hsk', String(hsk));
    if (val) params.set('q', val);
    if (status) params.set('status', status);
    startTransition(() => router.replace(`/dictation?${params}`));
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, fontWeight: 700, color: '#f5f1e8' }}>听写</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'var(--red)', textTransform: 'uppercase' }}>Nghe chép chính tả</span>
          </div>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,191,176,0.5)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
            <input
              value={searchVal}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Tìm bài nghe…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 10px 7px 32px',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7, color: '#f5f1e8', fontSize: 13,
                fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none',
              }}
            />
          </div>
          <Link href="/dictation/align" style={{
            padding: '6px 12px', borderRadius: 7, textDecoration: 'none', flexShrink: 0,
            background: 'rgba(255,255,255,0.08)', color: '#f5f1e8',
            fontSize: 12, fontFamily: 'Be Vietnam Pro, sans-serif',
          }}>
            Cắt thủ công
          </Link>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.5)', whiteSpace: 'nowrap' }}>
            <strong style={{ color: '#f5f1e8' }}>{lessons.length}</strong> bài
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px' }}>
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
          <div style={{ flex: 1 }} />
          {(['Checked', 'Uncheck'] as AlignmentStatus[]).map(nextStatus => {
            const active = status === nextStatus;
            const isChecked = nextStatus === 'Checked';
            const color = isChecked ? '#16a34a' : '#c8392b';
            return (
              <button
                key={nextStatus}
                onClick={() => setFilter(hsk, active ? null : nextStatus)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1.5px solid ${active ? color : 'var(--border)'}`,
                  background: active ? color : 'transparent',
                  color: active ? '#fff' : 'var(--ash)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  transition: 'all 0.15s',
                }}
              >
                {nextStatus}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>Đang tải…</div>
        ) : lessons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)' }}>Không tìm thấy bài nào.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {lessons.map(l => {
              const alignmentStatus = getAlignmentStatus(l.categories);
              const displayCategories = l.categories.filter(cat => !isAlignmentStatus(cat)).slice(0, 3);
              return (
              <Link key={l.slug} href={`/dictation/${l.slug}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: 'var(--card-bg)', border: '1px solid var(--border)',
                    borderRadius: 12, overflow: 'hidden',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    height: '100%', display: 'flex', flexDirection: 'column',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = LEVEL_COLOR[l.hsk_level] ?? 'var(--ash)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{ height: 3, background: LEVEL_COLOR[l.hsk_level] ?? 'var(--ash)' }} />
                  <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        background: LEVEL_COLOR[l.hsk_level] ?? 'var(--ash)',
                        color: 'white', fontSize: 9.5, fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
                      }}>
                        HSK {l.hsk_level}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {alignmentStatus && <AlignmentStatusBadge status={alignmentStatus} />}
                        <span style={{ fontSize: 13, color: 'var(--ash-light)' }}>
                          {l.audio_url ? '🎧' : '🔇'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
                      {l.title_zh_simplified}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ash)', lineHeight: 1.4, flex: 1 }}>
                      {l.title_en}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {displayCategories.map(cat => (
                          <span key={cat} style={{
                            display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                            background: 'var(--paper-alt)', border: '1px solid var(--border)',
                            fontSize: 9.5, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace',
                            letterSpacing: '0.06em', whiteSpace: 'nowrap',
                          }}>
                            {cat}
                          </span>
                        ))}
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {l.vocabCount ?? 0} từ
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DictationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--ash)' }}>Đang tải…</div>}>
      <DictationPageInner />
    </Suspense>
  );
}
