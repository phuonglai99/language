'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Lesson, VocabCard, BotuBlock, BotuPart } from '@/types';
import QuizMode from './QuizMode';
import MatchGame from './MatchGame';
import NoteModal from '@/app/components/NoteModal';
import { VocabListCard } from '@/app/components/VocabListCard';
import { Pagination } from '@/app/components/Pagination';

// ─── Botu renderer ────────────────────────────────────────────────────────────

function renderBotu(botu: BotuBlock[]) {
  return botu.map((b, bi) => (
    <div key={bi} style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)', fontSize: 10, marginRight: 6, marginBottom: 4 }}>
      <div style={{ padding: '3px 7px', background: 'var(--paper-alt)', fontFamily: 'Noto Serif SC, serif', fontSize: 15, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border)' }}>{b.char}</div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {b.parts.map((p, pi) => (
          <div key={pi} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px',
            borderTop: pi > 0 ? '1px dashed var(--border)' : 'none',
            background: p.t === 'y' ? 'var(--gold-light)' : p.t === 'am' ? 'var(--blue-light)' : 'var(--paper-alt)',
            color: p.t === 'y' ? 'var(--gold)' : p.t === 'am' ? 'var(--blue)' : 'var(--ash)',
          }}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, fontWeight: 600 }}>{p.ph}</span>
            <span style={{ fontSize: 8.5, opacity: 0.7 }}>{p.t === 'y' ? 'ý·' : p.t === 'am' ? 'âm·' : 'độc·'}</span>
            <span style={{ fontSize: 10 }}>{p.n}</span>
          </div>
        ))}
      </div>
    </div>
  ));
}

// ─── Clickable hanzi ──────────────────────────────────────────────────────────

