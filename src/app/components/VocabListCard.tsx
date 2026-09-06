'use client';
import { useState } from 'react';
import Link from 'next/link';

export interface VocabListCardData {
  zh: string;
  py: string;
  pos?: string;
  vn: string;
  ex?: { zh?: string; vn?: string };
  lessonBadge?: string;
}

interface VocabListCardProps {
  item: VocabListCardData;
  accent?: string;
  num?: number;
  href?: string;
  onClick?: () => void;
  onSpeak?: (zh: string) => void;
  extra?: React.ReactNode;
}

function defaultSpeak(text: string) {
  if (typeof window === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function VocabListCard({ item, accent = '#3b82f6', num, href, onClick, onSpeak, extra }: VocabListCardProps) {
  const [hovered, setHovered] = useState(false);
  const speak = onSpeak ?? defaultSpeak;

  const inner = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        background: 'var(--card-bg)',
        borderRadius: 14,
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.1)' : '0 1px 6px rgba(0,0,0,0.06)',
        border: `1.5px solid ${hovered ? accent : 'var(--border)'}`,
        transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
        transform: hovered ? 'translateY(-1px)' : 'none',
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 16,
        cursor: onClick || href ? 'pointer' : 'default',
      }}>
      {/* Index number */}
      {num !== undefined && (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash-light)', width: 22, textAlign: 'right', flexShrink: 0 }}>{num}</span>
      )}

      {/* Chinese + Pinyin */}
      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, textAlign: 'left' }}>
        <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 34, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{item.zh}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: accent, marginTop: 4, fontWeight: 500 }}>{item.py}</div>
      </div>

      {/* Speak button */}
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); speak(item.zh); }}
        title="Phát âm"
        style={{ background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: '50%', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, transition: 'background 0.12s' }}
        onMouseEnter={e => (e.currentTarget.style.background = accent + '22')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--paper-alt)')}>
        🔊
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 44, background: 'var(--border)', flexShrink: 0 }} />

      {/* Meaning */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {item.pos && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ash-light)', marginBottom: 4 }}>{item.pos}</div>
        )}
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{item.vn}</div>
        {item.ex?.zh && <div style={{ fontSize: 12, color: 'var(--ash)', marginTop: 4, fontFamily: 'Noto Serif SC, serif' }}>{item.ex.zh}</div>}
        {item.ex?.vn && <div style={{ fontSize: 11, color: 'var(--ash-light)', marginTop: 2 }}>{item.ex.vn}</div>}
      </div>

      {/* Lesson badge */}
      {item.lessonBadge && (
        <span style={{
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
          color: accent, background: accent + '18',
          padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
          maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis',
          fontWeight: 600, flexShrink: 0, display: 'block',
        }}>
          {item.lessonBadge}
        </span>
      )}

      {/* Extra slot (e.g. note button) */}
      {extra}
    </div>
  );

  if (href) return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>;
  return inner;
}
