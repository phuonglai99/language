'use client';
import { useEffect, useState } from 'react';
import type { CharacterDetailDTO } from '@/types/api';
import { frequencyLabel } from '@/shared/hanzi';
import { CharStroke } from './WordStroke';
import { LoadingIndicator } from './LoadingIndicator';
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
  if (loading) return <LoadingIndicator variant="inline" label={t.common.loading} />;
  if (!data) return <p>{t.lesson.kanjiPanel.noData}</p>;
  const labels = t.lesson.kanjiPanel;
  const fields = [
    [labels.fields.radical, data.radical], [labels.fields.strokes, data.strokes != null ? labels.strokeCount(data.strokes) : null],
    [labels.fields.lucthu, data.lucthu], [labels.fields.hinhthai, data.hinhthai],
    [labels.fields.netbut, data.netbut], [labels.fields.popular, frequencyLabel(data.popular)],
  ];
  return <div className="hanzi-modal-details">
    <div className="hanzi-character-overview">
      <div className="hanzi-character-reading">
        <strong lang="zh">{char}</strong>
        {data.pinyin && <p className="hanzi-character-pinyin">{data.pinyin}</p>}
        {data.cnVi && <p className="hanzi-character-sino">{data.cnVi}</p>}
      </div>
      <div className="hanzi-character-stroke"><CharStroke char={char} size={140} charData={data.strokesSvg} /></div>
    </div>
    {data.pos && <p className="hanzi-character-pos">{data.pos}</p>}
    <dl className="hanzi-modal-fields">{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}</dl>
    {!!data.botu?.length && <section className="hanzi-detail-section">
      <h3>{labels.botuHeading} {data.botuSource === 'claude' && <small>{labels.aiSourceBadge}</small>}</h3>
      <ul className="hanzi-breakdown-list">{data.botu.map((part, i) => <li key={i}><strong lang="zh">{part.ph}</strong><span>{t.lesson.botu.long[part.t === 'solo' ? 'doc' : part.t]}</span><p>{part.n}</p></li>)}</ul>
    </section>}
    {!!data.meansTdpt.length && <section className="hanzi-detail-section">
      <h3>{labels.meaningHeading}</h3>
      <ul className="hanzi-meaning-list">{data.meansTdpt.map((mean, i) => <li key={i}>
        <span>{mean}</span>
        {data.meaningPartsOfSpeech[i] && <small>{data.meaningPartsOfSpeech[i]}</small>}
      </li>)}</ul>
    </section>}
    {!!data.meansTdtd.length && <details className="hanzi-dictionary-details">
      <summary style={{ cursor: 'pointer' }}>{t.common.hanziZoom.fullDictionary}</summary>
      <div>{data.meansTdtd.map((mean, i) => <p key={i} style={{ whiteSpace: 'pre-line' }}>{mean.replace(/\\n/g, '\n')}</p>)}</div>
    </details>}
    {!!data.meansTg.length && <section className="hanzi-detail-section">
      <h3>{labels.compoundsHeading}</h3>
      <div className="hanzi-compound-list">{data.meansTg.map((compound, i) => <span key={i}>{compound}</span>)}</div>
    </section>}
  </div>;
}
