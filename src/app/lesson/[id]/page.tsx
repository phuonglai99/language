'use client';
import { shouldIgnorePageShortcut } from '@/lib/keyboard';
import HanziZoom from '@/app/components/HanziZoom';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Lesson, VocabCard, BotuBlock } from '@/types';
import QuizMode from './QuizMode';
import MatchGame from './MatchGame';
import PracticeMode from './PracticeMode';
import NoteModal from '@/app/components/NoteModal';
import { VocabListCard } from '@/app/components/VocabListCard';
import { Pagination } from '@/app/components/Pagination';
import WordStroke from '@/app/components/WordStroke';
import { speakChinese } from '@/lib/speech';
import { t } from '@/i18n';

  function shuffleArr<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

// ─── Botu renderer ────────────────────────────────────────────────────────────

function renderBotu(botu: BotuBlock[]) {
  return botu.map((b, bi) => (
    <div key={bi} style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)', fontSize: 10, marginRight: 6, marginBottom: 4 }}>
      <div style={{ padding: '3px 7px', background: 'var(--paper-alt)', fontFamily: 'Noto Serif SC, serif', fontSize: 15, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border)' }}><HanziZoom text={b.char} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {b.parts.map((p, pi) => (
          <div key={pi} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px',
            borderTop: pi > 0 ? '1px dashed var(--border)' : 'none',
            background: p.t === 'y' ? 'var(--gold-light)' : p.t === 'am' ? 'var(--blue-light)' : 'var(--paper-alt)',
            color: p.t === 'y' ? 'var(--gold)' : p.t === 'am' ? 'var(--blue)' : 'var(--ash)',
          }}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, fontWeight: 600 }}><HanziZoom text={p.ph} /></span>
            <span style={{ fontSize: 8.5, opacity: 0.7 }}>{p.t === 'y' ? t.lesson.botu.short.y : p.t === 'am' ? t.lesson.botu.short.am : t.lesson.botu.short.doc}</span>
            <span style={{ fontSize: 10 }}>{p.n}</span>
          </div>
        ))}
      </div>
    </div>
  ));
}

// ─── Mode tab button ──────────────────────────────────────────────────────────

type Mode = 'flash' | 'quiz' | 'match' | 'practice' | 'list';

const MODES: { key: Mode; icon: string; label: string }[] = [
  { key: 'list',  icon: '≡',  label: t.lesson.modes.list },
  { key: 'flash', icon: '卡', label: t.common.features.flashcard },
  { key: 'quiz',  icon: '测', label: t.common.features.quiz },
  { key: 'match', icon: '配', label: t.common.features.match },
  { key: 'practice', icon: '写', label: t.practice.tab },
];

