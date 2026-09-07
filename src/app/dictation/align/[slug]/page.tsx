'use client';
import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { locateSentenceSpans } from '@/lib/dictation';

type AlignSentence = {
  key: string;
  index: number;
  hanzi: string;
  pinyin: string;
  start: number | null;
  end: number | null;
  textStart: number | null;
  textEnd: number | null;
};

type RawWord = { hanzi: string; pinyin: string };

type LessonMeta = {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
  hsk_level: number;
  audio_url: string | null;
  content_text: string;
  content: RawWord[][];
};

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};

const SPAN_COLORS = [
  'rgba(58,138,92,0.28)',
  'rgba(74,114,160,0.28)',
  'rgba(160,114,10,0.28)',
  'rgba(200,57,43,0.28)',
  'rgba(122,61,176,0.28)',
  'rgba(14,116,144,0.28)',
  'rgba(180,83,9,0.28)',
  'rgba(190,24,93,0.28)',
];

function formatTime(t: number | null): string {
  if (t == null || !Number.isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function parseTime(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes(':')) {
    const [a, b] = v.split(':');
    const m = Number(a);
    const s = Number(b);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return Math.round((m * 60 + s) * 1000) / 1000;
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

function flattenRawHanzi(content: RawWord[][]): string {
  return content.map(para => para.map(w => w.hanzi).join('')).join('');
}

function wordsCoveringRange(content: RawWord[][], start: number, end: number): RawWord[] {
  const out: RawWord[] = [];
  let pos = 0;
  for (const para of content) {
    for (const w of para) {
      const len = (w.hanzi ?? '').length;
      const wStart = pos;
      const wEnd = pos + len;
      if (wEnd > start && wStart < end) out.push(w);
      pos = wEnd;
    }
  }
  return out;
}

function selectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  if (!container.contains(sel.anchorNode) && !container.contains(sel.focusNode)) return null;

  const nodes = Array.from(container.querySelectorAll('[data-hz]'));
  let start: number | null = null;
  let end: number | null = null;
  for (const node of nodes) {
    const el = node as HTMLElement;
    const off = Number(el.dataset.start);
    const len = Number(el.dataset.len);
    if (!Number.isFinite(off) || !Number.isFinite(len)) continue;
    if (!sel.containsNode(el, true)) continue;
    if (start == null) start = off;
    end = off + len;
  }
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

export default function AlignEditorPage() {
  const { slug } = useParams<{ slug: string }>();
  const [lesson, setLesson] = useState<LessonMeta | null>(null);
  const [sentences, setSentences] = useState<AlignSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [clipPlaying, setClipPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const rawRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stopHandlerRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number>(0);

  const rawText = useMemo(
    () => lesson?.content?.length ? flattenRawHanzi(lesson.content) : (lesson?.content_text ?? ''),
    [lesson],
  );

  useEffect(() => {
    fetch(`/api/dictation/align/${slug}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => {
        const raw: string = (d.lesson.content?.length
          ? flattenRawHanzi(d.lesson.content)
          : (d.lesson.content_text ?? ''));
        const spans = locateSentenceSpans(raw, d.sentences);
        setLesson(d.lesson);
        setSentences((d.sentences as Omit<AlignSentence, 'key' | 'textStart' | 'textEnd'>[]).map((s, i) => ({
          ...s,
          key: `${s.index}-${i}`,
          textStart: spans[i]?.start ?? null,
          textEnd: spans[i]?.end ?? null,
        })));
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => { setIsPlaying(false); setClipPlaying(false); };
    const onEnded = () => { setIsPlaying(false); setClipPlaying(false); };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.playbackRate = playbackRate;
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [lesson?.audio_url, playbackRate]);

  useEffect(() => {
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-sentence="${currentIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  const clearClipStop = () => {
    const audio = audioRef.current;
    if (audio && stopHandlerRef.current) {
      audio.removeEventListener('timeupdate', stopHandlerRef.current);
      stopHandlerRef.current = null;
    }
    setClipPlaying(false);
  };

  const patchSentence = useCallback((i: number, patch: Partial<AlignSentence>) => {
    setSentences(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    setDirty(true);
    setSaveMsg(null);
  }, []);

  const markStart = useCallback((t?: number) => {
    const time = t ?? audioRef.current?.currentTime ?? 0;
    const rounded = Math.round(time * 1000) / 1000;
    patchSentence(currentIndex, { start: rounded });
    const prev = sentences[currentIndex - 1];
    if (prev && prev.end == null) patchSentence(currentIndex - 1, { end: rounded });
  }, [currentIndex, patchSentence, sentences]);

  const markEnd = useCallback((t?: number) => {
    const time = t ?? audioRef.current?.currentTime ?? 0;
    const rounded = Math.round(time * 1000) / 1000;
    patchSentence(currentIndex, { end: rounded });
    const next = sentences[currentIndex + 1];
    if (next && next.start == null) {
      patchSentence(currentIndex + 1, { start: rounded });
      setCurrentIndex(i => Math.min(i + 1, sentences.length - 1));
    } else if (currentIndex < sentences.length - 1) {
      setCurrentIndex(i => i + 1);
    }
  }, [currentIndex, patchSentence, sentences]);

  const nudge = (field: 'start' | 'end', delta: number) => {
    const s = sentences[currentIndex];
    if (!s) return;
    const base = s[field] ?? audioRef.current?.currentTime ?? 0;
    const next = Math.max(0, Math.round((base + delta) * 1000) / 1000);
    patchSentence(currentIndex, { [field]: next });
  };

  const playPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (clipPlaying) clearClipStop();
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  };

  const playClip = useCallback((i = currentIndex) => {
    const audio = audioRef.current;
    const s = sentences[i];
    if (!audio || s?.start == null || s.end == null) return;
    clearClipStop();
    const stopAt = s.end;
    const stop = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        audio.removeEventListener('timeupdate', stop);
        stopHandlerRef.current = null;
        setClipPlaying(false);
      }
    };
    stopHandlerRef.current = stop;
    audio.addEventListener('timeupdate', stop);
    audio.currentTime = s.start;
    audio.playbackRate = playbackRate;
    setClipPlaying(true);
    audio.play().catch(() => setClipPlaying(false));
  }, [currentIndex, sentences, playbackRate]);

  const seekTo = (t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(t, duration || t));
    setCurrentTime(audio.currentTime);
  };

  const assignSelection = () => {
    const box = rawRef.current;
    if (!box || !rawText) return;
    const off = selectionOffsets(box);
    if (!off) return;
    const text = rawText.slice(off.start, off.end).trim();
    if (!text) return;
    const pinyin = wordsCoveringRange(lesson?.content ?? [], off.start, off.end)
      .map(w => w.pinyin)
      .filter(Boolean)
      .join(' ');
    setSentences(prev => prev.map((s, i) => {
      if (i === currentIndex) return { ...s, hanzi: text, pinyin, textStart: off.start, textEnd: off.end };
      if (s.textStart == null || s.textEnd == null) return s;
      const overlap = !(s.textEnd <= off.start || s.textStart >= off.end);
      return overlap ? { ...s, textStart: null, textEnd: null } : s;
    }));
    setDirty(true);
    setSaveMsg(null);
    window.getSelection()?.removeAllRanges();
  };

  const addSentence = (after: number) => {
    const prev = sentences[after];
    const next: AlignSentence = {
      key: `new-${Date.now()}`,
      index: after + 1,
      hanzi: '',
      pinyin: '',
      start: prev?.end ?? null,
      end: null,
      textStart: null,
      textEnd: null,
    };
    setSentences(prevList => [...prevList.slice(0, after + 1), next, ...prevList.slice(after + 1)]);
    setCurrentIndex(after + 1);
    setDirty(true);
  };

  const removeSentence = (i: number) => {
    if (sentences.length <= 1) return;
    setSentences(prev => prev.filter((_, idx) => idx !== i));
    setCurrentIndex(c => Math.min(c, sentences.length - 2));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/dictation/align/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentences: sentences.map(s => ({
            index: s.index,
            hanzi: s.hanzi,
            start: s.start,
            end: s.end,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lưu thất bại');
      setDirty(false);
      setSaveMsg(data.contentUpdated ? 'Đã lưu timestamps và gắn lại text.' : 'Đã lưu timestamps.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (!saving) void save();
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';
      if (inField) return;
      if (e.key === ' ') {
        e.preventDefault();
        playPause();
      } else if (e.key === '[' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        markStart();
      } else if (e.key === ']' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        markEnd();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        playClip();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentIndex(i => Math.min(i + 1, sentences.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        assignSelection();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markStart, markEnd, playClip, sentences.length, saving]);

  const wordCells = useMemo(() => {
    const content = lesson?.content ?? [];
    const cells: { word: RawWord; start: number; len: number; para: number; sentenceIndex: number | null }[] = [];
    let pos = 0;
    content.forEach((para, paraIdx) => {
      para.forEach(word => {
        const len = (word.hanzi ?? '').length;
        const start = pos;
        const end = pos + len;
        const sentenceIndex = sentences.findIndex(s =>
          s.textStart != null && s.textEnd != null && start < s.textEnd && end > s.textStart,
        );
        cells.push({
          word,
          start,
          len,
          para: paraIdx,
          sentenceIndex: sentenceIndex >= 0 ? sentenceIndex : null,
        });
        pos = end;
      });
    });
    return cells;
  }, [lesson, sentences]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
        Đang tải…
      </div>
    );
  }

  if (notFound || !lesson) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>Không tìm thấy bài</div>
        <Link href="/dictation/align" style={{ color: 'var(--red)', textDecoration: 'none', fontSize: 13 }}>← Danh sách cắt audio</Link>
      </div>
    );
  }

  const levelColor = LEVEL_COLOR[lesson.hsk_level] ?? 'var(--ash)';
  const current = sentences[currentIndex];
  const doneCount = sentences.filter(s => s.start != null && s.end != null).length;
  const textCount = sentences.filter(s => s.hanzi.trim()).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dictation/align" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            ← Cắt thủ công
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: levelColor, color: 'white', fontSize: 9.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
            HSK {lesson.hsk_level}
          </span>
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, color: '#f5f1e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {lesson.title_zh_simplified}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.5)', flexShrink: 0 }}>
            {doneCount}/{sentences.length} mốc · {textCount} text
          </span>
          <button
            onClick={() => void save()}
            disabled={saving || !dirty}
            style={{
              padding: '7px 14px', borderRadius: 7, border: 'none',
              background: !dirty ? 'rgba(255,255,255,0.12)' : '#16a34a',
              color: '#fff', fontWeight: 700, fontSize: 12, cursor: dirty ? 'pointer' : 'default',
              fontFamily: 'Be Vietnam Pro, sans-serif',
            }}
          >
            {saving ? 'Đang lưu…' : 'Lưu DB'}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
        {saveMsg && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 12,
            background: saveMsg.startsWith('Đã lưu') ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
            color: saveMsg.startsWith('Đã lưu') ? '#16a34a' : '#dc2626',
            fontFamily: 'Be Vietnam Pro, sans-serif',
          }}>
            {saveMsg}
          </div>
        )}

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          {!lesson.audio_url ? (
            <div style={{ color: '#dc2626', fontSize: 13 }}>Bài này không có audio_url.</div>
          ) : (
            <>
              <audio ref={audioRef} src={lesson.audio_url} preload="metadata" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <button onClick={playPause} style={{
                  width: 42, height: 42, borderRadius: 10, border: 'none',
                  background: levelColor, color: '#fff', fontSize: 16, cursor: 'pointer',
                }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--ink)', minWidth: 110 }}>
                  {formatTime(currentTime)} / {formatTime(duration || null)}
                </div>
                <button onClick={() => markStart()} style={btnStyle}>[ Start</button>
                <button onClick={() => markEnd()} style={btnStyle}>End ]</button>
                <button onClick={() => playClip()} disabled={current?.start == null || current?.end == null} style={btnStyle}>
                  ▶ Câu này
                </button>
                <div style={{ flex: 1 }} />
                {[0.75, 1, 1.25].map(rate => (
                  <button key={rate} onClick={() => {
                    setPlaybackRate(rate);
                    if (audioRef.current) audioRef.current.playbackRate = rate;
                  }} style={{
                    padding: '4px 8px', borderRadius: 6,
                    border: `1px solid ${playbackRate === rate ? levelColor : 'var(--border)'}`,
                    background: playbackRate === rate ? levelColor : 'transparent',
                    color: playbackRate === rate ? '#fff' : 'var(--ash)',
                    fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                  }}>{rate}x</button>
                ))}
              </div>
              <div
                onClick={e => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seekTo(pct * (duration || 0));
                }}
                style={{ position: 'relative', height: 28, background: 'var(--paper-alt)', borderRadius: 8, cursor: 'pointer', overflow: 'hidden', border: '1px solid var(--border)' }}
              >
                {duration > 0 && sentences.map((s, i) => {
                  if (s.start == null || s.end == null) return null;
                  return (
                    <div key={s.key} style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${(s.start / duration) * 100}%`,
                      width: `${((s.end - s.start) / duration) * 100}%`,
                      background: SPAN_COLORS[i % SPAN_COLORS.length],
                      outline: i === currentIndex ? '2px solid var(--ink)' : 'none',
                    }} />
                  );
                })}
                {duration > 0 && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, width: 2, background: '#dc2626',
                    left: `${(currentTime / duration) * 100}%`,
                  }} />
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>
                Space play/pause · [ start · ] end (nhảy câu tiếp) · Enter nghe clip · ↑↓ câu · A gắn text đang chọn · ⌘S lưu
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14, minHeight: 0 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ash)' }}>Câu</span>
              <button onClick={() => addSentence(currentIndex)} style={{ ...btnStyle, padding: '4px 10px' }}>+ Thêm câu</button>
            </div>
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sentences.map((s, i) => {
                const ok = s.start != null && s.end != null;
                const active = i === currentIndex;
                return (
                  <div
                    key={s.key}
                    data-sentence={i}
                    onClick={() => setCurrentIndex(i)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${active ? levelColor : ok ? '#16a34a' : 'var(--border)'}`,
                      background: active ? 'var(--paper-alt)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                        background: SPAN_COLORS[i % SPAN_COLORS.length],
                      }} />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: active ? levelColor : 'var(--ash)', fontWeight: 700 }}>#{i + 1}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: ok ? '#16a34a' : '#c8392b', marginLeft: 'auto' }}>
                        {formatTime(s.start)} → {formatTime(s.end)}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); playClip(i); }}
                        disabled={s.start == null || s.end == null}
                        style={{ border: 'none', background: 'transparent', cursor: s.start == null ? 'default' : 'pointer', opacity: s.start == null ? 0.3 : 1 }}
                      >▶</button>
                      <button
                        onClick={e => { e.stopPropagation(); removeSentence(i); }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ash)', fontSize: 12 }}
                      >✕</button>
                    </div>
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 15, color: 'var(--ink)', lineHeight: 1.5 }}>
                      {s.hanzi || <span style={{ color: 'var(--ash-light)', fontStyle: 'italic' }}>Chưa gắn text</span>}
                    </div>
                    {s.pinyin ? (
                      <div style={{ fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 12, color: 'var(--ash)', marginTop: 4, lineHeight: 1.45 }}>
                        {s.pinyin}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {current && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>Câu #{currentIndex + 1}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={labelStyle}>Start</label>
                  <input
                    value={current.start == null ? '' : String(current.start)}
                    onChange={e => patchSentence(currentIndex, { start: parseTime(e.target.value) })}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                  <button onClick={() => nudge('start', -0.1)} style={btnStyle}>−0.1</button>
                  <button onClick={() => nudge('start', 0.1)} style={btnStyle}>+0.1</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={labelStyle}>End</label>
                  <input
                    value={current.end == null ? '' : String(current.end)}
                    onChange={e => patchSentence(currentIndex, { end: parseTime(e.target.value) })}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                  <button onClick={() => nudge('end', -0.1)} style={btnStyle}>−0.1</button>
                  <button onClick={() => nudge('end', 0.1)} style={btnStyle}>+0.1</button>
                </div>
                <textarea
                  value={current.hanzi}
                  onChange={e => patchSentence(currentIndex, { hanzi: e.target.value })}
                  placeholder="Hán tự của câu — chọn trên raw text rồi bấm Gắn / phím A"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--paper-alt)', fontFamily: 'Noto Serif SC, serif', fontSize: 16,
                    color: 'var(--ink)', lineHeight: 1.6, outline: 'none',
                  }}
                />
                <textarea
                  value={current.pinyin}
                  onChange={e => patchSentence(currentIndex, { pinyin: e.target.value })}
                  placeholder="Pinyin"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--paper-alt)', fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 13,
                    color: 'var(--ash)', lineHeight: 1.5, outline: 'none',
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ash)' }}>Raw text</span>
              <button onClick={assignSelection} style={{ ...btnStyle, borderColor: levelColor, color: levelColor }}>
                Gắn đoạn đang chọn vào câu #{currentIndex + 1}
              </button>
            </div>
            <div
              ref={rawRef}
              onMouseUp={e => {
                if (e.altKey) assignSelection();
              }}
              style={{
                flex: 1, overflowY: 'auto', padding: 12, borderRadius: 8,
                background: 'var(--paper-alt)', border: '1px solid var(--border)',
                fontFamily: 'Noto Serif SC, serif', fontSize: 18, lineHeight: 1.2,
                color: 'var(--ink)', userSelect: 'text',
              }}
            >
              {wordCells.length === 0 ? rawText : wordCells.map((cell, idx) => {
                const prevPara = idx > 0 ? wordCells[idx - 1].para : cell.para;
                const wrap = cell.para !== prevPara && idx > 0;
                const active = cell.sentenceIndex === currentIndex;
                const assigned = cell.sentenceIndex != null;
                return (
                  <span key={`${cell.para}-${cell.start}`}>
                    {wrap && <br />}
                    <span
                      data-hz
                      data-start={cell.start}
                      data-len={cell.len}
                      onClick={e => {
                        if (cell.sentenceIndex != null) {
                          e.stopPropagation();
                          setCurrentIndex(cell.sentenceIndex);
                        }
                      }}
                      style={{
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                        margin: '0 1px 6px', verticalAlign: 'bottom',
                        background: assigned ? SPAN_COLORS[cell.sentenceIndex! % SPAN_COLORS.length] : 'transparent',
                        outline: active ? '2px solid var(--ink)' : 'none',
                        borderRadius: 4, padding: '2px 1px 0',
                        cursor: assigned ? 'pointer' : 'text',
                      }}
                    >
                      <span style={{
                        fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 10, color: 'var(--ash)',
                        lineHeight: 1.15, userSelect: 'none', minHeight: 12,
                      }}>
                        {cell.word.pinyin}
                      </span>
                      <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 18, lineHeight: 1.35 }}>
                        {cell.word.hanzi}
                      </span>
                    </span>
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ash)' }}>
              Bôi đen đoạn tương ứng với câu đang chọn, rồi bấm nút gắn (hoặc phím A). Alt+mouseup cũng gắn luôn.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--ink)', fontSize: 12, cursor: 'pointer',
  fontFamily: 'Be Vietnam Pro, sans-serif',
};

const labelStyle: CSSProperties = {
  width: 40, fontSize: 11, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace',
};

const inputStyle: CSSProperties = {
  width: 90, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--paper-alt)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
  color: 'var(--ink)', outline: 'none',
};
