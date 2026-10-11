'use client';
import { useState } from 'react';
import type { VocabSense } from '@/types';
import { t } from '@/i18n';

export function WordMeanings({ senses, meaning, pos }: { senses?: VocabSense[]; meaning: string; pos?: string }) {
  const [expanded, setExpanded] = useState(false);
  const entries = senses?.length ? senses : [{ id: 0, meaning, pos: pos ?? '' }];
  return <div>
    {(expanded ? entries : entries.slice(0, 2)).map(entry => <div key={entry.id} style={{ marginTop: 4 }}>
      {entry.pos && <div style={{ fontSize: 11, color: 'var(--ash)' }}>{entry.pos}</div>}
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{entry.meaning}</div>
    </div>)}
    {entries.length > 2 && <button type="button" aria-expanded={expanded}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setExpanded(value => !value); }}
      style={{ marginTop: 8, border: 0, padding: '4px 0', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>
      {expanded ? t.vocab.meanings.less : t.vocab.meanings.more(entries.length - 2)}
    </button>}
  </div>;
}
