'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { VocabListCard } from '@/app/components/VocabListCard';
import { Pagination } from '@/app/components/Pagination';

interface VocabItem {
  lessonId: string; lessonTitle: string;
  zh: string; py: string; pos: string; vn: string;
  ex: { zh: string; vn: string };
}

const LEVEL_COLOR: Record<string, string> = {
  HSK1: '#22c55e', HSK2: '#3b82f6', HSK3: '#f59e0b',
  HSK4: '#ef4444', HSK5: '#8b5cf6', HSK6: '#06b6d4',
};

const PAGE_SIZE = 10;

function speak(text: string) {
  if (typeof window === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function VocabLevelPage() {
  const params = useParams();
  const level = decodeURIComponent(params.level as string);
  const [items, setItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/vocab?level=${encodeURIComponent(level)}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false); });
  }, [level]);

  const filtered = search.trim()
    ? items.filter(it => it.zh.includes(search) || it.py.toLowerCase().includes(search.toLowerCase()) || it.vn.toLowerCase().includes(search.toLowerCase()))
    : items;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const accent = LEVEL_COLOR[level] ?? '#6b7280';

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 40, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
            ← Về trang chủ
          </Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: accent, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0 }}>{level}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Từ vựng</span>
          {!loading && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{filtered.length} từ</span>}
          {/* Search */}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Lọc từ…"
              style={{ padding: '7px 12px 7px 30px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, color: '#fff', fontSize: 12, fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none', width: 170 }}
            />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af', fontSize: 14 }}>Đang tải…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af', fontSize: 14 }}>Không có từ vựng nào</div>
        )}

        {!loading && pageItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pageItems.map((it, i) => (
              <VocabListCard
                key={i}
                item={{ zh: it.zh, py: it.py, pos: it.pos, vn: it.vn, ex: it.ex, lessonBadge: it.lessonTitle }}
                accent={accent}
                num={(currentPage - 1) * PAGE_SIZE + i + 1}
                href={`/lesson/${it.lessonId}?mode=flash&word=${encodeURIComponent(it.zh)}`}
              />
            ))}
          </div>
        )}

        {!loading && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={p => setPage(p)}
            accent={accent}
            total={filtered.length}
            pageSize={PAGE_SIZE}
          />
        )}
      </main>
    </div>
  );
}


