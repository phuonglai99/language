'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/i18n';

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};

const HSK_LEVELS = [1, 2, 3, 4, 5];
const SEARCH_DEBOUNCE_MS = 250;

export type AlignmentStatus = 'Checked' | 'Uncheck';

interface Filters {
  hsk: number | null;
  q: string;
  status: AlignmentStatus | null;
}

function buildHref({ hsk, q, status }: Filters) {
  const params = new URLSearchParams();
  if (hsk) params.set('hsk', String(hsk));
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return qs ? `/reading?${qs}` : '/reading';
}

/** Header search box. Debounced so a burst of keystrokes is one navigation. */
export function ReadingSearch({ hsk, q, status }: Filters) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [, startTransition] = useTransition();
  // Keep in sync when the URL changes from elsewhere (back button, pills).
  const lastQ = useRef(q);

  useEffect(() => {
    if (lastQ.current !== q) {
      lastQ.current = q;
      setValue(q);
    }
  }, [q]);

  useEffect(() => {
    if (value === q) return;
    const timer = setTimeout(() => {
      lastQ.current = value;
      startTransition(() => router.replace(buildHref({ hsk, q: value, status })));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, q, hsk, status, router]);

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(200,191,176,0.5)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={t.reading.filters.searchPlaceholder}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '7px 10px 7px 32px',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, color: '#f5f1e8', fontSize: 13,
          fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none',
        }}
      />
    </div>
  );
}

/** HSK level pills + alignment status toggles. */
export function ReadingFilterPills({ hsk, q, status }: Filters) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function go(next: Partial<Filters>) {
    startTransition(() => router.replace(buildHref({ hsk, q, status, ...next })));
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
      <button
        onClick={() => go({ hsk: null })}
        style={{
          padding: '6px 16px', borderRadius: 20, border: `1.5px solid ${hsk === null ? 'var(--ink)' : 'var(--border)'}`,
          background: hsk === null ? 'var(--ink)' : 'transparent',
          color: hsk === null ? 'var(--paper)' : 'var(--ash)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
          transition: 'all 0.15s',
        }}
      >
        {t.common.all}
      </button>
      {HSK_LEVELS.map(lvl => (
        <button
          key={lvl}
          onClick={() => go({ hsk: hsk === lvl ? null : lvl })}
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
            onClick={() => go({ status: active ? null : nextStatus })}
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
            {t.common.alignmentStatus[nextStatus]}
          </button>
        );
      })}
    </div>
  );
}