function ClickableHanzi({ text, fontSize, onChar }: { text: string; fontSize: string | number; onChar: (c: string) => void }) {
  const isCJK = (c: string) => { const code = c.charCodeAt(0); return code >= 0x4E00 && code <= 0x9FFF; };
  return (
    <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
      {[...text].map((c, i) =>
        isCJK(c) ? (
          <span key={i} onClick={e => { e.stopPropagation(); onChar(c); }} title="Tra kanji"
            style={{ cursor: 'pointer', transition: 'opacity 0.1s, color 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.65'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ink)'; }}>{c}</span>
        ) : <span key={i}>{c}</span>
      )}
    </span>
  );
}

// ─── Stroke animation ─────────────────────────────────────────────────────────

declare global { interface Window { HanziWriter: HanziWriterStatic } }
interface HanziWriterStatic {
  create(el: HTMLElement, char: string, opts: Record<string, unknown>): { animateCharacter(): void };
}

let _hwPromise: Promise<HanziWriterStatic> | null = null;
function loadHW(): Promise<HanziWriterStatic> {
  if (_hwPromise) return _hwPromise;
  _hwPromise = new Promise(resolve => {
    if (window.HanziWriter) return resolve(window.HanziWriter);
    const existing = document.getElementById('hanzi-writer-js');
    if (existing) { existing.addEventListener('load', () => resolve(window.HanziWriter)); return; }
    const s = document.createElement('script');
    s.id = 'hanzi-writer-js';
    s.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js';
    s.onload = () => resolve(window.HanziWriter);
    document.head.appendChild(s);
  });
  return _hwPromise;
}

function CharStroke({ char, size = 72 }: { char: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const writerRef = useRef<{ animateCharacter(): void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    writerRef.current = null;
    (async () => {
      let charData: unknown = null;
      try {
        const res = await fetch(`/api/kanji/${encodeURIComponent(char)}`);
        if (res.ok) { const json = await res.json(); if (json.strokesSvg) charData = json.strokesSvg; }
      } catch { /* ignore */ }
      if (cancelled || !ref.current) return;
      const HW = await loadHW();
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = '';
      const opts: Record<string, unknown> = {
        width: size, height: size, padding: 6,
        strokeColor: '#333333', outlineColor: 'rgba(0,0,0,0.12)', drawingColor: '#e01a3c',
        delayBetweenStrokes: 200, strokeAnimationSpeed: 1.1, showOutline: true,
        onLoadCharDataError: () => { /* ignore */ },
      };
      if (charData) opts.charDataLoader = (_c: string, onLoad: (d: unknown) => void) => onLoad(charData);
      try { writerRef.current = HW.create(ref.current, char, opts); writerRef.current!.animateCharacter(); } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [char, size]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div ref={ref} style={{ width: size, height: size }} />
      <button
        onClick={e => { e.stopPropagation(); writerRef.current?.animateCharacter(); }}
        title="Phát lại nét viết"
        style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 18, height: 18, borderRadius: '50%',
          background: 'rgba(0,0,0,0.08)', border: 'none',
          cursor: 'pointer', fontSize: 10, color: '#555',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: 0,
        }}>↺</button>
    </div>
  );
}

function WordStroke({ text, cardId }: { text: string; cardId: string }) {
  const chars = [...text].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
  if (chars.length === 0) return null;
  const size = chars.length > 3 ? 56 : chars.length > 2 ? 64 : 72;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {chars.map((c, i) => <CharStroke key={`${cardId}-${i}-${c}`} char={c} size={size} />)}
    </div>
  );
}

// ─── Kanji panel ──────────────────────────────────────────────────────────────

interface KanjiData {
  char: string; cnVi: string | null; pinyin: string | null; strokes: number | null;
  radical: string | null; lucthu: string | null; hinhthai: string | null; netbut: string | null;
  popular: number | null; pos: string | null;
  meansTdpt: string[]; meansTg: string[]; meansTdtd: string[];
  strokesSvg: string | null; botu: BotuPart[] | null;
}

function KanjiPanel({ char, onClose }: { char: string; onClose: () => void }) {
  const [data, setData] = useState<KanjiData | null>(null);
  const [loading, setLoading] = useState(true);
  const writerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true); setData(null);
    fetch(`/api/kanji/${encodeURIComponent(char)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [char]);

  useEffect(() => {
    if (!data?.char || !writerRef.current) return;
    const existing = document.getElementById('hanzi-writer-script');
    function initWriter() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const HW = (window as any).HanziWriter;
      if (!HW || !writerRef.current) return;
      writerRef.current.innerHTML = '';
      HW.create(writerRef.current, data!.char, {
        width: 120, height: 120, padding: 10,
        strokeColor: '#333', outlineColor: '#ddd', drawingColor: '#e01a3c',
        showOutline: true, delayBetweenStrokes: 200, strokeAnimationSpeed: 1,
      }).animateCharacter();
    }
    if (existing) { initWriter(); return; }
    const script = document.createElement('script');
    script.id = 'hanzi-writer-script';
    script.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js';
    script.onload = initWriter;
    document.head.appendChild(script);
  }, [data]);

  const popularLabel = (n: number | null) => {
    if (!n) return null;
    if (n >= 80) return { label: 'Rất cao', color: 'var(--red)' };
    if (n >= 60) return { label: 'Cao', color: 'var(--gold)' };
    if (n >= 40) return { label: 'Trung bình', color: 'var(--ash)' };
    return { label: 'Thấp', color: 'var(--ash-light)' };
  };

  const POS_NAMES: Record<string, string> = {
    'Đại': 'Đại từ', 'Đt': 'Động từ', 'Dt': 'Danh từ', 'Tt': 'Tính từ',
    'Tr': 'Trạng từ', 'P': 'Phó từ', 'C': 'Giới từ', 'K': 'Kết từ', 'T': 'Thán từ',
  };

  const tdtdRest = (tdtd: string[]): string => {
    if (!tdtd.length) return '';
    return tdtd[0].replace(/^\([^)]+\)\s*/, '');
  };

  return (
    <div style={{ position: 'fixed', top: 66, right: 0, bottom: 0, width: 320, background: 'var(--paper-alt)', borderLeft: '1px solid var(--border)', zIndex: 99, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--paper-alt)', zIndex: 1 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ash-light)' }}>Hán tự</div>
        <button onClick={onClose} style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: '50%', background: 'transparent', cursor: 'pointer', fontSize: 15, color: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>
      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ash-light)', fontSize: 13 }}>Đang tải...</div>}
      {!loading && !data && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 64, color: 'var(--ink)' }}>{char}</div>
          <div style={{ fontSize: 12, color: 'var(--ash-light)' }}>Chưa có dữ liệu cho chữ này</div>
        </div>
      )}
      {!loading && data && (
        <div style={{ padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 72, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{data.char}</div>
            <div ref={writerRef} style={{ width: 120, height: 120 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.pinyin && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: 'var(--red)', fontWeight: 600 }}>{data.pinyin}</div>}
            {data.cnVi && <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{data.cnVi.replace(/\./g, ' · ')}</div>}
            {data.pos && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <span style={{ fontSize: 10, background: 'var(--blue-light, #e8f0fe)', color: 'var(--blue, #1a56db)', border: '1px solid var(--blue, #1a56db)', borderRadius: 3, padding: '1px 6px', fontWeight: 700, letterSpacing: '0.05em' }}>{data.pos}</span>
                {POS_NAMES[data.pos] && <span style={{ fontSize: 11, color: 'var(--ash)', fontStyle: 'italic' }}>{POS_NAMES[data.pos]}</span>}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['Bộ thủ', data.radical], ['Số nét', data.strokes ? `${data.strokes} nét` : null], ['Lục thư', data.lucthu], ['Hình thái', data.hinhthai], ['Nét bút', data.netbut], ['Phổ biến', (() => { const p = popularLabel(data.popular); return p ? p.label : null; })()]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} style={{ background: 'var(--card-bg)', borderRadius: 5, padding: '8px 10px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{v}</div>
              </div>
            ))}
          </div>
          {data.botu && data.botu.length > 0 && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ash-light)', marginBottom: 8 }}>Phân tích bộ thủ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.botu.map((part, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 16, fontWeight: 700, color: part.t === 'y' ? 'var(--red)' : part.t === 'am' ? 'var(--gold)' : 'var(--ink)', minWidth: 24 }}>{part.ph}</span>
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ash-light)', minWidth: 28 }}>{part.t === 'y' ? 'ý' : part.t === 'am' ? 'âm' : 'độc'}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{part.n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.meansTdpt.length > 0 && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ash-light)', marginBottom: 8 }}>Nghĩa</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.meansTdpt.map((m, i) => <li key={i} style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m}</li>)}
              </ol>
            </div>
          )}
          {data.meansTdtd.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ash)', fontStyle: 'italic', borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
              {tdtdRest(data.meansTdtd)}
            </div>
          )}
          {data.meansTg.length > 0 && (
            <div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ash-light)', marginBottom: 8 }}>Từ ghép</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.meansTg.slice(0, 8).map((tg, i) => (
                  <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 9px', fontSize: 12, color: 'var(--ink-soft)' }}>{tg}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mode tab button ──────────────────────────────────────────────────────────

type Mode = 'flash' | 'quiz' | 'match' | 'list';

const MODES: { key: Mode; icon: string; label: string }[] = [
  { key: 'list',  icon: '≡',  label: 'Danh sách' },
  { key: 'flash', icon: '卡', label: 'Flashcard' },
  { key: 'quiz',  icon: '测', label: 'Kiểm tra' },
  { key: 'match', icon: '配', label: 'Ghép thẻ' },
];

function ModeTab({ m, active, onClick }: { m: typeof MODES[0]; active: boolean; onClick: () => void }) {
  const colors: Record<string, string> = { list: '#3a8a5c', flash: 'var(--red)', quiz: 'var(--blue)', match: 'var(--gold)' };
  const lightColors: Record<string, string> = { list: 'rgba(58,138,92,0.15)', flash: 'var(--red-light)', quiz: 'var(--blue-light)', match: 'var(--gold-light)' };
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
    return (p === 'quiz' || p === 'match' || p === 'list') ? p : 'flash';
  });
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [queue, setQueue] = useState<VocabCard[]>([]);
  const [shuffled, setShuffled] = useState(false);
  const [kanjiChar, setKanjiChar] = useState<string | null>(null);
  const [noteWord, setNoteWord] = useState<VocabCard | null>(null);
  const [listPage, setListPage] = useState(1);
  const LIST_PAGE_SIZE = 20;

  useEffect(() => {
    const wordParam = searchParams.get('word');
    fetch(`/api/lessons/${id}`).then(r => r.json()).then(d => {
      const lesson: Lesson = d.lesson;
      setLesson(lesson);
      const vocab: VocabCard[] = lesson?.vocab || [];
      setQueue(vocab);
      if (wordParam) {
        const i = vocab.findIndex(v => v.zh === wordParam);
        if (i >= 0) setIdx(i);
      }
    });
  }, [id, searchParams]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-CN'; utt.rate = 0.85;
    const voices = speechSynthesis.getVoices();
    const zh = voices.find(v => v.lang === 'zh-CN') || voices.find(v => v.lang.startsWith('zh'));
    if (zh) utt.voice = zh;
    speechSynthesis.speak(utt);
  }, []);

  function shuffleArr<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function switchMode(m: Mode) {
    setMode(m); setIdx(0); setFlipped(false); setKanjiChar(null);
    if (m === 'flash' && lesson) setQueue(shuffled ? shuffleArr(lesson.vocab) : [...lesson.vocab]);
  }

  useEffect(() => {
    if (mode !== 'flash') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setKanjiChar(null); return; }
      const active = document.activeElement;
      const isInteractive = active && active !== document.body && (active.tagName === 'BUTTON' || active.tagName === 'INPUT' || active.tagName === 'A');
      if (e.key === ' ' || e.key === 'Enter') {
        if (isInteractive) { (active as HTMLElement).blur(); }
        e.preventDefault();
        setFlipped(f => !f);
        return;
      }
      if (isInteractive) return;
      if (e.key === 'ArrowRight') { setIdx(i => Math.min(i + 1, queue.length - 1)); setFlipped(false); setKanjiChar(null); }
      if (e.key === 'ArrowLeft') { setIdx(i => Math.max(i - 1, 0)); setFlipped(false); setKanjiChar(null); }
      if (e.key === 'p' || e.key === 'P') speak(queue[idx]?.zh || '');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, idx, queue, flipped, speak, kanjiChar]);

  if (!lesson) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--ash)', gap: 10, fontSize: 14 }}>
      <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20 }}>汉</span> Đang tải...
    </div>
  );

  const card = queue[idx];
  const panelWidth = kanjiChar ? 320 : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', paddingTop: 66 }}>

      {/* ── TOP NAVBAR ──────────────────────────────────────────────────────── */}
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '2px solid rgba(255,255,255,0.05)', position: 'fixed', top: 0, left: 'var(--sidebar-w, 272px)', right: 0, zIndex: 100 }}>
        <div style={{ padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>

          {/* Brand back link */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', flexShrink: 0, opacity: 0.85 }} title="Trang chủ">
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 20, fontWeight: 700, color: '#f5f1e8', lineHeight: 1 }}>汉</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(200,191,176,0.4)', textTransform: 'uppercase' }}>← Về</span>
          </Link>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

          {/* Lesson info */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#f5f1e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lesson.title}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: 'rgba(200,191,176,0.55)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lesson.vocab.length} từ · {lesson.grammar.length} ngữ pháp · {lesson.level}
            </div>
          </div>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {MODES.map(m => <ModeTab key={m.key} m={m} active={mode === m.key} onClick={() => switchMode(m.key)} />)}
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

          {/* Grammar link */}
          <Link href={`/grammar/${id}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid transparent', color: 'var(--gold)', fontSize: 12.5, fontWeight: 500, textDecoration: 'none', flexShrink: 0, transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(160,114,10,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14 }}>文</span> Ngữ pháp
          </Link>

          {/* Notes link */}
          <Link href="/notes" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid transparent', color: 'rgba(200,191,176,0.6)', fontSize: 12.5, fontWeight: 500, textDecoration: 'none', flexShrink: 0, transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#f5f1e8'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'rgba(200,191,176,0.6)'; }}>
            📝 Ghi chú
          </Link>

          {/* Shuffle (flash only) */}
          {mode === 'flash' && (
            <button onClick={() => {
              const s = !shuffled; setShuffled(s);
              setQueue(s ? shuffleArr(lesson.vocab) : [...lesson.vocab]);
              setIdx(0); setFlipped(false);
            }} title={shuffled ? 'Bỏ xáo trộn' : 'Xáo trộn thẻ'} style={{
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
      <div style={{ flex: 1, marginRight: panelWidth, transition: 'margin-right 0.25s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 24, minHeight: 'calc(100vh - 66px)' }}>

        {/* FLASHCARD MODE */}
        {mode === 'flash' && card && (
          <>
            <div onClick={() => setFlipped(f => !f)} style={{ perspective: 1200, width: 'min(520px, 100%)', aspectRatio: '4/3', cursor: 'pointer' }}>
              <div style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d', transition: 'transform 0.52s cubic-bezier(0.4,0,0.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none' }}>
                {/* FRONT */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <button onClick={e => { e.stopPropagation(); speak(card.zh); }} style={{ position: 'absolute', top: 14, left: 16, width: 34, height: 34, border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 15 }}>🔊</button>
                  <button onClick={e => { e.stopPropagation(); setNoteWord(card); }} title="Thêm vào ghi chú" style={{ position: 'absolute', top: 14, left: 58, width: 34, height: 34, border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 14 }}>📝</button>
                  <div style={{ position: 'absolute', top: 16, right: 18, fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ash-light)' }}>{lesson.level}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash-light)' }}>{card.pos}</div>
                  <ClickableHanzi text={card.zh} fontSize="clamp(52px, 11vw, 88px)" onChar={setKanjiChar} />
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(13px, 2.5vw, 18px)', color: 'var(--red)', fontWeight: 500, letterSpacing: '0.05em' }}>{card.py}</div>
                  <WordStroke text={card.zh} cardId={`${idx}-${card.id}`} />
                  <div style={{ position: 'absolute', bottom: 18, fontSize: 11, color: 'var(--ash-light)', fontFamily: 'JetBrains Mono, monospace' }}>click hoặc Space để lật · click chữ để tra</div>
                </div>
                {/* BACK */}
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--paper-alt)', padding: '24px 28px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 2 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 17, color: 'var(--red)', fontWeight: 500, letterSpacing: '0.04em' }}>{card.py}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)' }}>{card.pos}</div>
                  <ClickableHanzi text={card.zh} fontSize={28} onChar={setKanjiChar} />
                  <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 10 }}>{card.vn}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{renderBotu(card.botu)}</div>
                  <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '10px 14px', marginTop: 'auto' }}>
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14.5, color: 'var(--ink)', marginBottom: 2 }}>{card.ex.zh}</div>
                    <div style={{ color: 'var(--ash)', fontStyle: 'italic', fontSize: 12.5 }}>{card.ex.vn}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 'min(520px,100%)' }}>
              <button onClick={() => { setIdx(i => Math.max(i - 1, 0)); setFlipped(false); setKanjiChar(null); }}
                style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: 20, color: 'var(--ink-soft)' }}>‹</button>
              <button onClick={() => setFlipped(f => !f)}
                style={{ flex: 1, height: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Lật thẻ</button>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--ash)', minWidth: 60, textAlign: 'center' }}>
                <strong>{idx + 1}</strong> / {queue.length}
              </div>
              <button onClick={() => { setIdx(i => Math.min(i + 1, queue.length - 1)); setFlipped(false); setKanjiChar(null); }}
                style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: 20, color: 'var(--ink-soft)' }}>›</button>
            </div>

            {/* Keyboard hints */}
            <div style={{ display: 'flex', gap: 16, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash-light)' }}>
              {[['Space', 'lật'], ['← →', 'điều hướng'], ['P', 'phát âm'], ['Esc', 'đóng tra chữ']].map(([k, v]) => (
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
                      onClick={() => { setQueue([...lesson.vocab]); setIdx(absIdx); setFlipped(false); setKanjiChar(null); setMode('flash'); }}
                      onSpeak={speak}
                      extra={
                        <button onClick={e => { e.stopPropagation(); setNoteWord(v); }}
                          title="Lưu vào ghi chú"
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
      </div>

      {/* KANJI PANEL */}
      {kanjiChar && <KanjiPanel char={kanjiChar} onClose={() => setKanjiChar(null)} />}

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
