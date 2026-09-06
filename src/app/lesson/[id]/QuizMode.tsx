'use client';
import { useState, useEffect } from 'react';
import type { VocabCard } from '@/types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Direction = 'zh-to-vn' | 'vn-to-zh';

interface Question {
  card: VocabCard;
  type: 'multiple';
  direction: Direction;
  choices: string[];   // zh-to-vn: vn strings; vn-to-zh: zh strings
  choicesPy: string[]; // vn-to-zh: pinyin for each choice (same index)
}

interface QuizModeProps {
  vocab: VocabCard[];
  speak: (text: string) => void;
  onMistake?: (card: VocabCard) => void;
  lessonId?: string;
}

const COUNT_OPTIONS = [10, 20, 30];

export default function QuizMode({ vocab, speak, onMistake, lessonId }: QuizModeProps) {
  const [step, setStep] = useState<'config' | 'playing' | 'done'>('config');
  const [count, setCount] = useState(Math.min(10, vocab.length));
  const [direction, setDirection] = useState<Direction>('zh-to-vn');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState<VocabCard[]>([]);
  const [correct, setCorrect] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [savedMistakeIds, setSavedMistakeIds] = useState<Map<string, string>>(new Map());
  const [deletedMistakes, setDeletedMistakes] = useState<Set<string>>(new Set());
  const countOptions = [
    ...COUNT_OPTIONS.filter(n => n <= vocab.length).map(n => ({ label: `${n} câu`, value: n })),
    { label: 'Tất cả', value: vocab.length },
  ].filter((o, i, arr) => i === 0 || o.value !== arr[i - 1].value);

  function buildQuestions(n: number): Question[] {
    const selected = shuffle([...vocab]).slice(0, n);
    return selected.map(card => {
      if (direction === 'vn-to-zh') {
        const wrongs = shuffle(vocab.filter(v => v.zh !== card.zh)).slice(0, 3);
        const opts = shuffle([card, ...wrongs]);
        return { card, type: 'multiple' as const, direction, choices: opts.map(v => v.zh), choicesPy: opts.map(v => v.py) };
      }
      const wrong = shuffle(vocab.filter(v => v.zh !== card.zh)).slice(0, 3).map(v => v.vn);
      return { card, type: 'multiple' as const, direction, choices: shuffle([card.vn, ...wrong]), choicesPy: [] };
    });
  }

  function startQuiz() {
    const qs = buildQuestions(count);
    setQuestions(qs);
    setIdx(0);
    setAnswered(false);
    setChosen(null);
    setMissed([]);
    setCorrect(0);
    setStartTime(Date.now());
    setSavedMistakeIds(new Map());
    setDeletedMistakes(new Set());
    setStep('playing');
  }

  const q = questions[idx];

  function answerMultiple(choice: string) {
    if (answered) return;
    setAnswered(true);
    setChosen(choice);
    const correctAnswer = q.direction === 'vn-to-zh' ? q.card.zh : q.card.vn;
    if (choice === correctAnswer) setCorrect(c => c + 1);
    else {
      setMissed(m => [...m, q.card]);
      const zh = q.card.zh;
      fetch('/api/notes/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: 'mistake', zh, py: q.card.py, vn: q.card.vn, pos: q.card.pos, sourceLessonId: lessonId ?? null }),
      }).then(r => r.json()).then(d => {
        if (d.item?.id) setSavedMistakeIds(m => new Map(m).set(zh, d.item.id));
      }).catch(() => {});
      onMistake?.(q.card);
    }
    speak(q.card.zh);
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setElapsed(Math.round((Date.now() - startTime) / 1000));
      setStep('done');
      return;
    }
    setIdx(idx + 1);
    setAnswered(false);
    setChosen(null);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (step !== 'playing') return;
      if ((e.key === 'Enter' || e.key === ' ') && answered) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const fmt = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  // ── Config ──────────────────────────────────────────────────────────────────
  if (step === 'config') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '48px 24px', width: 'min(440px,100%)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 40, fontWeight: 700, color: 'var(--red)', lineHeight: 1 }}>测验</div>
        <div style={{ fontSize: 13, color: 'var(--ash)', marginTop: 6 }}>{vocab.length} từ vựng · trắc nghiệm 4 đáp án</div>
      </div>

      {/* Direction */}
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 10 }}>Dạng câu hỏi</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            { value: 'zh-to-vn', label: 'Hán tự → Nghĩa tiếng Việt', sub: '看汉字，选越南语意思' },
            { value: 'vn-to-zh', label: 'Nghĩa tiếng Việt → Hán tự', sub: '看越南语，选汉字' },
          ] as { value: Direction; label: string; sub: string }[]).map(o => (
            <button key={o.value} onClick={() => setDirection(o.value)} style={{
              padding: '12px 18px', border: `1.5px solid ${direction === o.value ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8, background: direction === o.value ? 'var(--red-light)' : 'var(--card-bg)',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: direction === o.value ? 600 : 400, color: direction === o.value ? 'var(--red)' : 'var(--ink)' }}>{o.label}</div>
                <div style={{ fontSize: 10, color: 'var(--ash)', fontFamily: 'Noto Serif SC, serif', marginTop: 2 }}>{o.sub}</div>
              </div>
              {direction === o.value && <span style={{ fontSize: 16 }}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 10 }}>Số câu hỏi</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {countOptions.map(o => (
            <button key={o.value} onClick={() => setCount(o.value)} style={{
              padding: '13px 18px', border: `1.5px solid ${count === o.value ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8, background: count === o.value ? 'var(--red-light)' : 'var(--card-bg)',
              cursor: 'pointer', fontSize: 14, fontWeight: count === o.value ? 600 : 400,
              color: count === o.value ? 'var(--red)' : 'var(--ink)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s',
            }}>
              <span>{o.label}</span>
              {count === o.value && <span style={{ fontSize: 16 }}>✓</span>}
            </button>
          ))}
        </div>
      </div>
      <button onClick={startQuiz} style={{
        width: '100%', padding: '14px', background: 'var(--red)', color: 'white',
        border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer',
      }}>Bắt đầu →</button>
    </div>
  );

  // ── Done ────────────────────────────────────────────────────────────────────
  if (step === 'done') {
    const pct = Math.round(correct / questions.length * 100);
    const medal = pct >= 90 ? '完美！' : pct >= 70 ? '不错！' : '加油！';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '40px 24px', width: 'min(520px,100%)' }}>
        <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 52, fontWeight: 700, color: 'var(--red)', lineHeight: 1 }}>{medal}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, width: '100%' }}>
          {[['Điểm số', `${correct}/${questions.length}`], ['Chính xác', `${pct}%`], ['Thời gian', fmt(elapsed)]].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{value}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 70 ? 'var(--green)' : 'var(--red)', borderRadius: 4, transition: 'width 0.8s' }} />
        </div>

        {missed.length > 0 && (
          <div style={{ width: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ash-light)', marginBottom: 12 }}>
              Cần ôn lại · {missed.filter(c => !deletedMistakes.has(c.zh)).length} từ
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {missed.filter(c => !deletedMistakes.has(c.zh)).map(card => (
                <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 18, fontWeight: 700, color: 'var(--red)', minWidth: 44 }}>{card.zh}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash)' }}>{card.py}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>{card.vn}</span>
                  {savedMistakeIds.has(card.zh) && (
                    <button
                      onClick={() => {
                        const itemId = savedMistakeIds.get(card.zh)!;
                        fetch(`/api/notes/items/${itemId}`, { method: 'DELETE' }).catch(() => {});
                        setDeletedMistakes(s => new Set(s).add(card.zh));
                      }}
                      title="Xoá khỏi Mistake"
                      style={{ padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 11, color: 'var(--ash)', flexShrink: 0, transition: 'background 0.1s, color 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper-alt)'; e.currentTarget.style.color = 'var(--ash)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                      🗑 Xoá
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={() => setStep('config')} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>← Cấu hình lại</button>
          <button onClick={startQuiz} style={{ flex: 1, padding: '12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Làm lại</button>
        </div>
      </div>
    );
  }

  // ── Playing ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: 'min(560px,100%)' }}>
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ash)' }}>
          Câu <strong>{idx + 1}</strong> / {questions.length}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ash)' }}>
          Đúng: <strong style={{ color: 'var(--green)' }}>{correct}</strong>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--red)', width: `${(idx / questions.length) * 100}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Question card */}
      <div style={{ width: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '36px 28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
        <button onClick={() => speak(q.card.zh)} style={{ position: 'absolute', top: 14, left: 16, width: 34, height: 34, border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--paper-alt)', cursor: 'pointer', fontSize: 15 }}>🔊</button>
        {q.direction === 'zh-to-vn' ? (
          <>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)' }}>{q.card.pos}</div>
            <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 'clamp(60px,13vw,96px)', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{q.card.zh}</div>
            {answered && (
              <div style={{ marginTop: 6, textAlign: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, color: 'var(--red)', marginRight: 8 }}>{q.card.py}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-soft)' }}>{q.card.vn}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)' }}>{q.card.pos}</div>
            <div style={{ fontSize: 'clamp(20px,5vw,28px)', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.5, textAlign: 'center', maxWidth: '100%' }}>{q.card.vn}</div>
            {answered && (
              <div style={{ marginTop: 6, textAlign: 'center' }}>
                <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 28, fontWeight: 700, color: 'var(--red)', marginRight: 8 }}>{q.card.zh}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--ash)' }}>{q.card.py}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Multiple choice */}
      {q.type === 'multiple' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
          {q.choices.map((c, ci) => {
            const correctAnswer = q.direction === 'vn-to-zh' ? q.card.zh : q.card.vn;
            const isCorrect = c === correctAnswer;
            const isChosen = c === chosen;
            let bg = 'var(--card-bg)', border = 'var(--border)', color = 'var(--ink)';
            if (answered) {
              if (isCorrect) { bg = 'var(--green-light)'; border = 'var(--green)'; color = 'var(--green)'; }
              else if (isChosen) { bg = 'var(--red-light)'; border = 'var(--red)'; color = 'var(--red)'; }
            }
            return (
              <button key={c} disabled={answered} onClick={() => answerMultiple(c)} style={{
                padding: '13px 14px', border: `1.5px solid ${border}`, borderRadius: 7,
                background: bg, cursor: answered ? 'default' : 'pointer',
                textAlign: 'center', lineHeight: 1.4, transition: 'all 0.12s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                {q.direction === 'vn-to-zh' ? (
                  <>
                    <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 28, fontWeight: 700, color }}>{c}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: answered ? color : 'var(--ash)', opacity: 0.8 }}>{q.choicesPy[ci]}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 500, color, textAlign: 'left', width: '100%' }}>{c}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {answered && (
        <button onClick={next} style={{ width: '100%', padding: '13px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          {idx + 1 < questions.length ? 'Câu tiếp →' : 'Xem kết quả →'}
        </button>
      )}

      {answered && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash-light)' }}>
          Enter để tiếp tục
        </div>
      )}
    </div>
  );
}
