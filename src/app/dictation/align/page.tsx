'use client';
import { useState, useEffect, useTransition, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type AlignLesson = {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
  hsk_level: number;
  audio_url: string | null;
  sentenceCount: number;
  unmatchedCount: number;
  hasTimestamps: boolean;
};

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};
const HSK_LEVELS = [1, 2, 3, 4, 5];
type AlignmentStatus = 'Checked' | 'Uncheck';

function getAlignmentStatusParam(status: string | null): AlignmentStatus | null {
  const normalized = status?.toLowerCase();
  if (normalized === 'checked') return 'Checked';
  if (normalized === 'uncheck' || normalized === 'unchecked') return 'Uncheck';
  return null;
}

function AlignmentStatusBadge({ status }: { status: AlignmentStatus }) {
  const isChecked = status === 'Checked';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      background: isChecked ? 'rgba(22,163,74,0.12)' : 'rgba(200,57,43,0.12)',
      border: `1px solid ${isChecked ? 'rgba(22,163,74,0.32)' : 'rgba(200,57,43,0.32)'}`,
      color: isChecked ? '#16a34a' : '#c8392b',
      fontSize: 9.5, fontWeight: 700,
      fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function AlignListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hsk = searchParams.get('hsk') ? Number(searchParams.get('hsk')) : null;
  const unmatched = searchParams.get('unmatched') === '1';
  const q = searchParams.get('q') ?? '';
  const status = getAlignmentStatusParam(searchParams.get('status'));

  const [lessons, setLessons] = useState<AlignLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchVal, setSearchVal] = useState(q);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (hsk) params.set('hsk', String(hsk));
    if (status) params.set('status', status);
    else if (unmatched) params.set('unmatched', '1');
    if (q) params.set('q', q);
    fetch(`/api/dictation/align?${params}`)
      .then(r => r.json())
      .then(d => { setLessons(d.lessons ?? []); setLoading(false); });
  }, [hsk, unmatched, q, status]);

  function replaceParams(next: { hsk?: number | null; unmatched?: boolean; q?: string; status?: AlignmentStatus | null }) {
    const params = new URLSearchParams();
    const nextHsk = next.hsk !== undefined ? next.hsk : hsk;
    const nextUnmatched = next.unmatched !== undefined ? next.unmatched : unmatched;
    const nextQ = next.q !== undefined ? next.q : q;
    const nextStatus = next.status !== undefined ? next.status : status;
    if (nextHsk) params.set('hsk', String(nextHsk));
    if (nextStatus) params.set('status', nextStatus);
    else if (nextUnmatched) params.set('unmatched', '1');
    if (nextQ) params.set('q', nextQ);
    startTransition(() => router.replace(`/dictation/align?${params}`));
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/dictation" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
              ← Luyện nghe
            </Link>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, fontWeight: 700, color: '#f5f1e8' }}>✂️</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'var(--red)', textTransform: 'uppercase' }}>Cắt audio thủ công</span>
          </div>
          <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
            <input
              value={searchVal}
              onChange={e => {
                setSearchVal(e.target.value);
                replaceParams({ q: e.target.value });
              }}
              placeholder="Tìm bài…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 10px',
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <button
            onClick={() => replaceParams({ hsk: null })}
            style={{
              padding: '6px 16px', borderRadius: 20, border: `1.5px solid ${hsk === null ? 'var(--ink)' : 'var(--border)'}`,
              background: hsk === null ? 'var(--ink)' : 'transparent',
              color: hsk === null ? 'var(--paper)' : 'var(--ash)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Tất cả
          </button>
          {HSK_LEVELS.map(lvl => (
            <button
              key={lvl}
              onClick={() => replaceParams({ hsk: hsk === lvl ? null : lvl })}
              style={{
                padding: '6px 16px', borderRadius: 20,
                border: `1.5px solid ${hsk === lvl ? LEVEL_COLOR[lvl] : 'var(--border)'}`,
                background: hsk === lvl ? LEVEL_COLOR[lvl] : 'transparent',
                color: hsk === lvl ? '#fff' : 'var(--ash)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
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
                onClick={() => replaceParams({ status: active ? null : nextStatus, unmatched: false })}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1.5px solid ${active ? color : 'var(--border)'}`,
                  background: active ? color : 'transparent',
                  color: active ? '#fff' : 'var(--ash)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {nextStatus}
              </button>
            );
          })}
          <button
            onClick={() => replaceParams({ unmatched: !unmatched, status: null })}
            style={{
              padding: '6px 14px', borderRadius: 20,
              border: `1.5px solid ${unmatched && !status ? '#c8392b' : 'var(--border)'}`,
              background: unmatched && !status ? '#c8392b' : 'transparent',
              color: unmatched && !status ? '#fff' : 'var(--ash)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {unmatched && !status ? 'Đang lọc: thiếu mốc' : 'Chỉ bài thiếu mốc'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>Đang tải…</div>
        ) : lessons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ash)' }}>Không có bài nào.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {lessons.map(l => {
              const alignmentStatus = l.unmatchedCount > 0 ? 'Uncheck' : 'Checked';
              return (
              <Link key={l.slug} href={`/dictation/align/${l.slug}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: 'var(--card-bg)', border: '1px solid var(--border)',
                    borderRadius: 12, overflow: 'hidden', height: '100%',
                    display: 'flex', flexDirection: 'column',
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
                        <AlignmentStatusBadge status={alignmentStatus} />
                        <span style={{
                          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                          color: l.unmatchedCount > 0 ? '#c8392b' : '#16a34a',
                        }}>
                          {l.unmatchedCount > 0
                            ? `${l.unmatchedCount}/${l.sentenceCount} thiếu mốc`
                            : `${l.sentenceCount} câu ✓`}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
                      {l.title_zh_simplified}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ash)', lineHeight: 1.4, flex: 1 }}>
                      {l.title_en}
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

export default function AlignListPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--ash)' }}>Đang tải…</div>}>
      <AlignListInner />
    </Suspense>
  );
}
