'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { HanziiGrammar } from '@/types';
import { Pagination } from '@/app/components/Pagination';

const LEVEL_COLOR: Record<string, string> = {
  HSK1: '#22c55e', HSK2: '#3b82f6', HSK3: '#f59e0b',
  HSK4: '#ef4444', HSK5: '#8b5cf6', HSK6: '#06b6d4',
  'HSK7-9': '#0f766e', Khác: '#6b7280',
};

const PAGE_SIZE = 12;

function GrammarSection({
  g, open, onToggle, sectionRef,
}: {
  g: HanziiGrammar;
  open: boolean;
  onToggle: () => void;
  sectionRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden', background: 'var(--card-bg)' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '18px 22px', background: open ? 'var(--primary-light)' : 'var(--card-bg)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, textAlign: 'left' }}>
        <div>
          <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 17, fontWeight: 700, color: open ? 'var(--primary)' : 'var(--ink)', marginBottom: 2 }}>{g.title}</div>
          <div style={{ fontSize: 12, color: open ? 'var(--primary)' : 'var(--ash)' }}>{g.titleVn}</div>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: open ? 'var(--primary)' : 'var(--ash-light)', flexShrink: 0, marginTop: 2 }}>{open ? '−' : '+'}</div>
      </button>

      {open && (
        <div style={{ padding: '0 22px 22px', borderTop: '1px solid var(--border)' }}>
          {g.formula && (
            <div style={{ margin: '18px 0 14px', padding: '12px 18px', background: 'var(--red-light)', border: '1px solid var(--red)', borderRadius: 6, fontFamily: 'Noto Serif SC, serif', fontSize: 16, color: 'var(--red)', fontWeight: 600 }}>
              {g.formula}
            </div>
          )}
          {g.useFor && g.useFor !== g.titleVn && (
            <p style={{ fontSize: 13.5, color: 'var(--gold)', margin: '0 0 12px' }}>{g.useFor}</p>
          )}
          {g.explanation && (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-soft)', marginBottom: 16, whiteSpace: 'pre-wrap' }}>{g.explanation}</p>
          )}

          {g.examples.length > 0 && (
            <div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 10 }}>Ví dụ</div>
              {g.examples.map((ex, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 15, color: 'var(--ink)', marginBottom: 3 }}>{ex.zh}</div>
                  {ex.note && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--primary)', marginBottom: 3 }}>{ex.note}</div>}
                  {ex.vn && <div style={{ fontSize: 12.5, color: 'var(--ash)', fontStyle: 'italic' }}>{ex.vn}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HanziiGrammarLevelPage() {
  const params = useParams();
  const level = decodeURIComponent(params.level as string);
  const [items, setItems] = useState<HanziiGrammar[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/grammar?level=${encodeURIComponent(level)}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false); setOpenIdx(0); setPage(1); });
  }, [level]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.titleVn.toLowerCase().includes(q) ||
        g.keywords.toLowerCase().includes(q) ||
        g.explanation.toLowerCase().includes(q) ||
        g.useFor.toLowerCase().includes(q)
      )
    : items;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const accent = LEVEL_COLOR[level] ?? '#6b7280';

  function goToSection(i: number) {
    setOpenIdx(i);
    setTimeout(() => {
      sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>← Về</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: accent, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0 }}>{level}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Ngữ pháp</div>
            {!loading && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                {filtered.length} điểm ngữ pháp
              </div>
            )}
          </div>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setOpenIdx(null); setPage(1); }}
              placeholder="Tìm ngữ pháp…"
              style={{ padding: '7px 12px 7px 30px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, color: '#fff', fontSize: 12, fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none', width: 170 }}
            />
          </div>
        </div>
      </header>

      {pageItems.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 64, zIndex: 40, overflowX: 'auto' }}>
          <div style={{ padding: '10px 24px', display: 'flex', gap: 8, maxWidth: 900, margin: '0 auto' }}>
            {pageItems.map((g, i) => (
              <button key={g.id} onClick={() => goToSection(i)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none',
                  background: openIdx === i ? 'var(--primary)' : '#f3f4f6',
                  color: openIdx === i ? '#fff' : '#374151',
                  fontSize: 12, fontWeight: openIdx === i ? 700 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'all 0.15s',
                }}>
                {g.titleVn || g.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ash)', fontSize: 14 }}>Đang tải…</div>
        )}

        {!loading && pageItems.map((g, i) => (
          <GrammarSection
            key={g.id} g={g}
            open={openIdx === i}
            onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            sectionRef={el => { sectionRefs.current[i] = el; }}
          />
        ))}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ash)' }}>
            <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 48, color: 'var(--border)', marginBottom: 12 }}>文</div>
            <p>{q ? `Không tìm thấy ngữ pháp nào khớp với "${search}"` : 'Chưa có dữ liệu ngữ pháp. Chạy scripts/crawl-hanzii-grammar.mjs để tải về.'}</p>
          </div>
        )}

        {!loading && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={p => { setPage(p); setOpenIdx(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            accent={accent}
            total={filtered.length}
            pageSize={PAGE_SIZE}
          />
        )}
      </main>
    </div>
  );
}
