'use client';
import WordTranslationPopup from '../WordTranslationPopup';
import HanziZoom from '@/app/components/HanziZoom';
import { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { ReadingBreadcrumb } from '../ReadingBreadcrumb';
import { t } from '@/i18n';

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

type NavItem = {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
};


const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};
type AlignmentStatus = 'Checked' | 'Uncheck';

function getAlignmentStatus(categories: string[]): AlignmentStatus | null {
  if (categories.includes('Uncheck')) return 'Uncheck';
  if (categories.includes('Checked')) return 'Checked';
  return null;
}

function isAlignmentStatus(cat: string) {
  return cat === 'Checked' || cat === 'Uncheck';
}

function AlignmentStatusBadge({ status }: { status: AlignmentStatus }) {
  const isChecked = status === 'Checked';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20,
      background: isChecked ? 'rgba(22,163,74,0.12)' : 'rgba(200,57,43,0.12)',
      border: `1px solid ${isChecked ? 'rgba(22,163,74,0.32)' : 'rgba(200,57,43,0.32)'}`,
      fontSize: 10, color: isChecked ? '#16a34a' : '#c8392b',
      fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
    }}>
      {t.common.alignmentStatus[status]}
    </span>
  );
}

const isPunct = (hanzi: string) =>
  !hanzi.trim() || /^[\s，。！？、：；""''「」【】（）…—\-·]+$/.test(hanzi);

function WordToken({ word, showPinyin, onOpen, isOpen }: { word: Word; showPinyin: boolean; onOpen: (anchor: HTMLElement) => void; isOpen: boolean }) {
  if (isPunct(word.hanzi)) return <span>{word.hanzi}</span>;
  return (
    <button type="button" className="reading-word-token" aria-haspopup="dialog" aria-expanded={isOpen} onClick={e => onOpen(e.currentTarget)}>
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', margin: '0 1px', verticalAlign: 'bottom' }}>
        {showPinyin && <span style={{ fontSize: 11, color: 'var(--ash)', lineHeight: 1, marginBottom: 2 }}>{word.pinyin}</span>}
        <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, color: 'var(--ink)', lineHeight: 1.4,
          fontWeight: word.hsk != null && word.hsk <= 2 ? 600 : 400 }}>{word.hanzi}</span>
      </span>
    </button>
  );
}

