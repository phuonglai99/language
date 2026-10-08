'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SearchResultDTO } from '@/types/api';
import { canSpeakChinese, speakChinese } from '@/lib/speech';
import CharacterDetails from './CharacterDetails';
import { t } from '@/i18n';

export interface HanziInfo {
  text: string;
  pinyin?: string;
  meaning?: string;
  definition?: string;
  hsk?: number;
  sourceLessonId?: string;
}
export interface HanziNote { zh: string; py: string; vn: string; pos: string; sourceLessonId?: string; }

/** The shared dictionary + magnifier + character-detail modal for every screen. */
export default function HanziModal({ text, pinyin, meaning, definition, hsk, sourceLessonId, onClose, onSaveNote }: HanziInfo & {
  onClose: () => void; onSaveNote: (word: HanziNote) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [size, setSize] = useState(128);
  const chars = [...new Set([...text].filter(c => /\p{Script=Han}/u.test(c)))];
  const [selectedChar, setSelectedChar] = useState<string | null>(chars.length === 1 ? chars[0] : null);
  const shouldLookup = !meaning && [...text].length <= 32 && /^[\p{Script=Han}·]+$/u.test(text);
  const [result, setResult] = useState<SearchResultDTO | null>(null);
  const [lookupState, setLookupState] = useState<'loading' | 'done' | 'error'>(shouldLookup ? 'loading' : 'done');

  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!shouldLookup) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Search failed'); return r.json(); })
      .then((data: { results?: SearchResultDTO[] }) => {
        if (controller.signal.aborted) return;
        setResult(data.results?.find(word => word.zh === text) ?? null);
        setLookupState('done');
      })
      .catch(() => { if (!controller.signal.aborted) setLookupState('error'); });
    return () => controller.abort();
  }, [text, shouldLookup]);

  const displayPinyin = pinyin || result?.py || '';
  const displayMeaning = meaning || result?.vn || '';
  return createPortal(
    <dialog ref={ref} className="hanzi-zoom-dialog" aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      onKeyDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="hanzi-zoom-panel" onClick={e => e.stopPropagation()}>
        <header className="hanzi-zoom-header">
          <h2 id={titleId}>{t.common.hanziZoom.title}</h2>
          <button type="button" autoFocus onClick={onClose} aria-label={t.common.hanziZoom.close}>×</button>
        </header>
        <div className="hanzi-zoom-characters" lang="zh" style={{ fontSize: size }}>
          {[...text].map((char, i) => <span key={i}>{char}</span>)}
        </div>
        {displayPinyin && <p className="hanzi-zoom-pinyin">{displayPinyin}</p>}
        {lookupState === 'loading' && <p role="status">{t.reading.word.lookingUp}</p>}
        {lookupState === 'error' && <p role="status">{t.shell.sidebar.search.error}</p>}
        {displayMeaning && <p>{displayMeaning}</p>}
        {shouldLookup && lookupState === 'done' && !displayMeaning && !definition && <p>{t.shell.sidebar.search.noResults}</p>}
        {definition && <p style={{ color: 'var(--ash)' }}>{definition}</p>}
        {hsk != null && <p>HSK {hsk}</p>}
        <div className="hanzi-modal-actions">
          {canSpeakChinese() && <button type="button" onClick={() => speakChinese(text)}>🔊 {t.common.speak}</button>}
          <button type="button" onClick={() => {
            onSaveNote({ zh: text, py: displayPinyin, vn: displayMeaning || definition || '', pos: result?.pos ?? '', sourceLessonId });
            onClose();
          }}>{t.common.saveToNotes}</button>
        </div>
        <label className="hanzi-zoom-size">
          {t.common.hanziZoom.size}
          <input type="range" min={64} max={240} step={8} value={size} onChange={e => setSize(Number(e.target.value))} />
        </label>
        {!!chars.length && <>
          <h3>{t.common.hanziZoom.details}</h3>
          <div className="hanzi-modal-actions">{chars.map(char => <button key={char} type="button" aria-pressed={selectedChar === char}
            onClick={() => setSelectedChar(char)}>{char}</button>)}</div>
          {selectedChar && <CharacterDetails key={selectedChar} char={selectedChar} />}
        </>}
      </div>
    </dialog>, document.body,
  );
}