function ModeTab({ m, active, onClick }: { m: typeof MODES[0]; active: boolean; onClick: () => void }) {
  const colors: Record<string, string> = { list: '#3a8a5c', flash: 'var(--red)', quiz: 'var(--blue)', match: 'var(--gold)', practice: '#7b5ca8' };
  const lightColors: Record<string, string> = { list: 'rgba(58,138,92,0.15)', flash: 'var(--red-light)', quiz: 'var(--blue-light)', match: 'var(--gold-light)', practice: 'rgba(123,92,168,0.15)' };
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 16px', borderRadius: 8,
      background: active ? colors[m.key] : 'rgba(255,255,255,0.06)',
      border: `1px solid ${active ? colors[m.key] : 'rgba(255,255,255,0.1)'}`,
      color: active ? 'white' : 'rgba(200,191,176,0.7)',
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = lightColors[m.key]; e.currentTarget.style.color = colors[m.key]; e.currentTarget.style.borderColor = colors[m.key]; } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(200,191,176,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; } }}
    >
      <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 15 }}>{m.icon}</span>
      {m.label}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [mode, setMode] = useState<Mode>(() => {
    const p = searchParams.get('mode');
    return (p === 'quiz' || p === 'match' || p === 'practice' || p === 'list') ? p : 'flash';
  });
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [queue, setQueue] = useState<VocabCard[]>([]);
  const [shuffled, setShuffled] = useState(false);
  const [noteWord, setNoteWord] = useState<VocabCard | null>(null);
  const [listPage, setListPage] = useState(1);
  const LIST_PAGE_SIZE = 20;

  useEffect(() => {
    const wordParam = searchParams.get('word');
    const modeParam = searchParams.get('mode');
    fetch(`/api/lessons/${id}`).then(r => r.json()).then(d => {
      const lesson: Lesson = d.lesson;
      setLesson(lesson);
      const vocab: VocabCard[] = lesson?.vocab || [];
      setQueue(vocab);
      // ?word= opens that word: its flashcard, or its page of the list with ?mode=list.
      // The mode is set here too, so a link followed from another mode on this page still shows it.
      const i = wordParam ? vocab.findIndex(v => v.zh === wordParam) : -1;
      if (i < 0) return;
      setShuffled(false);
      setFlipped(false);

      if (modeParam === 'list') {
        setMode('list');
        setListPage(Math.floor(i / LIST_PAGE_SIZE) + 1);
      } else {
        setMode('flash');
        setIdx(i);
      }
    });
  }, [id, searchParams]);

  const speak = useCallback((text: string) => { speakChinese(text); }, []);

  function switchMode(m: Mode) {
    setMode(m); setIdx(0); setFlipped(false);
    const url = new URL(window.location.href);
    if (m === 'flash') url.searchParams.delete('mode'); else url.searchParams.set('mode', m);
    url.searchParams.delete('word');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    if (m === 'flash' && lesson) setQueue(shuffled ? shuffleArr(lesson.vocab) : [...lesson.vocab]);
  }

  useEffect(() => {
    if (mode !== 'flash') return;
    const handler = (e: KeyboardEvent) => {
      if (shouldIgnorePageShortcut(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(f => !f);
        return;
      }
      if (e.key === 'ArrowRight') { setIdx(i => Math.min(i + 1, queue.length - 1)); setFlipped(false);  }
      if (e.key === 'ArrowLeft') { setIdx(i => Math.max(i - 1, 0)); setFlipped(false);  }
      if (e.key === 'p' || e.key === 'P') speak(queue[idx]?.zh || '');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, idx, queue, flipped, speak]);

  if (!lesson) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--ash)', gap: 10, fontSize: 14 }}>
      <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20 }}>汉</span> {t.common.loading}
    </div>
  );

  const card = queue[idx];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', paddingTop: 66 }}>

      {/* ── TOP NAVBAR ──────────────────────────────────────────────────────── */}
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '2px solid rgba(255,255,255,0.05)', position: 'fixed', top: 0, left: 'var(--sidebar-w, 272px)', right: 0, zIndex: 100 }}>
        <div style={{ padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>

          {/* Brand back link */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', flexShrink: 0, opacity: 0.85 }} title={t.common.features.home}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, fontWeight: 700, color: '#f5f1e8', lineHeight: 1 }}>汉</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(200,191,176,0.4)', textTransform: 'uppercase' }}>{t.common.back}</span>
          </Link>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

          {/* Lesson info */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f5f1e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lesson.title}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: 'rgba(200,191,176,0.55)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.lesson.page.meta(lesson.vocab.length, lesson.grammar.length, lesson.level)}
            </div>
          </div>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 1, overflowX: 'auto' }}>
            {MODES.map(m => <ModeTab key={m.key} m={m} active={mode === m.key} onClick={() => switchMode(m.key)} />)}
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

          {/* Grammar link */}
          <Link href={`/grammar/${id}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid transparent', color: 'var(--gold)', fontSize: 12.5, fontWeight: 500, textDecoration: 'none', flexShrink: 0, transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(160,114,10,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14 }}>文</span> {t.common.features.grammar}
          </Link>

          {/* Notes link */}
          <Link href="/notes" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid transparent', color: 'rgba(200,191,176,0.6)', fontSize: 12.5, fontWeight: 500, textDecoration: 'none', flexShrink: 0, transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#f5f1e8'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'rgba(200,191,176,0.6)'; }}>
            {t.common.notes}
          </Link>

          {/* Shuffle (flash only) */}
          {mode === 'flash' && (
            <button onClick={() => {
              const s = !shuffled; setShuffled(s);
              setQueue(s ? shuffleArr(lesson.vocab) : [...lesson.vocab]);
              setIdx(0); setFlipped(false);
            }} title={shuffled ? t.lesson.page.shuffleOff : t.lesson.page.shuffleOn} style={{
              width: 32, height: 32, borderRadius: 7,
              background: shuffled ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: `1px solid ${shuffled ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
              color: shuffled ? '#f5f1e8' : 'rgba(200,191,176,0.5)',
              cursor: 'pointer', fontSize: 15, flexShrink: 0, transition: 'all 0.15s',
            }}>🔀</button>
          )}
        </div>

        {/* Progress bar (flash only) */}
        {mode === 'flash' && (
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', background: 'var(--red)', width: `${((idx + 1) / queue.length) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        )}
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, transition: 'margin-right 0.25s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 24, minHeight: 'calc(100vh - 66px)' }}>

        {/* FLASHCARD MODE */}
        {mode === 'flash' && card && (
          <>
            <div onClick={() => setFlipped(f => !f)} style={{ perspective: 1200, width: 'min(520px, 100%)', aspectRatio: '4/3', cursor: 'pointer' }}>
              <div style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d', transition: 'transform 0.52s cubic-bezier(0.4,0,0.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none' }}>
                {/* FRONT */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <button onClick={e => { e.stopPropagation(); speak(card.zh); }} style={{ position: 'absolute', top: 14, left: 16, width: 34, height: 34, border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 15 }}>🔊</button>
                  <button onClick={e => { e.stopPropagation(); setNoteWord(card); }} title={t.lesson.flashcard.addToNotes} style={{ position: 'absolute', top: 14, left: 58, width: 34, height: 34, border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 14 }}>📝</button>
                  <div style={{ position: 'absolute', top: 16, right: 18, fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ash-light)' }}>{lesson.level}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash-light)' }}>{card.pos}</div>
                  <span style={{ fontSize: "clamp(52px, 11vw, 88px)", fontFamily: "Noto Serif SC, serif" }}><HanziZoom text={card.zh} pinyin={card.py} meaning={card.vn} sourceLessonId={id} /></span>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(13px, 2.5vw, 18px)', color: 'var(--red)', fontWeight: 500, letterSpacing: '0.05em' }}>{card.py}</div>
                  <WordStroke text={card.zh} cardId={`${idx}-${card.id}`} />
                  <div style={{ position: 'absolute', bottom: 18, fontSize: 11, color: 'var(--ash-light)', fontFamily: 'JetBrains Mono, monospace' }}>{t.lesson.flashcard.frontHint}</div>
                </div>
                {/* BACK */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--paper-alt)', padding: '24px 28px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 2 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 17, color: 'var(--red)', fontWeight: 500, letterSpacing: '0.04em' }}>{card.py}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)' }}>{card.pos}</div>
                  <span style={{ fontSize: 28, fontFamily: "Noto Serif SC, serif" }}><HanziZoom text={card.zh} pinyin={card.py} meaning={card.vn} sourceLessonId={id} /></span>
                  <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 10 }}>{card.vn}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{renderBotu(card.botu)}</div>
                  <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '10px 14px', marginTop: 'auto' }}>
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14.5, color: 'var(--ink)', marginBottom: 2 }}><HanziZoom text={card.ex.zh} /></div>
                    <div style={{ color: 'var(--ash)', fontStyle: 'italic', fontSize: 12.5 }}>{card.ex.vn}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 'min(520px,100%)' }}>
              <button onClick={() => { setIdx(i => Math.max(i - 1, 0)); setFlipped(false);  }}
                style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: 20, color: 'var(--ink-soft)' }}>‹</button>
              <button onClick={() => setFlipped(f => !f)}
                style={{ flex: 1, height: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t.lesson.flashcard.flip}</button>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--ash)', minWidth: 60, textAlign: 'center' }}>
                <strong>{idx + 1}</strong> / {queue.length}
              </div>
              <button onClick={() => { setIdx(i => Math.min(i + 1, queue.length - 1)); setFlipped(false);  }}
                style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: 20, color: 'var(--ink-soft)' }}>›</button>
            </div>

            {/* Keyboard hints */}
            <div style={{ display: 'flex', gap: 16, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash-light)' }}>
              {t.lesson.flashcard.keyHints.map(([k, v]) => (
                <span key={k}><kbd style={{ background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>{k}</kbd> {v}</span>
              ))}
            </div>
          </>
        )}

        {/* LIST MODE */}
        {mode === 'list' && (() => {
          const totalListPages = Math.max(1, Math.ceil(lesson.vocab.length / LIST_PAGE_SIZE));
          const curListPage = Math.min(listPage, totalListPages);
          const pageVocab = lesson.vocab.slice((curListPage - 1) * LIST_PAGE_SIZE, curListPage * LIST_PAGE_SIZE);
          return (
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px 80px', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pageVocab.map((v, i) => {
                  const absIdx = (curListPage - 1) * LIST_PAGE_SIZE + i;
                  return (
                    <VocabListCard
                      key={absIdx}
                      item={{ zh: v.zh, py: v.py, pos: v.pos, vn: v.vn, ex: v.ex }}
                      accent="var(--blue)"
                      num={absIdx + 1}
                      onClick={() => { setQueue([...lesson.vocab]); setIdx(absIdx); setFlipped(false);  setMode('flash'); }}
                      onSpeak={speak}
                      extra={
                        <button onClick={e => { e.stopPropagation(); setNoteWord(v); }}
                          title={t.common.saveToNotes}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--ash-light)', padding: '2px 4px', flexShrink: 0, transition: 'color 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ash-light)')}>📝</button>
                      }
                    />
                  );
                })}
              </div>
              <Pagination
                currentPage={curListPage}
                totalPages={totalListPages}
                onPageChange={p => setListPage(p)}
                accent="var(--blue)"
                total={lesson.vocab.length}
                pageSize={LIST_PAGE_SIZE}
              />
            </div>
          );
        })()}

        {/* QUIZ MODE */}
        {mode === 'quiz' && <QuizMode vocab={lesson.vocab} speak={speak} lessonId={id} />}

        {/* MATCH GAME */}
        {mode === 'match' && <MatchGame vocab={lesson.vocab} lessonId={id} />}

        {/* TYPING PRACTICE */}
        {mode === 'practice' && <PracticeMode key={id} lessonId={id} />}
      </div>

      {/* KANJI PANEL */}

      {/* NOTE MODAL */}
      {noteWord && (
        <NoteModal
          word={{ zh: noteWord.zh, py: noteWord.py, vn: noteWord.vn, pos: noteWord.pos, sourceLessonId: id }}
          onClose={() => setNoteWord(null)}
        />
      )}
    </div>
  );
}
