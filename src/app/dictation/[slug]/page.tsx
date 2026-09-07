'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { matchDictationWords, type WordSlot } from '@/lib/dictation';

type DictationSentence = {
  index: number; hanzi: string; pinyin: string; wordCount: number; words: string[];
  start: number | null; end: number | null;
};
type Lesson = {
  slug: string; title_en: string; title_zh_simplified: string;
  hsk_level: number; categories: string[]; audio_url: string | null;
  vocabCount?: number;
};
type CheckResult = { result: WordSlot[]; correct_hanzi: string; pinyin: string; is_perfect: boolean };

const LEVEL_COLOR: Record<number, string> = {
  1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0',
};
type AlignmentStatus = 'Checked' | 'Uncheck';

function getAlignmentStatus(categories: string[]): AlignmentStatus | null {
  if (categories.includes('Uncheck')) return 'Uncheck';
  if (categories.includes('Checked')) return 'Checked';
  return null;
}

function AlignmentStatusBadge({ status }: { status: AlignmentStatus }) {
  const isChecked = status === 'Checked';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      background: isChecked ? 'rgba(22,163,74,0.18)' : 'rgba(200,57,43,0.18)',
      border: `1px solid ${isChecked ? 'rgba(22,163,74,0.4)' : 'rgba(200,57,43,0.4)'}`,
      color: isChecked ? '#86efac' : '#fecaca',
      fontSize: 9.5, fontWeight: 700,
      fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
      flexShrink: 0,
    }}>
      {status}
    </span>
  );
}
const SLOT_COLOR: Record<WordSlot['status'], string> = {
  empty: 'var(--ash)',
  partial: 'var(--ink)',
  correct: '#16a34a',
  wrong: '#dc2626',
  extra: '#dc2626',
};