export default function LessonReader({
  lesson, prev, next, position,
}: {
  lesson: MBLesson;
  prev: NavItem | null;
  next: NavItem | null;
  position: { index: number; total: number };
}) {
  const [activeWord, setActiveWord] = useState<{ key: string; word: Word; anchor: HTMLElement } | null>(null);
  const [showPinyin, setShowPinyin] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const levelColor = LEVEL_COLOR[lesson.hsk_level] ?? 'var(--ash)';
  const alignmentStatus = getAlignmentStatus(lesson.categories);
  const displayCategories = lesson.categories.filter(cat => !isAlignmentStatus(cat));
  const topic = displayCategories[0] ?? null;
  const crumbItems = [
    { href: '/reading', label: t.common.features.reading },
    { href: `/reading?hsk=${lesson.hsk_level}`, label: `HSK ${lesson.hsk_level}` },
    ...(topic ? [{ href: `/reading?hsk=${lesson.hsk_level}&q=${encodeURIComponent(topic)}`, label: topic }] : []),
    { label: lesson.title_zh_simplified || lesson.title_en },
  ];
  // Memoised: without this it re-walks every word in the lesson on each click.
  const vocabCount = useMemo(
    () => lesson.content.flat().filter(w => !isPunct(w.hanzi)).reduce((set, w) => { set.add(w.hanzi.trim()); return set; }, new Set<string>()).size,
    [lesson.content],
  );

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* Header */}
      <header style={{ background: '#1e3a8a', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/reading" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            {t.reading.lesson.backToReading}
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>|</span>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, background: levelColor, color: 'white', fontSize: 9.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0 }}>
            HSK {lesson.hsk_level}
          </span>
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, color: '#f5f1e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            <HanziZoom text={lesson.title_zh_simplified} />
          </span>
          <div className="reading-header-pager">
            {prev
              ? <Link href={`/reading/${prev.slug}`} className="reading-header-pager-btn" title={t.reading.lesson.prevTitle(prev.title_zh_simplified || prev.title_en)} aria-label={t.reading.lesson.prevAria}>‹</Link>
              : <span className="reading-header-pager-btn is-disabled" aria-disabled="true">‹</span>}
            <span className="reading-header-pager-pos">{`${position.index}/${position.total}`}</span>
            {next
              ? <Link href={`/reading/${next.slug}`} className="reading-header-pager-btn" title={t.reading.lesson.nextTitle(next.title_zh_simplified || next.title_en)} aria-label={t.reading.lesson.nextAria}>›</Link>
              : <span className="reading-header-pager-btn is-disabled" aria-disabled="true">›</span>}
          </div>
          <Link href="/notes" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            {t.common.notes}
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px 80px' }}>
        <ReadingBreadcrumb items={crumbItems} />

        {/* Titles */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 28, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px', lineHeight: 1.3 }}>
            <HanziZoom text={lesson.title_zh_simplified} />
          </h1>
          <div style={{ fontSize: 15, color: 'var(--ash)', margin: '0 0 10px' }}>{lesson.title_en}</div>
          {lesson.title_zh_traditional !== lesson.title_zh_simplified && (
            <div style={{ fontSize: 12, color: 'var(--ash-light)', fontFamily: 'Noto Serif SC, serif' }}>
              <HanziZoom text={lesson.title_zh_traditional}>{t.reading.lesson.traditional(lesson.title_zh_traditional)}</HanziZoom>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            {alignmentStatus && <AlignmentStatusBadge status={alignmentStatus} />}
            {displayCategories.map(c => (
              <span key={c} style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--card-bg)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>
                {c}
              </span>
            ))}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash)', marginLeft: 4 }}>
              {t.reading.lesson.vocabCount(vocabCount)}
            </span>
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
            {t.reading.lesson.tapHint}
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
            {showPinyin ? t.reading.lesson.hidePinyin : t.reading.lesson.showPinyin}
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
                {para.map((word, wi) => <WordToken key={wi} word={word} showPinyin={showPinyin} isOpen={activeWord?.key === `${pi}-${wi}`} onOpen={anchor => setActiveWord(current => current?.key === `${pi}-${wi}` ? null : { key: `${pi}-${wi}`, word, anchor })} />)}
              </p>
            ))}
          </div>
        </div>

        <nav className="reading-nav" aria-label={t.reading.lesson.navAria}>
          {prev ? (
            <Link href={`/reading/${prev.slug}`} className="reading-nav-btn">
              <span className="reading-nav-dir">{t.reading.lesson.prev}</span>
              <span className="reading-nav-title">{prev.title_zh_simplified || prev.title_en}</span>
              {prev.title_zh_simplified && <span className="reading-nav-en">{prev.title_en}</span>}
            </Link>
          ) : (
            <div className="reading-nav-btn is-disabled">
              <span className="reading-nav-dir">{t.reading.lesson.prev}</span>
              <span className="reading-nav-title">{t.reading.lesson.firstOfLevel(lesson.hsk_level)}</span>
            </div>
          )}
          {next ? (
            <Link href={`/reading/${next.slug}`} className="reading-nav-btn reading-nav-next">
              <span className="reading-nav-dir">{t.reading.lesson.next}</span>
              <span className="reading-nav-title">{next.title_zh_simplified || next.title_en}</span>
              {next.title_zh_simplified && <span className="reading-nav-en">{next.title_en}</span>}
            </Link>
          ) : (
            <div className="reading-nav-btn reading-nav-next is-disabled">
              <span className="reading-nav-dir">{t.reading.lesson.next}</span>
              <span className="reading-nav-title">{t.reading.lesson.lastOfLevel(lesson.hsk_level)}</span>
            </div>
          )}
        </nav>
      </main>
      {activeWord && <WordTranslationPopup key={activeWord.key} word={activeWord.word} anchor={activeWord.anchor} onClose={() => setActiveWord(null)} />}

    </div>
  );
}
