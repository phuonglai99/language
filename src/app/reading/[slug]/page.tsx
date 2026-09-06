'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Word = {
  hanzi: string; pinyin: string;
  hsk: number | null; definition: string | null;
};

type MBLesson = {
  slug: string; url: string;
  title_en: string; title_zh_simplified: string; title_zh_traditional: string;
  hsk_level: number; categories: string[];
  audio_url: string | null;
  content: Word[][];
  content_text: string;
};

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};

function WordToken({ word }: { word: Word }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const isPunct = !word.hanzi.trim() || /^[\s，。！？、：；""''「」【】（）…—\-·]+$/.test(word.hanzi);
  if (isPunct) {
    return <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, color: 'var(--ink-soft)', lineHeight: 1.8 }}>{word.hanzi}</span>;
  }

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', cursor: word.definition ? 'pointer' : 'default', margin: '0 2px', verticalAlign: 'bottom' }}
      onClick={() => word.definition && setShow(s => !s)}
      onMouseLeave={() => setShow(false)}
    >
      {/* Tooltip */}
      {show && word.definition && (
        <span style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 6, zIndex: 20, pointerEvents: 'none',
          background: 'var(--sidebar-bg)', color: '#f5f1e8',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '6px 10px',
          fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          fontFamily: 'Be Vietnam Pro, sans-serif',
        }}>
          {word.definition}
          {word.hsk != null && (
            <span style={{ marginLeft: 6, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', background: LEVEL_COLOR[word.hsk] ?? '#888', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
              HSK{word.hsk}
            </span>
          )}
        </span>
      )}
      {/* Pinyin */}
      <span style={{ fontSize: 11, color: 'var(--ash)', lineHeight: 1, marginBottom: 2, fontFamily: 'Be Vietnam Pro, sans-serif', whiteSpace: 'nowrap' }}>
        {word.pinyin}
      </span>
      {/* Hanzi */}
      <span style={{
        fontFamily: 'Noto Serif SC, serif', fontSize: 20, color: show ? LEVEL_COLOR[word.hsk ?? 1] ?? 'var(--red)' : 'var(--ink)',
        lineHeight: 1.4, fontWeight: word.hsk != null && word.hsk <= 2 ? 600 : 400,
        transition: 'color 0.15s',
      }}>
        {word.hanzi}
      </span>
    </span>
  );
}

export default function ReadingLessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const [lesson, setLesson] = useState<MBLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPinyin, setShowPinyin] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`/api/reading/${slug}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => { setLesson(d.lesson); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
      Đang tải…
    </div>
  );

  if (notFound || !lesson) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--paper)' }}>
      <div style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>Không tìm thấy bài đọc</div>
      <Link href="/reading" style={{ color: 'var(--red)', textDecoration: 'none', fontSize: 13 }}>← Quay lại danh sách</Link>
    </div>
  );

  const levelColor = LEVEL_COLOR[lesson.hsk_level] ?? 'var(--ash)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      {/* Header */}
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/reading" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            ← Đọc bài khoá
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: levelColor, color: 'white', fontSize: 9.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0 }}>
            HSK {lesson.hsk_level}
          </span>
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, color: '#f5f1e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {lesson.title_zh_simplified}
          </span>
          {/* Pinyin toggle */}
          <button
            onClick={() => setShowPinyin(p => !p)}
            style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: showPinyin ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: showPinyin ? '#f5f1e8' : 'rgba(200,191,176,0.5)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              transition: 'all 0.15s',
            }}
          >
            {showPinyin ? 'Ẩn pinyin' : 'Hiện pinyin'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '36px 24px 80px' }}>
        {/* Titles */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 28, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px', lineHeight: 1.3 }}>
            {lesson.title_zh_simplified}
          </h1>
          <div style={{ fontSize: 15, color: 'var(--ash)', margin: '0 0 10px' }}>{lesson.title_en}</div>
          {lesson.title_zh_traditional !== lesson.title_zh_simplified && (
            <div style={{ fontSize: 12, color: 'var(--ash-light)', fontFamily: 'Noto Serif SC, serif' }}>
              繁體：{lesson.title_zh_traditional}
            </div>
          )}
          {/* Categories */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {lesson.categories.map(c => (
              <span key={c} style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--paper-alt)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Audio player */}
        {lesson.audio_url && (
          <div style={{ marginBottom: 28, padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>🎧</span>
            <audio ref={audioRef} controls src={lesson.audio_url} style={{ flex: 1, height: 36 }} />
          </div>
        )}

        {/* Hint */}
        <div style={{ marginBottom: 20, fontSize: 11, color: 'var(--ash-light)', fontFamily: 'JetBrains Mono, monospace', fontStyle: 'italic' }}>
          Nhấn vào từ để xem nghĩa
        </div>

        {/* Content paragraphs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {lesson.content.map((para, pi) => (
            <p key={pi} style={{ margin: 0, lineHeight: showPinyin ? 2.8 : 1.9, display: 'flex', flexWrap: 'wrap', alignItems: showPinyin ? 'flex-end' : 'baseline', gap: '2px 0' }}>
              {para.map((word, wi) => (
                showPinyin
                  ? <WordToken key={wi} word={word} />
                  : (
                    <span
                      key={wi}
                      style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, color: 'var(--ink)', lineHeight: 1.6, cursor: word.definition ? 'pointer' : 'default' }}
                      title={word.definition ? `${word.pinyin}  ${word.definition}` : undefined}
                    >
                      {word.hanzi}
                    </span>
                  )
              ))}
            </p>
          ))}
        </div>
      </main>
    </div>
  );
}
