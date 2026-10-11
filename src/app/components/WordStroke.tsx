'use client';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';

declare global { interface Window { HanziWriter: HanziWriterStatic } }
interface HanziWriterStatic {
  create(el: HTMLElement, char: string, opts: Record<string, unknown>): { animateCharacter(): void };
}

let _hwPromise: Promise<HanziWriterStatic> | null = null;
function loadHW(): Promise<HanziWriterStatic> {
  if (_hwPromise) return _hwPromise;
  _hwPromise = new Promise<HanziWriterStatic>((resolve, reject) => {
    if (window.HanziWriter) return resolve(window.HanziWriter);
    const existing = document.getElementById('hanzi-writer-js');
    if (existing) { existing.addEventListener('load', () => resolve(window.HanziWriter)); return; }
    const s = document.createElement('script');
    s.id = 'hanzi-writer-js';
    s.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js';
    s.onload = () => resolve(window.HanziWriter);
    s.onerror = () => { s.remove(); reject(new Error('HanziWriter unavailable')); };
    document.head.appendChild(s);
  }).catch(error => { _hwPromise = null; throw error; });
  return _hwPromise;
}

export function CharStroke({ char, size = 72, charData }: { char: string; size?: number; charData: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const writerRef = useRef<{ animateCharacter(): void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    writerRef.current = null;
    (async () => {
      if (cancelled || !ref.current) return;
      const HW = await loadHW().catch(() => null);
      if (!HW) return;
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
  }, [char, size, charData]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div ref={ref} style={{ width: size, height: size }} />
      <button
        onClick={e => { e.stopPropagation(); writerRef.current?.animateCharacter(); }}
        title={t.lesson.flashcard.replayStrokes}
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

export default function WordStroke({ text, cardId }: { text: string; cardId: string }) {
  const chars = [...text].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
  const key = chars.join('');
  // One request for the whole word; null = not in the DB (HanziWriter then uses its CDN).
  const [strokes, setStrokes] = useState<{ key: string; data: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/strokes?chars=${encodeURIComponent(key)}`)
      .then(r => (r.ok ? r.json() : { strokes: {} }))
      .catch(() => ({ strokes: {} }))
      .then(d => { if (!cancelled) setStrokes({ key, data: d.strokes ?? {} }); });
    return () => { cancelled = true; };
  }, [key]);
  if (chars.length === 0 || strokes?.key !== key) return null;
  const size = chars.length > 3 ? 56 : chars.length > 2 ? 64 : 72;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {chars.map((c, i) => <CharStroke key={`${cardId}-${i}-${c}`} char={c} size={size} charData={strokes.data[c] ?? null} />)}
    </div>
  );
}

