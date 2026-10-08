'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HanziZoom from '@/app/components/HanziZoom';
import NoteModal from '@/app/components/NoteModal';
import { speakChinese } from '@/lib/speech';
import type { SearchResultDTO } from '@/types/api';
import { t } from '@/i18n';

export interface ReadingWord { hanzi: string; pinyin: string; hsk: number | null; definition: string | null }

export default function WordTranslationPopup({ word, anchor, onClose }: {
  word: ReadingWord; anchor: HTMLElement; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<SearchResultDTO | null>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [noteOpen, setNoteOpen] = useState(false);
  const [position] = useState(() => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    return { left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 332)), width };
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(word.hanzi)}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Lookup failed'); return r.json(); })
      .then((data: { results?: SearchResultDTO[] }) => {
        if (controller.signal.aborted) return;
        setResult(data.results?.find(item => item.zh === word.hanzi) ?? null);
        setStatus('done');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [word.hanzi]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (noteOpen || document.querySelector('dialog[open]')) return;
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !anchor.contains(event.target)) onClose();
    }
    function reposition() { if (!noteOpen && !document.querySelector('dialog[open]')) onClose(); }
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition);
    };
  }, [anchor, onClose, noteOpen]);

  const meaning = result?.vn || word.definition || '';
  return createPortal(<>
    <div ref={ref} role="dialog" aria-label={t.reading.word.translation(word.hanzi)}
      className="reading-word-popup" style={{ ...position, position: 'fixed', zIndex: 150 }}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { onClose(); anchor.focus(); } }}>
      <div className="reading-word-popup-header">
        <strong lang="zh">{word.hanzi}</strong>
        <HanziZoom text={word.hanzi} pinyin={word.pinyin} meaning={result?.vn} definition={word.definition ?? undefined} hsk={word.hsk ?? undefined}>
          <span title={t.common.hanziZoom.open} aria-label={t.common.hanziZoom.open}>⛶</span>
        </HanziZoom>
        <button type="button" autoFocus onClick={() => { onClose(); anchor.focus(); }} aria-label={t.common.hanziZoom.close}>×</button>
      </div>
      <div className="reading-word-popup-pinyin">{word.pinyin || result?.py}</div>
      {status === 'loading' && <p role="status">{t.reading.word.lookingUp}</p>}
      {status === 'error' && <p role="status">{t.shell.sidebar.search.error}</p>}
      {result?.pos && <small>{result.pos}</small>}
      {result?.vn && <p>{result.vn}</p>}
      {word.definition && <p className="reading-word-popup-definition">{word.definition}</p>}
      {status === 'done' && !meaning && <p>{t.shell.sidebar.search.noResults}</p>}
      {word.hsk != null && <small>HSK {word.hsk}</small>}
      <div className="reading-word-popup-actions">
        <button type="button" onClick={() => speakChinese(word.hanzi)} aria-label={t.reading.word.speakAria(word.hanzi)}>🔊 {t.common.speak}</button>
        <button type="button" onClick={() => setNoteOpen(true)}>{t.common.saveToNotes}</button>
      </div>
    </div>
    {noteOpen && <div onKeyDown={e => e.stopPropagation()}><NoteModal word={{ zh: word.hanzi, py: word.pinyin || result?.py || '', vn: meaning, pos: result?.pos ?? '' }} onClose={() => setNoteOpen(false)} /></div>}
  </>, document.body);
}
