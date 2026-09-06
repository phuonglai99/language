'use client';
import { useState, useEffect, useRef } from 'react';
import type { VocabCard } from '@/types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Card {
  id: string;
  content: string;
  type: 'word' | 'meaning';
  pairId: string;
}

interface MatchGameProps {
  vocab: VocabCard[];
  lessonId: string;
}

const PAIR_COUNT = 6;

export default function MatchGame({ vocab, lessonId }: MatchGameProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'round-done' | 'done'>('ready');
  const [elapsed, setElapsed] = useState(0);
  const [highscore, setHighscore] = useState<number | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [round, setRound] = useState(0);
  const [roundElapsed, setRoundElapsed] = useState(0);
  const shuffledVocabRef = useRef<VocabCard[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const totalElapsedRef = useRef(0);
  const storageKey = `match-hs-${lessonId}`;

  const totalRounds = Math.ceil(vocab.length / PAIR_COUNT);

  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v) setHighscore(parseInt(v));
    } catch { /* ignore */ }
  }, [storageKey]);

  function buildCards(pairs: VocabCard[]): Card[] {
    const result: Card[] = [];
    pairs.forEach(v => {
      result.push({ id: `w-${v.id}`, content: v.zh, type: 'word', pairId: v.id });
      result.push({ id: `m-${v.id}`, content: v.vn, type: 'meaning', pairId: v.id });
    });
    return shuffle(result);
  }

  function beginRound(roundIndex: number) {
    const sv = shuffledVocabRef.current;
    const pairs = sv.slice(roundIndex * PAIR_COUNT, (roundIndex + 1) * PAIR_COUNT);
    setCards(buildCards(pairs));
    setSelected(null);
    setMatched(new Set());
    setWrong(null);
    setElapsed(0);
    startRef.current = Date.now();
    setGameState('playing');
  }

  function startGame() {
    shuffledVocabRef.current = shuffle([...vocab]);
    totalElapsedRef.current = 0;
    setRound(0);
    setIsNewRecord(false);
    beginRound(0);
  }

  function nextRound() {
    const next = round + 1;
    setRound(next);
    beginRound(next);
  }

  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  function selectCard(card: Card) {
    if (gameState !== 'playing') return;
    if (matched.has(card.pairId)) return;
    if (wrong) return;
    if (card.id === selected) { setSelected(null); return; }

    if (!selected) { setSelected(card.id); return; }

    const selCard = cards.find(c => c.id === selected)!;

    if (selCard.pairId === card.pairId && selCard.type !== card.type) {
      const next = new Set(matched);
      next.add(card.pairId);
      setMatched(next);
      setSelected(null);

      const totalPairs = cards.length / 2;
      if (next.size >= totalPairs) {
        const rt = Math.floor((Date.now() - startRef.current) / 1000);
        setElapsed(rt);
        setRoundElapsed(rt);
        totalElapsedRef.current += rt;

        if (round + 1 >= totalRounds) {
          const finalTime = totalElapsedRef.current;
          setGameState('done');
          try {
            const stored = localStorage.getItem(storageKey);
            const hs = stored ? parseInt(stored) : null;
            if (!hs || finalTime < hs) {
              localStorage.setItem(storageKey, String(finalTime));
              setHighscore(finalTime);
              setIsNewRecord(true);
            }
          } catch { /* ignore */ }
        } else {
          setGameState('round-done');
        }
      }
    } else {
      setWrong([selected, card.id]);
      setSelected(null);
      setTimeout(() => setWrong(null), 700);
    }
  }

  const fmt = (s: number) => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
  const totalPairs = cards.length / 2;
  const currentRoundPairs = Math.min(PAIR_COUNT, vocab.length - round * PAIR_COUNT);

  // ── Ready ────────────────────────────────────────────────────────────────────
  if (gameState === 'ready') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, padding: '48px 24px', width: 'min(440px,100%)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 40, fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>配对</div>
        <div style={{ fontSize: 13, color: 'var(--ash)', marginTop: 6 }}>
          Ghép từ với nghĩa đúng · {vocab.length} từ
          {totalRounds > 1 && ` · ${totalRounds} vòng`}
        </div>
      </div>
      {highscore !== null && (
        <div style={{ background: 'var(--gold-light)', border: '1px solid var(--gold)', borderRadius: 10, padding: '14px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--gold)', marginBottom: 4 }}>🏆 Kỷ lục tốt nhất</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>{fmt(highscore)}</div>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--ash-light)', textAlign: 'center', lineHeight: 1.6 }}>
        Chọn 1 thẻ từ và 1 thẻ nghĩa khớp nhau.<br />
        Ghép đúng = thẻ biến mất. Ghép sai = thử lại.
        {totalRounds > 1 && <><br />Hoàn thành cả {totalRounds} vòng để học toàn bộ {vocab.length} từ.</>}
      </div>
      <button onClick={startGame} style={{
        width: '100%', maxWidth: 280, padding: '14px', background: 'var(--gold)', color: 'white',
        border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer',
      }}>Bắt đầu →</button>
    </div>
  );

  // ── Round Done ───────────────────────────────────────────────────────────────
  if (gameState === 'round-done') {
    const remaining = totalRounds - round - 1;
    const remainingWords = vocab.length - (round + 1) * PAIR_COUNT;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '40px 24px', width: 'min(440px,100%)' }}>
        <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 48, fontWeight: 700, color: 'var(--gold)', textAlign: 'center' }}>好！</div>
        <div style={{ fontSize: 15, color: 'var(--ash)', textAlign: 'center' }}>
          Vòng {round + 1}/{totalRounds} hoàn thành
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 28px', textAlign: 'center', width: '100%' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{fmt(roundElapsed)}</div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)', marginTop: 4 }}>Thời gian vòng này</div>
        </div>
        {/* Overall progress dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: totalRounds }, (_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i <= round ? 'var(--gold)' : 'var(--border)',
            }} />
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ash-light)', textAlign: 'center' }}>
          Còn {remaining} vòng · {remainingWords} từ chưa học
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={() => setGameState('ready')} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>← Menu</button>
          <button onClick={nextRound} style={{ flex: 1, padding: '12px', background: 'var(--gold)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Vòng tiếp →</button>
        </div>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  if (gameState === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '40px 24px', width: 'min(440px,100%)' }}>
      <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 48, fontWeight: 700, color: 'var(--gold)', textAlign: 'center', lineHeight: 1.1 }}>
        {isNewRecord ? '🏆' : '完成！'}
      </div>
      {isNewRecord && (
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>Kỷ lục mới!</div>
      )}
      {totalRounds > 1 && (
        <div style={{ fontSize: 13, color: 'var(--ash)', textAlign: 'center' }}>
          Đã học toàn bộ {vocab.length} từ trong {totalRounds} vòng!
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%' }}>
        {[
          [totalRounds > 1 ? 'Tổng thời gian' : 'Thời gian', fmt(totalElapsedRef.current), 'var(--gold)'],
          ['Kỷ lục', highscore !== null ? fmt(highscore) : '--', 'var(--ash)'],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ash-light)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button onClick={() => setGameState('ready')} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>← Menu</button>
        <button onClick={startGame} style={{ flex: 1, padding: '12px', background: 'var(--gold)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Chơi lại</button>
      </div>
    </div>
  );

  // ── Playing ─────────────────────────────────────────────────────────────────
  const cols = currentRoundPairs <= 3 ? 3 : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: 'min(680px,100%)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>
          ⏱ {fmt(elapsed)}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ash)' }}>
          {totalRounds > 1 ? `Vòng ${round + 1}/${totalRounds} · ` : ''}{matched.size}/{totalPairs} cặp
        </div>
        {highscore !== null && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash-light)' }}>
            🏆 {fmt(highscore)}
          </div>
        )}
      </div>

      {/* Overall progress (multi-round) */}
      {totalRounds > 1 && (
        <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--gold)', opacity: 0.35,
            width: `${((round * PAIR_COUNT + (matched.size / totalPairs) * currentRoundPairs) / vocab.length) * 100}%`,
            transition: 'width 0.4s',
          }} />
        </div>
      )}

      {/* Round progress */}
      <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--gold)', width: `${(matched.size / totalPairs) * 100}%`, transition: 'width 0.4s' }} />
      </div>

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, width: '100%' }}>
        {cards.map(card => {
          const isMatched = matched.has(card.pairId);
          const isSelected = selected === card.id;
          const isWrong = wrong?.includes(card.id) ?? false;

          let borderColor = 'var(--border)';
          let bgColor = 'var(--card-bg)';
          let textColor = 'var(--ink)';
          if (isMatched) { borderColor = 'transparent'; bgColor = 'transparent'; textColor = 'transparent'; }
          else if (isSelected) { borderColor = 'var(--gold)'; bgColor = 'var(--gold-light)'; textColor = 'var(--gold)'; }
          else if (isWrong) { borderColor = 'var(--red)'; bgColor = 'var(--red-light)'; textColor = 'var(--red)'; }

          return (
            <button
              key={card.id}
              onClick={() => selectCard(card)}
              disabled={isMatched}
              style={{
                padding: '10px 6px',
                minHeight: card.type === 'word' ? 80 : 68,
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
                background: bgColor,
                cursor: isMatched ? 'default' : 'pointer',
                fontSize: card.type === 'word' ? 22 : 12,
                fontFamily: card.type === 'word' ? 'Noto Serif SC, serif' : 'Be Vietnam Pro, sans-serif',
                fontWeight: card.type === 'word' ? 700 : 500,
                color: textColor,
                textAlign: 'center',
                lineHeight: 1.3,
                transition: 'all 0.2s',
                opacity: isMatched ? 0 : 1,
                transform: isMatched ? 'scale(0.85)' : isWrong ? 'scale(0.95)' : isSelected ? 'scale(1.03)' : 'scale(1)',
                pointerEvents: isMatched ? 'none' : 'auto',
                userSelect: 'none',
              }}
            >
              {card.content}
            </button>
          );
        })}
      </div>

      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash-light)', textAlign: 'center' }}>
        Chọn một thẻ từ và một thẻ nghĩa · {totalPairs - matched.size} cặp còn lại
      </div>
    </div>
  );
}