function WordBlanks({
  slots,
  showExpectedOnWrong = false,
  activeIndex = -1,
}: {
  slots: WordSlot[];
  showExpectedOnWrong?: boolean;
  activeIndex?: number;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, rowGap: 16, alignItems: 'flex-end' }}>
      {slots.map((slot, i) => {
        const isActive = i === activeIndex;
        const stars = '*'.repeat(Math.max(slot.expected.length, 1));
        const display = slot.status === 'empty'
          ? stars
          : slot.status === 'partial'
            ? slot.typed + '*'.repeat(Math.max(slot.expected.length - slot.typed.length, 0))
            : slot.typed || stars;
        const hintVisible = !!(slot.showHint && slot.expected && (slot.status !== 'empty' || isActive));
        const hint = hintVisible
          ? slot.expected
          : showExpectedOnWrong && slot.status === 'wrong' && slot.expected && slot.typed.length >= slot.expected.length
            ? slot.expected
            : null;
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            minWidth: Math.max(slot.expected.length, slot.typed.length, 1) * 14 + 8,
          }}>
            {hint ? (
              <span style={{
                fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#a0720a',
                lineHeight: 1, fontWeight: 700, letterSpacing: '0.04em',
              }}>
                {hint}
              </span>
            ) : (
              <span style={{ height: 10 }} />
            )}
            <span style={{
              display: 'inline-flex', justifyContent: 'center',
              minWidth: Math.max(slot.expected.length, 1) * 16 + 8,
              padding: '2px 4px 1px',
              borderBottom: `2px solid ${isActive ? '#a0720a' : SLOT_COLOR[slot.status]}`,
              background: isActive ? 'rgba(160,114,10,0.06)' : 'transparent',
              fontFamily: 'Noto Serif SC, JetBrains Mono, serif',
              fontSize: 20, letterSpacing: '0.12em',
              color: SLOT_COLOR[slot.status], lineHeight: 1.3,
            }}>
              {display}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#16a34a' : pct >= 60 ? '#a0720a' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color, minWidth: 32, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}


export default function DictationExercisePage() {
  const { slug } = useParams<{ slug: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sentences, setSentences] = useState<DictationSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<Record<number, CheckResult>>({});
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState<Record<number, boolean>>({});
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [ttsSupported, setTtsSupported] = useState(false);
  const [composing, setComposing] = useState(false);
  const [inputBeforeIme, setInputBeforeIme] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stopHandlerRef = useRef<(() => void) | null>(null);

  const hasAlignedAudio = (s?: DictationSentence) =>
    s != null && s.start != null && s.end != null;

  const clearAudioStop = () => {
    const audio = audioRef.current;
    if (audio && stopHandlerRef.current) {
      audio.removeEventListener('timeupdate', stopHandlerRef.current);
      stopHandlerRef.current = null;
    }
  };

  useEffect(() => {
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      window.speechSynthesis?.cancel();
      const audio = audioRef.current;
      if (audio && stopHandlerRef.current) {
        audio.removeEventListener('timeupdate', stopHandlerRef.current);
        stopHandlerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    fetch(`/api/dictation/lessons/${slug}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => { setLesson(d.lesson); setSentences(d.sentences); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    window.speechSynthesis?.cancel();
    clearAudioStop();
    if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
    setIsPlaying(false);
    setUserInput('');
    setShowHint(false);
    setComposing(false);
    setInputBeforeIme('');
    textareaRef.current?.focus();
  }, [currentIndex]);

  const totalAnswered = Object.keys(results).length;
  const totalCorrect = Object.values(results).filter(r => r.is_perfect).length;
  const scorePercent = sentences.length
    ? Math.round((Object.values(results).reduce((acc, r) => {
        const words = r.result.filter(s => s.status !== 'extra');
        const correct = words.filter(s => s.status === 'correct').length;
        return acc + (words.length > 0 ? correct / words.length : 0);
      }, 0) / sentences.length) * 100)
    : 0;

  const checkAnswer = useCallback(async () => {
    if (!userInput.trim() || isChecking) return;
    setIsChecking(true);
    try {
      const res = await fetch('/api/dictation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, sentence_index: sentences[currentIndex]?.index, user_input: userInput }),
      });
      const data = await res.json() as CheckResult;
      setResults(prev => ({ ...prev, [currentIndex]: data }));
    } finally {
      setIsChecking(false);
    }
  }, [userInput, isChecking, slug, sentences, currentIndex]);

  const speakSentence = useCallback((hanzi: string, rate = 1) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(hanzi);
    utter.lang = 'zh-CN';
    utter.rate = rate * 0.85; // SpeechSynthesis rate ≈ slightly slower than normal speech
    utter.onstart = () => setIsPlaying(true);
    utter.onend = () => setIsPlaying(false);
    utter.onerror = () => setIsPlaying(false);
    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, [ttsSupported]);

  const playSentence = useCallback((start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearAudioStop();
    window.speechSynthesis?.cancel();

    const stopAt = end + 0.15;
    const stop = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        audio.removeEventListener('timeupdate', stop);
        stopHandlerRef.current = null;
        setIsPlaying(false);
      }
    };
    stopHandlerRef.current = stop;
    audio.addEventListener('timeupdate', stop);

    const startPlay = () => {
      audio.currentTime = start;
      audio.playbackRate = playbackRate;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    };

    if (audio.readyState >= 1) {
      startPlay();
    } else {
      const onReady = () => {
        audio.removeEventListener('loadedmetadata', onReady);
        startPlay();
      };
      audio.addEventListener('loadedmetadata', onReady);
      audio.load();
    }
  }, [playbackRate]);

  const replayAudio = useCallback(() => {
    const s = sentences[currentIndex];
    if (hasAlignedAudio(s)) {
      playSentence(s.start as number, s.end as number);
    } else if (s?.hanzi) {
      speakSentence(s.hanzi, playbackRate);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  }, [sentences, currentIndex, playSentence, speakSentence, playbackRate]);

  const togglePlay = useCallback(() => {
    const s = sentences[currentIndex];
    if (hasAlignedAudio(s)) {
      if (isPlaying) {
        clearAudioStop();
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        playSentence(s.start as number, s.end as number);
      }
    } else if (s?.hanzi) {
      if (isPlaying) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
      } else {
        speakSentence(s.hanzi, playbackRate);
      }
    } else if (audioRef.current) {
      if (audioRef.current.paused) { audioRef.current.play(); }
      else { audioRef.current.pause(); }
    }
  }, [sentences, currentIndex, isPlaying, playSentence, speakSentence, playbackRate]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when focus is inside the textarea
      const tag = (e.target as HTMLElement).tagName;
      const inTextarea = tag === 'TEXTAREA' || tag === 'INPUT';

      if (e.key === ' ' && !inTextarea) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        replayAudio();
      } else if (e.key === 'Enter' && !inTextarea) {
        e.preventDefault();
        checkAnswer();
      } else if (e.key === 'h' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowHint(h => {
          if (!h) setHintUsed(prev => ({ ...prev, [currentIndex]: true }));
          return !h;
        });
      } else if (e.key === 'ArrowRight' && !inTextarea) {
        e.preventDefault();
        setCurrentIndex(i => Math.min(i + 1, sentences.length - 1));
      } else if (e.key === 'ArrowLeft' && !inTextarea) {
        e.preventDefault();
        setCurrentIndex(i => Math.max(i - 1, 0));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, replayAudio, checkAnswer, currentIndex, sentences.length]);

  // Scroll active sentence card into view in right panel
  useEffect(() => {
    const el = rightPanelRef.current?.querySelector(`[data-sentence="${currentIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
      Đang tải…
    </div>
  );

  if (notFound || !lesson) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--paper)' }}>
      <div style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>Không tìm thấy bài nghe</div>
      <Link href="/dictation" style={{ color: 'var(--red)', textDecoration: 'none', fontSize: 13 }}>← Quay lại danh sách</Link>
    </div>
  );

  const levelColor = LEVEL_COLOR[lesson.hsk_level] ?? 'var(--ash)';
  const alignmentStatus = getAlignmentStatus(lesson.categories);
  const currentSentence = sentences[currentIndex];
  const currentResult = results[currentIndex];
  const canPlaySentence = hasAlignedAudio(currentSentence) || ttsSupported;
  const words = currentSentence?.words ?? [];
  const liveSlots = matchDictationWords(composing ? inputBeforeIme : userInput, words);
  const targetWordCount = words.length;
  const filledWordCount = liveSlots.filter(s => s.status === 'correct' || s.status === 'wrong').length;
  const remainingWordCount = liveSlots.filter(s => s.status === 'empty' || s.status === 'partial').length;
  const extraWordCount = liveSlots.filter(s => s.status === 'extra').length;
  const correctLiveCount = liveSlots.filter(s => s.status === 'correct').length;
  const allWordsCorrect = targetWordCount > 0 && correctLiveCount === targetWordCount && extraWordCount === 0;
  const activeWordIndex = liveSlots.findIndex(s => s.status === 'empty' || s.status === 'partial');
  const wordCountColor = extraWordCount > 0 ? '#dc2626' : allWordsCorrect ? '#16a34a' : 'var(--ash)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dictation" style={{ color: 'rgba(200,191,176,0.6)', textDecoration: 'none', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f5f1e8')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,191,176,0.6)')}>
            ← Luyện nghe
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: levelColor, color: 'white', fontSize: 9.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0 }}>
            HSK {lesson.hsk_level}
          </span>
          {alignmentStatus && <AlignmentStatusBadge status={alignmentStatus} />}
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, color: '#f5f1e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {lesson.title_zh_simplified}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.5)', flexShrink: 0 }}>
            {lesson.vocabCount ?? sentences.reduce((n, s) => n + s.wordCount, 0)} từ · {totalAnswered}/{sentences.length} câu
          </span>
          {sentences.some(s => s.start == null || s.end == null) && (
            <Link href={`/dictation/align/${slug}`} style={{
              padding: '5px 10px', borderRadius: 6, textDecoration: 'none',
              background: 'rgba(200,57,43,0.2)', color: '#fecaca',
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
            }}>
              Cắt thủ công
            </Link>
          )}
        </div>
      </header>

      {/* 3-column layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 300px', maxWidth: 1280, margin: '0 auto', width: '100%', padding: '0 24px', gap: 20, boxSizing: 'border-box', minHeight: 0 }}>

        {/* ── LEFT: TTS Controls ──────────────────────────────── */}
        <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Per-sentence playback */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', textTransform: 'uppercase' }}>Nghe câu</span>
              {hasAlignedAudio(currentSentence) ? (
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>Audio ✓</span>
              ) : ttsSupported ? (
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>TTS ✓</span>
              ) : null}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash)', marginBottom: 10 }}>
              Câu #{(currentSentence?.index ?? 0) + 1} — {currentSentence?.wordCount ?? 0} từ
            </div>
            {/* Speed */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {([0.75, 1] as const).map(rate => (
                <button key={rate} onClick={() => setPlaybackRate(rate)} style={{
                  flex: 1, padding: '5px 0', borderRadius: 6,
                  border: `1px solid ${playbackRate === rate ? levelColor : 'var(--border)'}`,
                  background: playbackRate === rate ? levelColor : 'transparent',
                  color: playbackRate === rate ? '#fff' : 'var(--ash)',
                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  {rate}x
                </button>
              ))}
            </div>
            {!hasAlignedAudio(currentSentence) && !ttsSupported && (
              <div style={{ fontSize: 11, color: '#dc2626', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 }}>
                Trình duyệt không hỗ trợ TTS
              </div>
            )}
          </div>

          {/* Full lesson audio (supplementary) */}
          {lesson.audio_url && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', marginBottom: 10, textTransform: 'uppercase' }}>
                Audio gốc (cả bài)
              </div>
              <audio
                ref={audioRef}
                src={lesson.audio_url}
                style={{ width: '100%', height: 36 }}
                controls
                onEnded={() => {
                  clearAudioStop();
                  setIsPlaying(false);
                }}
              />
            </div>
          )}

          {/* ĐIỀU KHIỂN */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', marginBottom: 12, textTransform: 'uppercase' }}>Điều khiển</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={togglePlay}
                disabled={!canPlaySentence}
                style={{
                  padding: '10px 0', borderRadius: 8, border: 'none',
                  background: !canPlaySentence ? 'var(--border)' : isPlaying ? '#dc2626' : levelColor,
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: canPlaySentence ? 'pointer' : 'default',
                  fontFamily: 'Be Vietnam Pro, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}
              >
                {isPlaying ? '⏸ Dừng' : '▶ Nghe câu này'}
              </button>
              <button
                onClick={replayAudio}
                disabled={!canPlaySentence}
                style={{
                  padding: '10px 0', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: canPlaySentence ? 'var(--ink)' : 'var(--border)', fontWeight: 600, fontSize: 13,
                  cursor: canPlaySentence ? 'pointer' : 'default',
                  fontFamily: 'Be Vietnam Pro, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                ↺ Nghe lại (Tab)
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', marginBottom: 10, textTransform: 'uppercase' }}>Phím tắt</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Space', 'Play / Pause'],
                ['Tab', 'Phát lại'],
                ['Enter', 'Chấm điểm'],
                ['Ctrl+H', 'Gợi ý pinyin'],
                ['← →', 'Chuyển câu'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '1px 6px', background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                    {key}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ash)', fontFamily: 'Be Vietnam Pro, sans-serif', textAlign: 'right' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: Input + Diff ─────────────────────────────── */}
        <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Difficulty tabs */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['easy', 'normal', 'hard'] as const).map(d => (
              <button key={d} onClick={() => setDifficulty(d)} style={{
                padding: '5px 16px', borderRadius: 6,
                border: `1.5px solid ${difficulty === d ? (d === 'easy' ? '#16a34a' : d === 'normal' ? '#a0720a' : '#dc2626') : 'var(--border)'}`,
                background: difficulty === d ? (d === 'easy' ? '#16a34a' : d === 'normal' ? '#a0720a' : '#dc2626') : 'transparent',
                color: difficulty === d ? '#fff' : 'var(--ash)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}>
                {d === 'easy' ? 'Dễ' : d === 'normal' ? 'Bình thường' : 'Khó'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {/* Sentence nav */}
            <button onClick={() => setCurrentIndex(i => Math.max(i - 1, 0))} disabled={currentIndex === 0} style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent',
              color: currentIndex === 0 ? 'var(--border)' : 'var(--ash)', cursor: currentIndex === 0 ? 'default' : 'pointer', fontSize: 14,
            }}>◄</button>
            <span style={{ padding: '5px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ink)', alignSelf: 'center' }}>
              {currentIndex + 1}/{sentences.length}
            </span>
            <button onClick={() => setCurrentIndex(i => Math.min(i + 1, sentences.length - 1))} disabled={currentIndex === sentences.length - 1} style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent',
              color: currentIndex === sentences.length - 1 ? 'var(--border)' : 'var(--ash)', cursor: currentIndex === sentences.length - 1 ? 'default' : 'pointer', fontSize: 14,
            }}>►</button>
          </div>

          {/* Input area */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Gõ những gì bạn nghe được: <span style={{ color: 'var(--ash-light)', fontWeight: 400 }}>Câu #{(currentSentence?.index ?? 0) + 1} ({targetWordCount} từ)</span>
              </div>
              <div style={{
                flexShrink: 0,
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${extraWordCount > 0 ? 'rgba(220,38,38,0.35)' : allWordsCorrect ? 'rgba(22,163,74,0.35)' : 'var(--border)'}`,
                background: extraWordCount > 0 ? 'rgba(220,38,38,0.08)' : allWordsCorrect ? 'rgba(22,163,74,0.08)' : 'var(--paper-alt)',
                color: wordCountColor,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                {filledWordCount}/{targetWordCount} từ
              </div>
            </div>

            {words.length > 0 && (
              <WordBlanks
                slots={liveSlots}
                showExpectedOnWrong
                activeIndex={currentResult ? -1 : activeWordIndex}
              />
            )}

            {/* Hint (pinyin) */}
            {(showHint || difficulty === 'easy') && currentSentence && (
              <div style={{ padding: '8px 12px', background: 'rgba(160,114,10,0.08)', border: '1px solid rgba(160,114,10,0.2)', borderRadius: 8, fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 14, color: '#a0720a', lineHeight: 1.8 }}>
                {currentSentence.pinyin}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onCompositionStart={() => {
                setComposing(true);
                setInputBeforeIme(userInput);
              }}
              onCompositionEnd={e => {
                setComposing(false);
                setUserInput(e.currentTarget.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  checkAnswer();
                }
              }}
              placeholder="Gõ liên tục, không cần dấu cách… (Enter để chấm điểm)"
              style={{
                width: '100%', boxSizing: 'border-box',
                minHeight: 100, resize: 'none',
                padding: '12px 14px',
                background: 'var(--paper-alt)', border: '1px solid var(--border)',
                borderRadius: 8, outline: 'none',
                fontFamily: 'Noto Serif SC, serif', fontSize: 20,
                color: 'var(--ink)', lineHeight: 1.8,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = levelColor)}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <div style={{ marginTop: -8, fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 12, color: wordCountColor }}>
              {extraWordCount > 0
                ? 'Dư chữ so với câu gốc'
                : remainingWordCount > 0
                  ? `Còn thiếu ${remainingWordCount} từ`
                  : allWordsCorrect
                    ? 'Tất cả các từ đều đúng'
                    : 'Đã đủ số từ — kiểm tra các từ đỏ'}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={checkAnswer}
                disabled={isChecking || !userInput.trim()}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: !userInput.trim() ? 'var(--border)' : levelColor,
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: !userInput.trim() ? 'default' : 'pointer',
                  fontFamily: 'Be Vietnam Pro, sans-serif', transition: 'background 0.15s',
                }}
              >
                {isChecking ? 'Đang chấm…' : '✓ Chấm điểm'}
              </button>
              {difficulty !== 'easy' && (
                <button
                  onClick={() => {
                    setShowHint(h => !h);
                    if (!showHint) setHintUsed(prev => ({ ...prev, [currentIndex]: true }));
                  }}
                  style={{
                    padding: '10px 16px', borderRadius: 8,
                    border: `1px solid ${hintUsed[currentIndex] ? '#dc2626' : 'var(--border)'}`,
                    background: 'transparent',
                    color: hintUsed[currentIndex] ? '#dc2626' : 'var(--ash)',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                    transition: 'all 0.15s',
                  }}
                >
                  {showHint ? 'Ẩn gợi ý' : 'Hiện gợi ý'}
                </button>
              )}
              {currentResult && (
                <button
                  onClick={() => {
                    setUserInput('');
                    setResults(prev => { const n = { ...prev }; delete n[currentIndex]; return n; });
                  }}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--ash)', fontSize: 12, cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  ↩
                </button>
              )}
            </div>

            {/* Diff result */}
            {currentResult && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kết quả</span>
                  {currentResult.is_perfect ? (
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>✓ Hoàn hảo!</span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#dc2626', fontFamily: 'JetBrains Mono, monospace' }}>
                      {currentResult.result.filter(r => r.status === 'correct').length}/{currentResult.result.filter(r => r.status !== 'extra').length} từ đúng
                    </span>
                  )}
                </div>
                {!currentResult.is_perfect && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(22,163,74,0.06)', borderRadius: 6, border: '1px solid rgba(22,163,74,0.15)' }}>
                    <div style={{ fontSize: 10, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4, textTransform: 'uppercase' }}>Đáp án đúng</div>
                    <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 18, color: '#16a34a', lineHeight: 1.6 }}>{currentResult.correct_hanzi}</div>
                    <div style={{ fontFamily: 'Be Vietnam Pro, sans-serif', fontSize: 12, color: 'var(--ash)', marginTop: 2 }}>{currentResult.pinyin}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: BÀN CHÉP ─────────────────────────────────── */}
        <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ash)' }}>Bàn chép</span>
            <ScoreBar pct={scorePercent} />
          </div>

          <div ref={rightPanelRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
            {sentences.map((s, i) => {
              const r = results[i];
              const isActive = i === currentIndex;
              const isPerfect = r?.is_perfect;
              const isAnswered = !!r;
              const isHinted = hintUsed[i];

              let borderColor = 'var(--border)';
              if (isActive) borderColor = levelColor;
              else if (isPerfect) borderColor = '#16a34a';
              else if (isAnswered) borderColor = '#dc2626';

              return (
                <div
                  key={s.index}
                  data-sentence={i}
                  onClick={() => setCurrentIndex(i)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${borderColor}`,
                    background: isActive ? 'var(--paper-alt)' : 'var(--card-bg)',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isAnswered ? 6 : 0 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: isActive ? levelColor : 'var(--ash)', fontWeight: isActive ? 700 : 400 }}>
                      #{s.index + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {isHinted && <span style={{ fontSize: 9, color: '#dc2626', fontFamily: 'JetBrains Mono, monospace' }}>hint</span>}
                      {isPerfect && <span style={{ fontSize: 12 }}>✓</span>}
                    </div>
                  </div>

                  {isAnswered && r ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {r.result.filter(c => c.status !== 'extra').slice(0, 12).map((c, ci) => (
                        <span key={ci} style={{
                          fontFamily: 'Noto Serif SC, serif', fontSize: 13,
                          color: SLOT_COLOR[c.status],
                        }}>
                          {c.status === 'empty' || c.status === 'partial' ? '*'.repeat(Math.max(c.expected.length, 1)) : c.typed}
                        </span>
                      ))}
                      {r.result.filter(c => c.status !== 'extra').length > 12 && <span style={{ fontSize: 10, color: 'var(--ash)' }}>…</span>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, userSelect: 'none', fontSize: 12, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>
                      {(s.words ?? []).slice(0, 8).map((w, wi) => (
                        <span key={wi}>{'*'.repeat(Math.max(w.length, 1))}</span>
                      ))}
                      {(s.words ?? []).length > 8 && <span>…</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {totalAnswered > 0 && (
            <div style={{ flexShrink: 0, padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash)', marginBottom: 4 }}>Tổng kết</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#16a34a', fontFamily: 'JetBrains Mono, monospace' }}>✓ {totalCorrect}</span>
                <span style={{ fontSize: 12, color: '#dc2626', fontFamily: 'JetBrains Mono, monospace' }}>✗ {totalAnswered - totalCorrect}</span>
                <span style={{ fontSize: 12, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>/ {sentences.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
