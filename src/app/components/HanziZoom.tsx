'use client';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import HanziModal, { type HanziInfo, type HanziNote } from './HanziModal';
import NoteModal from './NoteModal';
import { t } from '@/i18n';

/** Shared trigger. All lookup and display logic lives in HanziModal. */
export default function HanziZoom({ text, children, ...info }: HanziInfo & { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<HanziNote | null>(null);
  if (!/\p{Script=Han}/u.test(text)) return <>{children ?? text}</>;
  const show = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };
  return <>
    <span role="button" tabIndex={0} className="hanzi-zoom-trigger"
      title={t.common.hanziZoom.open} aria-label={t.common.hanziZoom.openText(text)}
      onClick={show} onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') show(e); }}>
      {children ?? text}
    </span>
    {open && <HanziModal key={text} text={text} {...info} onClose={() => setOpen(false)} onSaveNote={setNote} />}
    {note && createPortal(<div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <NoteModal word={note} onClose={() => setNote(null)} />
    </div>, document.body)}
  </>;
}
