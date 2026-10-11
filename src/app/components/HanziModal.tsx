'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SearchResultDTO } from '@/types/api';
import { canSpeakChinese, speakChinese } from '@/lib/speech';
import CharacterDetails from './CharacterDetails';
import { LoadingIndicator } from './LoadingIndicator';
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
    const syncPanelTop = () => {
      const headerBottom = [...document.querySelectorAll<HTMLElement>('#app-main header')]
        .map(header => ({ header, rect: header.getBoundingClientRect() }))
        .filter(({ header, rect }) => {
          const position = window.getComputedStyle(header).position;
          return (position === 'fixed' || position === 'sticky') && rect.top <= 1 && rect.bottom > 0;
        })
        .reduce((bottom, { rect }) => Math.max(bottom, rect.bottom), 0);
      dialog.style.setProperty('--hanzi-panel-top', `${Math.ceil(headerBottom)}px`);
    };
    dialog.show();
    syncPanelTop();
    window.addEventListener('resize', syncPanelTop);
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new CustomEvent('hsk:hanzi-panel', { detail: { open: true } }));
    return () => {
      window.removeEventListener('resize', syncPanelTop);
      dialog.close();
      window.dispatchEvent(new CustomEvent('hsk:hanzi-panel', { detail: { open: false } }));
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
          <h2 id={titleId}><span aria-hidden="true">字</span>{t.common.hanziZoom.title}</h2>
          <button className="hanzi-zoom-close" type="button" onClick={onClose} aria-label={t.common.hanziZoom.close}>×</button>
        </header>
        <div className="hanzi-zoom-scroll">
          <section className="hanzi-zoom-summary" aria-label={text}>
            <div className="hanzi-zoom-characters" lang="zh" style={{ fontSize: size }}>
              {[...text].map((char, i) => <span key={i}>{char}</span>)}
            </div>
            <dl className="hanzi-zoom-word-info">
              {displayPinyin && <div><dt>{t.common.hanziZoom.pinyin}</dt><dd className="hanzi-zoom-pinyin">{displayPinyin}</dd></div>}
              {displayMeaning && <div className="hanzi-zoom-meaning"><dt>{t.common.hanziZoom.meaning}</dt><dd>{displayMeaning}</dd></div>}
              {definition && <div><dt>{t.common.hanziZoom.definition}</dt><dd>{definition}</dd></div>}
              {hsk != null && <div><dt>{t.common.hanziZoom.level}</dt><dd><span className="hanzi-zoom-level">HSK {hsk}</span></dd></div>}
            </dl>
            {lookupState === 'loading' && <LoadingIndicator variant="inline" label={t.reading.word.lookingUp} />}
            {lookupState === 'error' && <p className="hanzi-zoom-status" role="status">{t.shell.sidebar.search.error}</p>}
            {shouldLookup && lookupState === 'done' && !displayMeaning && !definition && <p className="hanzi-zoom-status">{t.shell.sidebar.search.noResults}</p>}
            <div className="hanzi-modal-actions hanzi-modal-primary-actions">
              {canSpeakChinese() && <button className="hanzi-action-primary" type="button" onClick={() => speakChinese(text)}><span aria-hidden="true">🔊</span> {t.common.speak}</button>}
              <button type="button" onClick={() => {
                onSaveNote({ zh: text, py: displayPinyin, vn: displayMeaning || definition || '', pos: result?.pos ?? '', sourceLessonId });
                onClose();
              }}>{t.common.saveToNotes}</button>
            </div>
          </section>

          <section className="hanzi-zoom-display-options">
            <h3>{t.common.hanziZoom.display}</h3>
            <label className="hanzi-zoom-size">
              <span>{t.common.hanziZoom.size}</span>
              <input type="range" min={64} max={240} step={8} value={size} onChange={e => setSize(Number(e.target.value))} />
              <output>{size}px</output>
            </label>
          </section>

          {!!chars.length && <section className="hanzi-zoom-detail-shell">
            <div className="hanzi-zoom-section-heading">
              <div>
                <h3>{t.common.hanziZoom.details}</h3>
                <p>{t.common.hanziZoom.detailsHint}</p>
              </div>
              <div className="hanzi-character-picker">{chars.map(char => <button key={char} type="button" aria-pressed={selectedChar === char}
                onClick={() => setSelectedChar(char)}>{char}</button>)}</div>
            </div>
            {selectedChar && <CharacterDetails key={selectedChar} char={selectedChar} />}
          </section>}
        </div>
      </div>
    </dialog>, document.body,
  );
}
