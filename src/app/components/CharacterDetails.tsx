'use client';
import { useEffect, useState } from 'react';
import type { CharacterDetailDTO } from '@/types/api';
import { frequencyLabel } from '@/shared/hanzi';
import { CharStroke } from './WordStroke';
import { t } from '@/i18n';

/** Detail content inside HanziModal, never a second popup. Remount when char changes. */
export default function CharacterDetails({ char }: { char: string }) {
  const [data, setData] = useState<CharacterDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/kanji/${encodeURIComponent(char)}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [char]);
  if (loading) return <p role="status">{t.common.loading}</p>;
  if (!data) return <p>{t.lesson.kanjiPanel.noData}</p>;
  const labels = t.lesson.kanjiPanel;
  const fields = [
    [labels.fields.radical, data.radical], [labels.fields.strokes, data.strokes != null ? labels.strokeCount(data.strokes) : null],
    [labels.fields.lucthu, data.lucthu], [labels.fields.hinhthai, data.hinhthai],
    [labels.fields.netbut, data.netbut], [labels.fields.popular, frequencyLabel(data.popular)],
  ];
  return <section className="hanzi-modal-details">
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center' }}>
      <div><strong lang="zh" style={{ fontSize: 48 }}>{char}</strong><p>{data.pinyin}</p><p>{data.cnVi}</p></div>
      <CharStroke char={char} size={140} charData={data.strokesSvg} />
    </div>
    {data.pos && <p>{data.pos}</p>}
    <dl className="hanzi-modal-fields">{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}</dl>
    {!!data.botu?.length && <div>
      <h3>{labels.botuHeading} {data.botuSource === 'claude' && <small>{labels.aiSourceBadge}</small>}</h3>
      {data.botu.map((part, i) => <p key={i}><strong lang="zh">{part.ph}</strong> · {t.lesson.botu.long[part.t === 'solo' ? 'doc' : part.t]} · {part.n}</p>)}
    </div>}
    {!!data.meansTdpt.length && <><h3>{labels.meaningHeading}</h3><ol>{data.meansTdpt.map((mean, i) => <li key={i}>{mean}</li>)}</ol></>}
    {!!data.meansTdtd.length && <details>
      <summary style={{ cursor: 'pointer' }}>{t.common.hanziZoom.fullDictionary}</summary>
      {data.meansTdtd.map((mean, i) => <p key={i} style={{ whiteSpace: 'pre-line' }}>{mean.replace(/\\n/g, '\n')}</p>)}
    </details>}
    {!!data.meansTg.length && <><h3>{labels.compoundsHeading}</h3><p>{data.meansTg.join(' · ')}</p></>}
  </section>;
}
