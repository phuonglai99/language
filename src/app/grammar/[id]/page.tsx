'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Lesson, GrammarPoint, Exercise, Comparison } from '@/types';

function ExerciseItem({ ex, idx }: { ex: Exercise; idx: number }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [fillVal, setFillVal] = useState('');
  const [revealed, setRevealed] = useState(false);
  const done = chosen !== null || revealed;
  const correct = done ? (ex.type === 'choice' ? chosen === ex.answer : fillVal.trim() === ex.answer) : null;

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 10 }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 8 }}>Bài {idx + 1}</div>
      <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 16, color: 'var(--ink)', marginBottom: 14, lineHeight: 1.6 }}>{ex.question}</div>

      {ex.type === 'choice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(ex.options || []).map(opt => {
            const isCorrect = opt === ex.answer;
            const isChosen = opt === chosen;
            let bg = 'var(--paper-alt)', border = 'var(--border)', color = 'var(--ink)';
            if (done) {
              if (isCorrect) { bg = 'var(--green-light)'; border = 'var(--green)'; color = 'var(--green)'; }
              else if (isChosen) { bg = 'var(--red-light)'; border = 'var(--red)'; color = 'var(--red)'; }
            }
            return (
              <button key={opt} disabled={!!done} onClick={() => setChosen(opt)}
                style={{ padding: '10px 14px', border: `1.5px solid ${border}`, borderRadius: 6, background: bg, color, cursor: done ? 'default' : 'pointer', fontSize: 14, fontFamily: 'Noto Serif SC, serif', textAlign: 'left', fontWeight: 600 }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {ex.type === 'fill' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={fillVal} onChange={e => setFillVal(e.target.value)} disabled={revealed}
            placeholder="Điền câu trả lời..."
            style={{ flex: 1, padding: '9px 14px', border: `1.5px solid ${revealed ? (correct ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, borderRadius: 6, background: revealed ? (correct ? 'var(--green-light)' : 'var(--red-light)') : 'var(--paper-alt)', color: 'var(--ink)', fontSize: 15, fontFamily: 'Noto Serif SC, serif', outline: 'none' }}
          />
          {!revealed && <button onClick={() => setRevealed(true)} style={{ padding: '9px 16px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 13, color: 'var(--ash)' }}>Kiểm tra</button>}
        </div>
      )}

      {done && ex.explanation && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--gold-light)', borderRadius: 5, fontSize: 12.5, color: 'var(--gold)' }}>
          💡 {ex.explanation}
          {!correct && ex.type === 'fill' && <span> — Đáp án: <strong style={{ fontFamily: 'Noto Serif SC, serif' }}>{ex.answer}</strong></span>}
        </div>
      )}
    </div>
  );
}

function ComparisonCard({ c }: { c: Comparison }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {[{ zh: c.wordA, py: c.pinyinA, vn: c.meaningA, ex: c.exA }, { zh: c.wordB, py: c.pinyinB, vn: c.meaningB, ex: c.exB }].map((w, i) => (
          <div key={i} style={{ padding: '16px 18px', background: i === 0 ? 'var(--gold-light)' : 'var(--blue-light)', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{w.zh}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: i === 0 ? 'var(--gold)' : 'var(--blue)', marginBottom: 4 }}>{w.py}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>{w.vn}</div>
            <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>{w.ex.zh}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ash)', fontStyle: 'italic' }}>{w.ex.vn}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 18px', background: 'var(--paper-alt)', fontSize: 12.5, color: 'var(--ash)', borderTop: '1px solid var(--border)' }}>💡 {c.tip}</div>
    </div>
  );
}

function GrammarSection({ g, open, onToggle, sectionRef }: { g: GrammarPoint; open: boolean; onToggle: () => void; sectionRef?: (el: HTMLDivElement | null) => void }) {
  return (
    <div ref={sectionRef} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden', background: 'var(--card-bg)' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '18px 22px', background: open ? 'var(--primary-light)' : 'var(--card-bg)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, textAlign: 'left' }}>
        <div>
          <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 17, fontWeight: 700, color: open ? 'var(--primary)' : 'var(--ink)', marginBottom: 2 }}>{g.title}</div>
          <div style={{ fontSize: 12, color: open ? 'var(--primary)' : 'var(--ash)' }}>{g.titleVn}</div>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: open ? 'var(--primary)' : 'var(--ash-light)', flexShrink: 0, marginTop: 2 }}>{open ? '−' : '+'}</div>
      </button>

      {open && (
        <div style={{ padding: '0 22px 22px', borderTop: '1px solid var(--border)' }}>
          <div style={{ margin: '18px 0 14px', padding: '12px 18px', background: 'var(--red-light)', border: '1px solid var(--red)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--red)', fontWeight: 500, letterSpacing: '0.04em' }}>
            {g.formula}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-soft)', marginBottom: 16 }}>{g.explanation}</p>

          {g.examples.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 10 }}>Ví dụ</div>
              {g.examples.map((ex, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 15, color: 'var(--ink)', marginBottom: 3 }}>{ex.zh}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ash)', fontStyle: 'italic', marginBottom: ex.note ? 3 : 0 }}>{ex.vn}</div>
                  {ex.note && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>📌 {ex.note}</div>}
                </div>
              ))}
            </div>
          )}

          {g.comparisons && g.comparisons.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 10 }}>So sánh từ dễ nhầm</div>
              {g.comparisons.map((c, i) => <ComparisonCard key={i} c={c} />)}
            </div>
          )}

          {g.exercises.length > 0 && (
            <div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 10 }}>Bài tập</div>
              {g.exercises.map((ex, i) => <ExerciseItem key={ex.id} ex={ex} idx={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GrammarPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [search, setSearch] = useState('');
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetch(`/api/lessons/${id}`).then(r => r.json()).then(d => setLesson(d.lesson));
  }, [id]);

  function goToSection(i: number) {
    setOpenIdx(i);
    setTimeout(() => {
      sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  const q = search.trim().toLowerCase();
  const filtered = lesson ? (q ? lesson.grammar.filter(g =>
    g.title.toLowerCase().includes(q) || g.titleVn.toLowerCase().includes(q)
  ) : lesson.grammar) : [];

  if (!lesson) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--ash)' }}>Đang tải...</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      {/* ── HEADER ── */}
      <header style={{ background: '#1e3a8a', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>← Về</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lesson.title}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
              {lesson.grammar.length} điểm ngữ pháp · {lesson.level}
            </div>
          </div>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setOpenIdx(null); }}
              placeholder="Tìm ngữ pháp…"
              style={{ padding: '7px 12px 7px 30px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, color: '#fff', fontSize: 12, fontFamily: 'Be Vietnam Pro, sans-serif', outline: 'none', width: 160 }}
            />
          </div>
          <Link href={`/lesson/${id}`} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 20,
            background: '#e5484d', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            flexShrink: 0, transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#c0392b')}
            onMouseLeave={e => (e.currentTarget.style.background = '#e5484d')}>
            <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 15 }}>卡</span> Flashcard
          </Link>
        </div>
      </header>

      {/* ── GRAMMAR POINT PILLS ── */}
      {filtered.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 64, zIndex: 40, overflowX: 'auto' }}>
          <div style={{ padding: '10px 24px', display: 'flex', gap: 8, maxWidth: 900, margin: '0 auto' }}>
            {filtered.map((g, i) => (
              <button key={g.id} onClick={() => goToSection(i)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none',
                  background: openIdx === i ? 'var(--primary)' : '#f3f4f6',
                  color: openIdx === i ? '#fff' : '#374151',
                  fontSize: 12, fontWeight: openIdx === i ? 700 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'all 0.15s',
                }}>
                {g.titleVn || g.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
        {filtered.map((g, i) => (
          <GrammarSection
            key={g.id} g={g}
            open={openIdx === i}
            onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            sectionRef={el => { sectionRefs.current[i] = el; }}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ash)' }}>
            <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 48, color: 'var(--border)', marginBottom: 12 }}>文</div>
            <p>{q ? `Không tìm thấy ngữ pháp nào khớp với "${search}"` : 'Không có điểm ngữ pháp nào được trích xuất từ bài này.'}</p>
          </div>
        )}
      </main>
    </div>
  );
}
