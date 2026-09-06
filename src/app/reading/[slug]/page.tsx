'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import NoteModal from '@/app/components/NoteModal';

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

type VnResult = { zh: string; py: string; vn: string; pos: string; lessonTitle: string; level: string };

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};

const isPunct = (hanzi: string) =>
  !hanzi.trim() || /^[\s，。！？、：；""''「」【】（）…—\-·]+$/.test(hanzi);

function WordToken({
  word, showPinyin, onLookup, isOpen, onOpen, onAddNote,
}: {
  word: Word;
  showPinyin: boolean;
  onLookup: (hanzi: string, callback: (r: VnResult | null) => void) => void;
  isOpen: boolean;
  onOpen: () => void;
  onAddNote: (w: { zh: string; py: string; vn: string; pos: string }) => void;
}) {
  const [vnResult, setVnResult] = useState<VnResult | null | 'loading' | 'none'>('none');
  const ref = useRef<HTMLSpanElement>(null);

  if (isPunct(word.hanzi)) {
    return (
      <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, color: 'var(--ink-soft)', lineHeight: showPinyin ? 1.4 : 1.8 }}>
        {word.hanzi}
      </span>
    );
  }

  function handleClick() {
    onOpen();
    if (vnResult === 'none') {
      setVnResult('loading');
      onLookup(word.hanzi, r => setVnResult(r ?? null));
    }
  }

  const accent = word.hsk != null ? (LEVEL_COLOR[word.hsk] ?? 'var(--red)') : 'var(--red)';
  const showTooltip = isOpen;

  return (
    <span
      ref={ref}
      style={{
        position: 'relative', display: 'inline-flex', flexDirection: 'column',
        alignItems: 'center', cursor: 'pointer', margin: '0 1px',
        verticalAlign: 'bottom',
      }}
      onClick={handleClick}
    >
      {/* Tooltip */}
      {showTooltip && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30, pointerEvents: 'none',
          background: '#1e3a8a',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '10px 14px',
          fontSize: 12, lineHeight: 1.55, whiteSpace: 'nowrap',
          boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
          fontFamily: 'Be Vietnam Pro, sans-serif',
          display: 'flex', flexDirection: 'column', gap: 4,
          minWidth: 120,
        }}>
          {/* Pinyin */}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>
            {word.pinyin}
          </span>
          {/* Vietnamese from user's vocab */}
          {vnResult === 'loading' && (
            <span style={{ color: 'rgba(200,191,176,0.5)', fontSize: 11 }}>Đang tra…</span>
          )}
          {vnResult && vnResult !== 'loading' && vnResult !== 'none' && (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {vnResult.pos && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(200,191,176,0.45)' }}>{vnResult.pos}</span>
              )}
              <span style={{ color: '#f5f1e8', fontSize: 13, fontWeight: 600 }}>{vnResult.vn}</span>
              <span style={{ fontSize: 9, color: 'rgba(200,191,176,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>{vnResult.lessonTitle}</span>
            </span>
          )}
          {/* English definition from MB data */}
          {word.definition && (
            <span style={{ color: 'rgba(200,191,176,0.55)', fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4, marginTop: 2 }}>
              {word.definition}
            </span>
          )}
          {/* HSK badge */}
          {word.hsk != null && (
            <span style={{ marginTop: 2, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', background: accent, color: '#fff', padding: '1px 6px', borderRadius: 4, alignSelf: 'flex-start' }}>
              HSK {word.hsk}
            </span>
          )}
          {/* Add note button */}
          <button
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onAddNote({ zh: word.hanzi, py: word.pinyin, vn: (vnResult && vnResult !== 'loading' && vnResult !== 'none') ? vnResult.vn : '', pos: (vnResult && vnResult !== 'loading' && vnResult !== 'none') ? vnResult.pos : '' }); }}
            style={{ marginTop: 4, padding: '3px 8px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 11, pointerEvents: 'auto', alignSelf: 'flex-start' }}>
            📝 Ghi chú
          </button>
        </span>
      )}

      {/* Pinyin row */}
      {showPinyin && (
        <span style={{
          fontSize: 11, color: isOpen ? '#3b82f6' : 'var(--ash)',
          lineHeight: 1, marginBottom: 2,
          fontFamily: 'Be Vietnam Pro, sans-serif', whiteSpace: 'nowrap',
          transition: 'color 0.1s',
        }}>
          {word.pinyin}
        </span>
      )}

      {/* Hanzi */}
      <span style={{
        fontFamily: 'Noto Serif SC, serif', fontSize: 20,
        color: isOpen ? accent : 'var(--ink)',
        lineHeight: 1.4,
        fontWeight: word.hsk != null && word.hsk <= 2 ? 600 : 400,
        transition: 'color 0.15s',
        borderBottom: isOpen ? `2px solid ${accent}` : '2px solid transparent',
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
  const [activeWordKey, setActiveWordKey] = useState<string | null>(null);
  const [noteWord, setNoteWord] = useState<{ zh: string; py: string; vn: string; pos: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lookupCache = useRef<Record<string, VnResult | null>>({});

  useEffect(() => {
    fetch(`/api/reading/${slug}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => { setLesson(d.lesson); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  const handleLookup = useCallback((hanzi: string, cb: (r: VnResult | null) => void) => {
    if (hanzi in lookupCache.current) {
      cb(lookupCache.current[hanzi]);
      return;
    }
    fetch(`/api/search?q=${encodeURIComponent(hanzi)}`)
      .then(r => r.json())
      .then(d => {
        const results: VnResult[] = d.results ?? [];
        const match = results.find(r => r.zh === hanzi) ?? results[0] ?? null;
        lookupCache.current[hanzi] = match;
        cb(match);
      })
      .catch(() => { lookupCache.current[hanzi] = null; cb(null); });
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
      Đang tải…
    </div>
  );

  if (notFound || !lesson) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'transparent' }}>
      <div style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>Không tìm thấy bài đọc</div>
      <Link href="/reading" style={{ color: 'var(--red)', textDecoration: 'none', fontSize: 13 }}>← Quay lại danh sách</Link>
    </div>
  );

  const levelColor = LEVEL_COLOR[lesson.hsk_level] ?? 'var(--ash)';

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/reading" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            ← Đọc bài khoá
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>|</span>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, background: levelColor, color: 'white', fontSize: 9.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0 }}>
            HSK {lesson.hsk_level}
          </span>
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, color: '#f5f1e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {lesson.title_zh_simplified}
          </span>
          <Link href="/notes" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            📝 Ghi chú
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '36px 24px 80px' }}>
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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {lesson.categories.map(c => (
              <span key={c} style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--card-bg)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Audio player */}
        {lesson.audio_url && (
          <div style={{ marginBottom: 28, padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 18 }}>🎧</span>
            <audio ref={audioRef} controls src={lesson.audio_url} style={{ flex: 1, height: 36 }} />
          </div>
        )}

        {/* Pinyin toggle + hint row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--ash-light)', fontFamily: 'JetBrains Mono, monospace', fontStyle: 'italic' }}>
            Nhấn vào từ để tra nghĩa · click lại để đóng
          </span>
          <button
            onClick={() => setShowPinyin(p => !p)}
            style={{
              padding: '5px 14px', borderRadius: 20, flexShrink: 0,
              border: '1.5px solid var(--border)',
              background: showPinyin ? 'var(--primary)' : 'var(--card-bg)',
              color: showPinyin ? '#fff' : 'var(--ash)',
              fontSize: 11.5, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              fontWeight: showPinyin ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {showPinyin ? '拼 Ẩn pinyin' : '拼 Hiện pinyin'}
          </button>
        </div>

        {/* Content */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '28px 28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {lesson.content.map((para, pi) => (
              <p key={pi} style={{
                margin: 0,
                lineHeight: showPinyin ? 3 : 1.9,
                display: 'flex', flexWrap: 'wrap',
                alignItems: showPinyin ? 'flex-end' : 'baseline',
                gap: '0px 0px',
              }}>
                {para.map((word, wi) => {
                  const wKey = `${pi}-${wi}`;
                  return (
                    <WordToken
                      key={wi} word={word} showPinyin={showPinyin} onLookup={handleLookup}
                      isOpen={activeWordKey === wKey}
                      onOpen={() => setActiveWordKey(k => k === wKey ? null : wKey)}
                      onAddNote={w => { setNoteWord(w); setActiveWordKey(null); }}
                    />
                  );
                })}
              </p>
            ))}
          </div>
        </div>
      </main>

      {noteWord && <NoteModal word={noteWord} onClose={() => setNoteWord(null)} />}
    </div>
  );
}
