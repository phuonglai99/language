'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Lesson } from '@/types';

type LessonMeta = Omit<Lesson, 'vocab' | 'grammar'> & { vocabCount: number; grammarCount: number };

const LEVEL_COLOR: Record<string, string> = {
  HSK1: '#22c55e', HSK2: '#3b82f6', HSK3: '#f59e0b',
  HSK4: '#ef4444', HSK5: '#8b5cf6', HSK6: '#06b6d4',
};

const MODE_BUTTONS = [
  { href: (id: string) => `/lesson/${id}`,            icon: '卡', label: 'Flashcard', bg: '#3b82f6',   fg: '#fff' },
  { href: (id: string) => `/lesson/${id}?mode=quiz`,  icon: '测', label: 'Kiểm tra',  bg: '#e5484d',   fg: '#fff' },
  { href: (id: string) => `/lesson/${id}?mode=match`, icon: '配', label: 'Ghép thẻ', bg: '#d97706',   fg: '#fff' },
];

export default function Home() {
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchLessons(); }, []);

  async function fetchLessons() {
    const res = await fetch('/api/lessons');
    const data = await res.json();
    setLessons(data.lessons || []);
  }

  async function handleUpload(file: File) {
    setUploading(true); setError('');
    setProgress(file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'Đang đọc file Excel...' : 'Claude đang phân tích bài học...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload thất bại');
      setProgress('');
      fetchLessons();
    } catch (e) {
      setError((e as Error).message);
      setProgress('');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function deleteLesson(id: string) {
    if (!confirm('Xoá bài học này?')) return;
    await fetch(`/api/lessons/${id}`, { method: 'DELETE' });
    fetchLessons();
  }

  const totalVocab = lessons.reduce((s, l) => s + (l.vocabCount ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <img src="/icon.png" alt="ice-bear" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>ice-bear is learning</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>Học tiếng Trung</div>
            </div>
          </div>

          {/* Stats chips */}
          {lessons.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <span style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.09)', borderRadius: 20, fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'JetBrains Mono, monospace' }}>
                <strong style={{ color: '#fff' }}>{lessons.length}</strong> bài học
              </span>
              <span style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.09)', borderRadius: 20, fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'JetBrains Mono, monospace' }}>
                <strong style={{ color: '#fff' }}>{totalVocab}</strong> từ vựng
              </span>
            </div>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 20px', background: uploading ? 'rgba(74,114,160,0.6)' : '#3b82f6',
              color: 'white', borderRadius: 24, cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'background 0.15s', userSelect: 'none',
              boxShadow: '0 2px 8px rgba(74,114,160,0.4)',
            }}>
              {uploading ? `⏳ ${progress}` : '+ Import bài học'}
              <input ref={fileRef} type="file" accept=".docx,.xlsx,.xls" style={{ display: 'none' }}
                disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </label>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 80px' }}>
        {/* Error */}
        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 18px', marginBottom: 20, color: '#e5484d', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>⚠️</span> {error}
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#e5484d', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 20, color: '#92400e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{progress}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Có thể mất 30–60 giây cho file .docx</div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {lessons.length === 0 && !uploading && (
          <div style={{ textAlign: 'center', padding: '100px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 100, height: 100, borderRadius: 28, background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 52, color: '#9ca3af' }}>汉</span>
            </div>
            <div>
              <p style={{ color: '#1f2937', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Chưa có bài học nào</p>
              <p style={{ color: '#6b7280', fontSize: 13, margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
                Import file <strong>.docx</strong> hoặc <strong>.xlsx</strong> — Claude tự động trích xuất từ vựng &amp; ngữ pháp cho bạn.
              </p>
            </div>
            <label style={{ padding: '11px 28px', background: '#3b82f6', color: 'white', borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(74,114,160,0.35)' }}>
              + Tải lên bài học đầu tiên
              <input type="file" accept=".docx,.xlsx,.xls" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </label>
          </div>
        )}

        {/* Lesson grid */}
        {lessons.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {lessons.map(l => {
              const accent = LEVEL_COLOR[l.level] ?? '#6b7280';
              return (
                <LessonCard
                  key={l.id}
                  lesson={l}
                  accent={accent}
                  onDelete={() => deleteLesson(l.id)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function LessonCard({ lesson: l, accent, onDelete }: { lesson: LessonMeta; accent: string; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: hovered
          ? '0 8px 32px rgba(0,0,0,0.13)'
          : '0 2px 12px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Accent stripe */}
      <div style={{ height: 4, background: accent, flexShrink: 0 }} />

      {/* Card body */}
      <div style={{ padding: '16px 18px 12px', flex: 1 }}>
        {/* Level badge + date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20,
            background: accent + '18', color: accent,
            fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
          }}>
            {l.level || 'HSK'}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: '#9ca3af' }}>
            {new Date(l.createdAt).toLocaleDateString('vi-VN')}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.35 }}>{l.title}</div>
        {l.subtitle && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.subtitle}</div>}

        {/* Stats chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '3px 10px', background: '#f3f4f6', borderRadius: 20, fontSize: 11, color: '#374151', fontFamily: 'JetBrains Mono, monospace' }}>
            <strong>{l.vocabCount}</strong> từ vựng
          </span>
          <span style={{ padding: '3px 10px', background: '#f3f4f6', borderRadius: 20, fontSize: 11, color: '#374151', fontFamily: 'JetBrains Mono, monospace' }}>
            <strong>{l.grammarCount}</strong> ngữ pháp
          </span>
        </div>
      </div>

      {/* Mode buttons row */}
      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
        {MODE_BUTTONS.map(btn => (
          <Link
            key={btn.label}
            href={btn.href(l.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 4px', borderRadius: 10,
              background: btn.bg + '14', color: btn.bg,
              textDecoration: 'none', transition: 'background 0.15s',
              gap: 2,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = btn.bg; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = btn.bg + '14'; (e.currentTarget as HTMLElement).style.color = btn.bg; }}
          >
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{btn.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1 }}>{btn.label}</span>
          </Link>
        ))}
      </div>

      {/* Grammar + Delete */}
      <div style={{ padding: '0 12px 12px', display: 'flex', gap: 6 }}>
        <Link href={`/grammar/${l.id}`} style={{
          flex: 1, textAlign: 'center', padding: '7px 0',
          border: `1.5px solid ${accent}40`, color: accent,
          borderRadius: 10, fontSize: 11, fontWeight: 600, textDecoration: 'none',
          background: 'transparent', transition: 'background 0.15s, border-color 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = accent + '14'; (e.currentTarget as HTMLElement).style.borderColor = accent; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = accent + '40'; }}
        >
          文 Ngữ pháp
        </Link>
        <button onClick={onDelete} title="Xoá bài học" style={{
          width: 34, height: 34, border: '1.5px solid #e5e7eb',
          borderRadius: 10, background: 'transparent', color: '#9ca3af',
          cursor: 'pointer', fontSize: 15, flexShrink: 0, transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e5484d'; e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.background = '#fff0f0'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = 'transparent'; }}>
          ×
        </button>
      </div>
    </div>
  );
}
