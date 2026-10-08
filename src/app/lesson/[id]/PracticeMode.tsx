'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t } from '@/i18n';
import { speakChinese } from '@/lib/speech';
import LocalNoteFolderModal from '@/app/components/LocalNoteFolderModal';
import { addLocalNoteItem, getLocalNoteFolder, type LocalNoteFolder } from '@/lib/localNotes';
import type { PracticeAnswerDTO, PracticeBankDTO, PracticeCheckDTO, PracticeQuestionDTO } from '@/types/api';
import {
  buildPracticeQueue, defaultPracticeConfig, emptyPracticeRecord, questionsForConfig,
  readVocabularyPracticeProgress, removeVocabularyPracticeProgress, vocabularyPracticeProgressKey,
  writeVocabularyPracticeProgress, type PracticeConfig, type PracticeCount, type PracticeQueueItem,
  type VocabularyPracticeProgressV1,
} from '@/lib/vocabularyPracticeProgress';

const panel: React.CSSProperties = { width: 'min(720px, 100%)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(18px, 4vw, 32px)' };
const button: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--paper-alt)', color: 'var(--ink)', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 };
const primary: React.CSSProperties = { ...button, background: 'var(--red)', borderColor: 'var(--red)', color: 'white' };
const recordKey = (item: PracticeQueueItem) => item.phase === 'review' ? `${item.questionId}::review` : item.questionId;
const HSK_SOURCES = ['hsk-1', 'hsk-2', 'hsk-3', 'hsk-4', 'hsk-5', 'hsk-6', 'hsk-random'] as const;
type HskPracticeSource = typeof HSK_SOURCES[number];

function initialPracticeSource(lessonId: string): HskPracticeSource {
  return HSK_SOURCES.includes(lessonId as HskPracticeSource) ? lessonId as HskPracticeSource : 'hsk-1';
}

function questionMap(bank: PracticeBankDTO): Map<string, PracticeQuestionDTO> {
  return new Map(bank.questions.map(question => [question.questionId, question]));
}

function issueMessage(issue: NonNullable<PracticeCheckDTO['issues']>[number]): string {
  const expected = issue.expected ? `${issue.expected.base}${issue.expected.tone}` : '—';
  const actual = issue.actual ? `${issue.actual.base}${issue.actual.tone}` : '—';
  if (issue.kind === 'wrong-base') return t.practice.feedback.issue.wrongBase((issue.expectedIndex ?? 0) + 1, actual, expected);
  if (issue.kind === 'wrong-tone') return t.practice.feedback.issue.wrongTone((issue.expectedIndex ?? 0) + 1, issue.actual?.tone ?? 0, issue.expected?.tone ?? 0);
  if (issue.kind === 'missing') return t.practice.feedback.issue.missing((issue.expectedIndex ?? 0) + 1, expected);
  return t.practice.feedback.issue.extra((issue.actualIndex ?? 0) + 1, actual);
}

function SpeakerIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>;
}

function answerCard(answer: PracticeAnswerDTO, onSpeak: () => void) {
  return (
    <div style={{ marginTop: 18, padding: 16, borderRadius: 10, background: 'var(--paper-alt)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{t.practice.answer.heading}</div>
          <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 34, marginTop: 4 }}>{answer.hanzi}</div>
          <div style={{ color: 'var(--red)', fontWeight: 600 }}>{answer.pinyin}</div>
        </div>
        <button type="button" onClick={onSpeak} aria-label={t.practice.actions.speak} title={t.practice.actions.speak}
          style={{ ...button, width: 44, height: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SpeakerIcon />
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 13 }}><strong>{t.practice.answer.numbered}:</strong> {answer.pinyinNumber || '—'}</div>
      <div style={{ marginTop: 4, fontSize: 13 }}><strong>{t.practice.answer.meaning}:</strong> {answer.meaningVi}</div>
      {answer.example.zh && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 13 }}>
        <strong>{t.practice.answer.example}:</strong> {answer.example.zh}
        {answer.example.pinyin && <div style={{ color: 'var(--red)', marginTop: 2 }}>{answer.example.pinyin}</div>}
        {answer.example.vi && <div style={{ color: 'var(--ash)', marginTop: 2 }}>{answer.example.vi}</div>}
      </div>}
    </div>
  );
}

export default function PracticeMode({ lessonId }: { lessonId: string }) {
  const [sourceId, setSourceId] = useState<HskPracticeSource>(() => initialPracticeSource(lessonId));
  const [bank, setBank] = useState<PracticeBankDTO | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [config, setConfig] = useState<PracticeConfig>(defaultPracticeConfig);
  const [progress, setProgress] = useState<VocabularyPracticeProgressV1 | null>(null);
  const [restored, setRestored] = useState(false);
  const [pending, setPending] = useState<'check' | 'reveal' | null>(null);
  const [requestError, setRequestError] = useState('');
  const [formatError, setFormatError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [storageConflict, setStorageConflict] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showNoteFolderModal, setShowNoteFolderModal] = useState(false);
  const [localNotesError, setLocalNotesError] = useState('');
  const composing = useRef(false);
  const compositionEndedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestGeneration = useRef(0);
  const progressRef = useRef<VocabularyPracticeProgressV1 | null>(null);
  const storageConflictRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/lessons/${encodeURIComponent(sourceId)}/practice`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<PracticeBankDTO>;
      })
      .then(data => {
        setBank(data);
        const saved = readVocabularyPracticeProgress(sourceId);
        if (saved) setConfig(saved.config);
        const ids = new Set(data.questions.map(question => question.questionId));
        const membershipValid = saved?.queue.every(item => ids.has(item.questionId));
        if (saved && saved.contentSignature === data.contentSignature && membershipValid && saved.scoringVersion === data.scoringVersion) {
          setProgress(saved);
        } else if (saved && saved.contentSignature === data.contentSignature && membershipValid) {
          const queue = saved.queue.filter(item => item.phase !== 'review' && saved.initialQuestionIds.includes(item.questionId));
          const initialQuestionIds = queue.map(item => item.questionId);
          const records = Object.fromEntries([...new Set(initialQuestionIds)].map(id => [id, { ...emptyPracticeRecord(), draft: saved.records[id]?.draft ?? '' }]));
          setProgress({ ...saved, updatedAt: Date.now(), contentSignature: data.contentSignature, scoringVersion: data.scoringVersion, queue, initialQuestionIds, currentIndex: 0, records });
        } else if (saved) removeVocabularyPracticeProgress(sourceId);
        setRestored(true);
      })
      .catch(error => { if (error instanceof Error && error.name !== 'AbortError') setLoadError(true); });
    return () => controller.abort();
  }, [sourceId, reload]);

  useEffect(() => { progressRef.current = progress; }, [progress]);

  useEffect(() => {
    if (!progress || !restored || storageConflict) return;
    const timeout = window.setTimeout(() => {
      if (!writeVocabularyPracticeProgress(progress)) setStorageFailed(true);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [progress, restored, storageConflict]);

  useEffect(() => {
    const key = vocabularyPracticeProgressKey(sourceId);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) { storageConflictRef.current = true; setStorageConflict(true); }
    };
    const flush = () => {
      const value = progressRef.current;
      if (value && !storageConflictRef.current) writeVocabularyPracticeProgress(value);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('pagehide', flush); flush(); };
  }, [sourceId]);

  const questions = useMemo(() => bank ? questionMap(bank) : new Map<string, PracticeQuestionDTO>(), [bank]);
  const eligible = useMemo(() => bank ? questionsForConfig(bank.questions, config) : [], [bank, config]);
  const availableWords = useMemo(() => new Set(eligible.map(question => question.wordKey)).size, [eligible]);
  const selectedWordLimit = config.count === 'all' ? availableWords : Math.min(config.count, availableWords);
  const estimatedQuestions = useMemo(() => {
    if (!availableWords) return 0;
    const perWord = eligible.reduce((map, question) => map.set(question.wordKey, (map.get(question.wordKey) ?? 0) + 1), new Map<string, number>());
    return [...perWord.values()].sort((a, b) => b - a).slice(0, selectedWordLimit).reduce((sum, value) => sum + value, 0);
  }, [availableWords, eligible, selectedWordLimit]);
  const commonExcluded = (bank?.excluded['sense-missing'] ?? 0) + (bank?.excluded['hanzi-unsupported'] ?? 0);
  const sourceItems = (bank?.counts['hanzi-to-hanzi'] ?? 0) + commonExcluded;
  const noteFolder: LocalNoteFolder | null = config.noteFolderId ? getLocalNoteFolder(config.noteFolderId) : null;

  const startSession = useCallback((nextConfig = config, onlyQuestionIds?: string[]) => {
    if (!bank) return;
    const sessionConfig = nextConfig.autoSaveNotes && getLocalNoteFolder(nextConfig.noteFolderId)
      ? nextConfig
      : { ...nextConfig, autoSaveNotes: false, noteFolderId: '' };
    requestGeneration.current++;
    const source = onlyQuestionIds ? bank.questions.filter(question => onlyQuestionIds.includes(question.questionId)) : bank.questions;
    const built = buildPracticeQueue(source, onlyQuestionIds ? { ...sessionConfig, count: 'all' } : sessionConfig);
    if (!built.queue.length) return;
    const records = Object.fromEntries([...new Set(built.initialQuestionIds)].map(id => [id, emptyPracticeRecord()]));
    const next: VocabularyPracticeProgressV1 = {
      version: 1, lessonId: sourceId, updatedAt: Date.now(), contentSignature: bank.contentSignature,
      scoringVersion: bank.scoringVersion, config: sessionConfig, queue: built.queue,
      initialQuestionIds: built.initialQuestionIds, currentIndex: 0, records,
    };
    storageConflictRef.current = false;
    setPending(null); setProgress(next); setConfig(sessionConfig); setConfirmReset(false); setRequestError(''); setFormatError(''); setStorageConflict(false);
  }, [bank, config, sourceId]);

  const currentItem = progress?.queue[progress.currentIndex];
  const currentQuestion = currentItem ? questions.get(currentItem.questionId) : undefined;
  const currentKey = currentItem ? recordKey(currentItem) : '';
  const currentRecord = progress && currentKey ? progress.records[currentKey] ?? emptyPracticeRecord() : null;
  const finished = !!progress && progress.currentIndex >= progress.queue.length;

  useEffect(() => {
    if (pending == null && currentQuestion && currentRecord?.submission?.status !== 'correct' && !currentRecord?.revealedAnswer) inputRef.current?.focus();
  }, [currentQuestion, currentRecord?.submission?.status, currentRecord?.revealedAnswer, pending]);

  const changeRecord = useCallback((key: string, fn: (record: ReturnType<typeof emptyPracticeRecord>) => ReturnType<typeof emptyPracticeRecord>) => {
    setProgress(previous => {
      if (!previous) return previous;
      const existing = previous.records[key] ?? emptyPracticeRecord();
      return { ...previous, updatedAt: Date.now(), records: { ...previous.records, [key]: fn(existing) } };
    });
  }, []);

  const scheduleReview = useCallback((questionId: string, key: string) => {
    setProgress(previous => {
      if (!previous) return previous;
      const original = previous.records[key] ?? emptyPracticeRecord();
      if (original.reviewScheduled || currentItem?.phase === 'review') return previous;
      const reviewKey = `${questionId}::review`;
      return {
        ...previous, updatedAt: Date.now(), queue: [...previous.queue, { questionId, phase: 'review' }],
        records: { ...previous.records, [key]: { ...original, reviewScheduled: true }, [reviewKey]: previous.records[reviewKey] ?? emptyPracticeRecord() },
      };
    });
  }, [currentItem?.phase]);

  const advance = useCallback(() => {
    setProgress(previous => previous ? { ...previous, updatedAt: Date.now(), currentIndex: Math.min(previous.currentIndex + 1, previous.queue.length) } : previous);
    setRequestError(''); setFormatError('');
  }, []);

  const focusAnswer = useCallback((select: boolean) => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (select) inputRef.current?.select();
    });
  }, []);

  const saveToLocalNotes = useCallback((answer: PracticeAnswerDTO, question: PracticeQuestionDTO) => {
    const activeConfig = progress?.config ?? config;
    if (!activeConfig.autoSaveNotes || !activeConfig.noteFolderId) return;
    const saved = addLocalNoteItem(activeConfig.noteFolderId, {
      sourceKey: `${sourceId}:${question.wordId}:${question.senseId}`,
      zh: answer.hanzi, py: answer.pinyin, vn: answer.meaningVi, pos: answer.pos,
      sourceLessonId: sourceId === 'hsk-random' ? null : sourceId,
    });
    if (!saved) setLocalNotesError(t.practice.localNotes.saveError);
  }, [config, progress?.config, sourceId]);

  const submit = useCallback(async () => {
    if (!bank || !currentQuestion || !currentRecord || !currentItem || pending || composing.current) return;
    const input = currentRecord.draft;
    setPending('check'); setRequestError(''); setFormatError('');
    const generation = requestGeneration.current;
    try {
      const response = await fetch(`/api/lessons/${encodeURIComponent(sourceId)}/practice/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.questionId, kind: currentQuestion.kind, input, contentSignature: bank.contentSignature }),
      });
      const data = await response.json() as PracticeCheckDTO & { error?: string };
      if (generation !== requestGeneration.current) return;
      if (response.status === 422) { setFormatError(data.error ?? t.practice.errors.requestFailed); focusAnswer(true); return; }
      if (!response.ok) { setRequestError(data.error ?? t.practice.errors.requestFailed); return; }
      changeRecord(currentKey, record => ({
        ...record, validAttempts: record.validAttempts + 1, submission: data,
        firstTryCorrect: data.status === 'correct' && record.validAttempts === 0 && !record.answerViewed,
      }));
      if (data.status === 'correct') {
        advance();
      } else {
        saveToLocalNotes(data.answer, currentQuestion);
        scheduleReview(currentQuestion.questionId, currentKey);
        focusAnswer(true);
      }
    } catch { if (generation === requestGeneration.current) setRequestError(t.practice.errors.requestFailed); }
    finally { if (generation === requestGeneration.current) setPending(null); }
  }, [advance, bank, changeRecord, currentItem, currentKey, currentQuestion, currentRecord, focusAnswer, pending, saveToLocalNotes, scheduleReview, sourceId]);

  const reveal = useCallback(async () => {
    if (!bank || !currentQuestion || !currentRecord || pending) return;
    setPending('reveal'); setRequestError(''); setFormatError('');
    const generation = requestGeneration.current;
    try {
      const response = await fetch(`/api/lessons/${encodeURIComponent(sourceId)}/practice/reveal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.questionId, kind: currentQuestion.kind, contentSignature: bank.contentSignature }),
      });
      const data = await response.json() as { answer?: PracticeAnswerDTO; error?: string };
      if (generation !== requestGeneration.current) return;
      if (!response.ok || !data.answer) { setRequestError(data.error ?? t.practice.errors.requestFailed); return; }
      changeRecord(currentKey, record => ({ ...record, answerViewed: true, revealedAnswer: data.answer }));
      saveToLocalNotes(data.answer, currentQuestion);
      scheduleReview(currentQuestion.questionId, currentKey);
    } catch { if (generation === requestGeneration.current) setRequestError(t.practice.errors.requestFailed); }
    finally { if (generation === requestGeneration.current) setPending(null); }
  }, [bank, changeRecord, currentKey, currentQuestion, currentRecord, pending, saveToLocalNotes, scheduleReview, sourceId]);

  const skip = useCallback(() => {
    if (!bank || !currentQuestion || !currentRecord) return;
    const activeConfig = progress?.config ?? config;
    if (activeConfig.autoSaveNotes && activeConfig.noteFolderId) {
      void fetch(`/api/lessons/${encodeURIComponent(sourceId)}/practice/reveal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.questionId, kind: currentQuestion.kind, contentSignature: bank.contentSignature }),
      }).then(async response => {
        const data = await response.json() as { answer?: PracticeAnswerDTO };
        if (response.ok && data.answer) saveToLocalNotes(data.answer, currentQuestion);
        else setLocalNotesError(t.practice.localNotes.saveError);
      }).catch(() => setLocalNotesError(t.practice.localNotes.saveError));
    }
    changeRecord(currentKey, record => ({ ...record, skipped: true }));
    scheduleReview(currentQuestion.questionId, currentKey);
    advance();
  }, [advance, bank, changeRecord, config, currentKey, currentQuestion, currentRecord, progress?.config, saveToLocalNotes, scheduleReview, sourceId]);

  if (!bank && !loadError) return <div style={panel}>{t.practice.loading}</div>;
  if (loadError) return <div style={panel}><p>{t.practice.loadError}</p><button style={primary} onClick={() => { setLoadError(false); setBank(null); setRestored(false); setReload(value => value + 1); }}>{t.practice.retryLoad}</button></div>;
  if (!bank || !restored) return <div style={panel}>{t.practice.loading}</div>;

  if (!progress) return (
    <section style={panel} aria-labelledby="practice-title">
      {showNoteFolderModal && <LocalNoteFolderModal selectedId={config.noteFolderId || undefined}
        onClose={() => setShowNoteFolderModal(false)}
        onSelect={folder => {
          setConfig(value => ({ ...value, autoSaveNotes: true, noteFolderId: folder.id }));
          setLocalNotesError(''); setShowNoteFolderModal(false);
        }} />}
      <h1 id="practice-title" style={{ margin: 0, fontSize: 24 }}>{t.practice.title}</h1>
      <p style={{ color: 'var(--ash)', marginTop: 6 }}>{t.practice.subtitle}</p>
      <fieldset style={{ border: 0, padding: 0, margin: '24px 0' }}>
        <legend style={{ fontWeight: 700, marginBottom: 10 }}>{t.practice.setup.level}</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
          {HSK_SOURCES.map((source, index) => {
            const active = sourceId === source;
            const random = source === 'hsk-random';
            return <label key={source} style={{ padding: '11px 12px', border: `1px solid ${active ? 'var(--red)' : 'var(--border)'}`, borderRadius: 9, cursor: 'pointer', minHeight: random ? 62 : undefined }}>
              <input type="radio" name="practice-level" checked={active} onChange={() => {
                requestGeneration.current++;
                setSourceId(source); setBank(null); setLoadError(false); setRestored(false); setProgress(null);
                setPending(null); setRequestError(''); setFormatError(''); setStorageConflict(false); setStorageFailed(false);
              }} />{' '}
              <strong>{random ? t.practice.setup.randomLevel : t.practice.setup.levelOption(index + 1)}</strong>
              {random && <div style={{ fontSize: 11.5, color: 'var(--ash)', margin: '4px 0 0 22px', lineHeight: 1.35 }}>{t.practice.setup.randomLevelSub}</div>}
            </label>;
          })}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: '24px 0' }}>
        <legend style={{ fontWeight: 700, marginBottom: 10 }}>{t.practice.setup.direction}</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
          {(['hanzi', 'vi', 'mixed'] as const).map(direction => <label key={direction} style={{ padding: 12, border: `1px solid ${config.direction === direction ? 'var(--red)' : 'var(--border)'}`, borderRadius: 9, cursor: 'pointer' }}>
            <input type="radio" name="practice-direction" checked={config.direction === direction} onChange={() => setConfig(value => ({ ...value, direction }))} />{' '}
            <strong>{t.practice.setup[direction].label}</strong><div style={{ fontSize: 12, color: 'var(--ash)', margin: '4px 0 0 22px' }}>{t.practice.setup[direction].sub}</div>
          </label>)}
        </div>
      </fieldset>
      {config.direction === 'hanzi' && <fieldset style={{ border: 0, padding: 0, margin: '20px 0' }}>
        <legend style={{ fontWeight: 700, marginBottom: 8 }}>{t.practice.setup.inputMode}</legend>
        {(['pinyin', 'hanzi'] as const).map(mode => <label key={mode} style={{ marginRight: 18 }}><input type="radio" checked={config.hanziInput === mode} onChange={() => setConfig(value => ({ ...value, hanziInput: mode }))} /> {mode === 'pinyin' ? t.practice.setup.pinyin : t.practice.setup.hanziInput}</label>)}
      </fieldset>}
      {config.direction === 'mixed' && <label style={{ display: 'block', margin: '18px 0' }}><input type="checkbox" checked={config.includeHanziCopy} onChange={event => setConfig(value => ({ ...value, includeHanziCopy: event.target.checked }))} /> {t.practice.setup.includeCopy}</label>}
      <fieldset style={{ border: 0, padding: 0, margin: '20px 0' }}>
        <legend style={{ fontWeight: 700, marginBottom: 8 }}>{t.practice.setup.count}</legend>
        {([10, 20, 30, 'all'] as PracticeCount[]).map(count => <label key={count} style={{ marginRight: 16 }}><input type="radio" checked={config.count === count} onChange={() => setConfig(value => ({ ...value, count }))} /> {count === 'all' ? t.practice.setup.all : t.practice.setup.countOption(count)}</label>)}
      </fieldset>
      <div style={{ margin: '20px 0', padding: 14, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--paper-alt)' }}>
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={config.autoSaveNotes} onChange={event => {
            if (event.target.checked) setShowNoteFolderModal(true);
            else setConfig(value => ({ ...value, autoSaveNotes: false }));
          }} style={{ marginTop: 3 }} />
          <span><strong>{t.practice.localNotes.option}</strong><span style={{ display: 'block', marginTop: 3, color: 'var(--ash)', fontSize: 12.5 }}>{t.practice.localNotes.optionSub}</span></span>
        </label>
        {config.autoSaveNotes && noteFolder && <div style={{ margin: '10px 0 0 24px', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', fontSize: 12.5 }}>
          <span>{t.practice.localNotes.selectedFolder(noteFolder.name)}</span>
          <button type="button" onClick={() => setShowNoteFolderModal(true)} style={{ ...button, padding: '5px 9px', fontSize: 12 }}>{t.practice.localNotes.changeFolder}</button>
        </div>}
      </div>
      <div style={{ padding: 12, borderRadius: 8, background: 'var(--paper-alt)', fontSize: 13, marginBottom: 18 }}>
        {t.practice.setup.available(selectedWordLimit, estimatedQuestions)}
        <div style={{ color: 'var(--ash)', marginTop: 4 }}>{t.practice.setup.byKind(
          bank.counts['hanzi-to-pinyin'], sourceItems - bank.counts['hanzi-to-pinyin'],
          bank.counts['hanzi-to-hanzi'], sourceItems - bank.counts['hanzi-to-hanzi'],
          bank.counts['vi-to-hanzi'], sourceItems - bank.counts['vi-to-hanzi'],
        )}</div>
        {Object.values(bank.excluded).reduce((sum, value) => sum + value, 0) > 0 && <div style={{ color: 'var(--ash)', marginTop: 3 }}>{t.practice.setup.excluded(Object.values(bank.excluded).reduce((sum, value) => sum + value, 0))}</div>}
      </div>
      {estimatedQuestions ? <button style={primary} onClick={() => startSession()}>{t.practice.setup.start}</button> : <><p role="status">{t.practice.setup.noQuestions}</p><Link href={sourceId === 'hsk-random' ? '/' : `/lesson/${encodeURIComponent(sourceId)}?mode=list`}>{t.practice.setup.backToList}</Link></>}
    </section>
  );

  const initialRecords = progress.initialQuestionIds.map(id => progress.records[id] ?? emptyPracticeRecord());
  if (finished) {
    const byKind = (['hanzi-to-pinyin', 'hanzi-to-hanzi', 'vi-to-hanzi'] as const).map(kind => {
      const ids = progress.initialQuestionIds.filter(id => questions.get(id)?.kind === kind);
      return { kind, total: ids.length, correct: ids.filter(id => progress.records[id]?.firstTryCorrect).length };
    }).filter(row => row.total);
    const retryIds = progress.initialQuestionIds.filter(id => !progress.records[id]?.firstTryCorrect);
    const reviewed = progress.queue.filter(item => item.phase === 'review').filter(item => progress.records[recordKey(item)]?.submission?.status === 'correct').length;
    return <section style={panel}>
      <h1 style={{ marginTop: 0 }}>{t.practice.summary.title}</h1>
      {byKind.map(row => <div key={row.kind} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span>{t.practice.kinds[row.kind]}</span><strong>{t.practice.summary.kindScore(row.correct, row.total)}</strong></div>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 18 }}>
        <div style={{ background: 'var(--paper-alt)', padding: 12, borderRadius: 8 }}><strong>{initialRecords.filter(record => record.firstTryCorrect).length}/{initialRecords.length}</strong><div style={{ fontSize: 12, color: 'var(--ash)' }}>{t.practice.summary.firstTry}</div></div>
        <div style={{ background: 'var(--paper-alt)', padding: 12, borderRadius: 8 }}><strong>{retryIds.length}</strong><div style={{ fontSize: 12, color: 'var(--ash)' }}>{t.practice.summary.incorrect}</div></div>
        <div style={{ background: 'var(--paper-alt)', padding: 12, borderRadius: 8 }}><strong>{initialRecords.filter(record => record.answerViewed).length}</strong><div style={{ fontSize: 12, color: 'var(--ash)' }}>{t.practice.summary.hinted}</div></div>
        <div style={{ background: 'var(--paper-alt)', padding: 12, borderRadius: 8 }}><strong>{reviewed}</strong><div style={{ fontSize: 12, color: 'var(--ash)' }}>{t.practice.summary.reviewed}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
        {retryIds.length > 0 && <button style={primary} onClick={() => startSession(progress.config, retryIds)}>{t.practice.actions.retryWrong}</button>}
        <button style={button} onClick={() => { removeVocabularyPracticeProgress(sourceId); setProgress(null); }}>{t.practice.actions.newSession}</button>
      </div>
    </section>;
  }

  if (!currentItem || !currentQuestion || !currentRecord) return <div style={panel}>{t.practice.errors.contentChanged}</div>;
  const isPinyin = currentQuestion.kind === 'hanzi-to-pinyin';
  const result = currentRecord.submission;
  const shownAnswer = currentRecord.revealedAnswer ?? (result?.status === 'correct' ? result.answer : undefined);
  const hasResult = result?.status === 'correct' || !!currentRecord.revealedAnswer;
  const descriptionId = isPinyin ? 'practice-pinyin-help' : 'practice-hanzi-help';

  return <section style={panel} aria-labelledby="practice-kind">
    {(storageFailed || storageConflict) && <div role="alert" style={{ padding: 10, background: 'var(--gold-light)', borderRadius: 8, marginBottom: 12 }}>{storageConflict ? t.practice.errors.otherTab : t.practice.errors.storageFailed}</div>}
    {localNotesError && <div role="alert" style={{ padding: 10, background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, marginBottom: 12 }}>{localNotesError}</div>}
    {confirmReset && <div role="alertdialog" aria-modal="true" style={{ padding: 14, background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 16 }}>
      <p style={{ marginTop: 0 }}>{t.practice.resetConfirm}</p><div style={{ display: 'flex', gap: 8 }}><button style={button} onClick={() => setConfirmReset(false)}>{t.practice.actions.cancel}</button><button style={primary} onClick={() => { removeVocabularyPracticeProgress(sourceId); requestGeneration.current++; setPending(null); setProgress(null); setConfirmReset(false); }}>{t.practice.actions.confirmReset}</button></div>
    </div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <div><div style={{ color: 'var(--ash)', fontSize: 12 }}>{t.practice.question(progress.currentIndex + 1, progress.queue.length)}</div><h1 id="practice-kind" style={{ margin: '3px 0 0', fontSize: 19 }}>{t.practice.kinds[currentQuestion.kind]}</h1></div>
      <button style={button} onClick={() => setConfirmReset(true)}>{t.practice.actions.changeSetup}</button>
    </div>
    {currentItem.phase !== 'main' && <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 12, marginTop: 14 }}>{currentItem.phase === 'review' ? t.practice.reviewPhase : t.practice.deferredPhase}</div>}
    <div style={{ textAlign: 'center', padding: '28px 8px 20px' }}>
      {currentQuestion.kind === 'vi-to-hanzi' ? <><div style={{ fontSize: 28, fontWeight: 700 }}>{currentQuestion.meaningVi}</div>{currentQuestion.exampleVi && <div style={{ marginTop: 10, color: 'var(--ash)' }}>{t.practice.context(currentQuestion.exampleVi)}</div>}</> : <div style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 'clamp(48px,10vw,72px)' }}>{currentQuestion.hanzi}</div>}
      {currentQuestion.pos && <div style={{ color: 'var(--ash)', fontSize: 12, marginTop: 8 }}>{t.practice.pos(currentQuestion.pos)}</div>}
      {currentQuestion.kind === 'hanzi-to-pinyin' && currentQuestion.meaningVi && <div style={{ color: 'var(--ash)', fontSize: 13, marginTop: 4 }}>{currentQuestion.meaningVi}</div>}
    </div>
    <label htmlFor="practice-answer" style={{ display: 'block', fontWeight: 700, marginBottom: 7 }}>{isPinyin ? t.practice.input.pinyinLabel : currentQuestion.kind === 'vi-to-hanzi' ? t.practice.input.viHanziLabel : t.practice.input.hanziLabel}</label>
    <input ref={inputRef} id="practice-answer" value={currentRecord.draft} disabled={hasResult || pending != null} maxLength={200}
      aria-describedby={descriptionId} aria-invalid={!!formatError}
      placeholder={isPinyin ? t.practice.input.pinyinPlaceholder : t.practice.input.hanziPlaceholder}
      autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode={isPinyin ? 'text' : undefined}
      onChange={event => { const value = event.target.value; changeRecord(currentKey, record => ({ ...record, draft: value, submission: undefined })); setFormatError(''); setRequestError(''); }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; compositionEndedAt.current = Date.now(); }}
      onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && !composing.current && Date.now() - compositionEndedAt.current > 80) { event.preventDefault(); void submit(); } }}
      style={{ boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '11px 13px', border: `1px solid ${formatError ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)', fontSize: isPinyin ? 17 : 24 }} />
    {isPinyin ? <div id={descriptionId} style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ash)', lineHeight: 1.6 }}>
      <p style={{ margin: 0 }}>{t.practice.pinyinHelp.short}</p><strong>{t.practice.pinyinHelp.reminder}</strong>
      <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer' }}>{t.practice.pinyinHelp.summary}</summary><table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}><thead><tr><th>{t.practice.pinyinHelp.table.tone}</th><th>{t.practice.pinyinHelp.table.marked}</th><th>{t.practice.pinyinHelp.table.typed}</th></tr></thead><tbody>{[['1','mā','ma1'],['2','má','ma2'],['3','mǎ','ma3'],['4','mà','ma4'],[t.practice.pinyinHelp.table.neutral,'ma','ma5']].map(row => <tr key={row[2]}>{row.map(cell => <td key={cell} style={{ textAlign: 'center', padding: 4, borderTop: '1px solid var(--border)' }}>{cell}</td>)}</tr>)}</tbody></table></details>
    </div> : <p id={descriptionId} style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ash)', lineHeight: 1.6 }}>{t.practice.hanziHelp}</p>}
    <div aria-live="polite" style={{ minHeight: 24, marginTop: 12 }}>
      {formatError && <div style={{ color: 'var(--red)' }}>{formatError}</div>}
      {requestError && <div role="alert" style={{ color: 'var(--red)' }}>{requestError}</div>}
      {result && <div style={{ color: result.status === 'correct' ? '#2f7d50' : 'var(--red)', fontWeight: 700 }}>{result.feedback}</div>}
      {currentRecord.revealedAnswer && <div style={{ color: 'var(--gold)', fontWeight: 700 }}>{t.practice.feedback.revealed}</div>}
      {shownAnswer && result?.issues?.map(issue => <div key={`${issue.kind}-${issue.expectedIndex}-${issue.actualIndex}`} style={{ fontSize: 13, marginTop: 3 }}>{issueMessage(issue)}</div>)}
    </div>
    {shownAnswer && answerCard(shownAnswer, () => speakChinese(shownAnswer.hanzi))}
    {!hasResult && <div style={{ marginTop: 14, color: 'var(--ash)', fontSize: 12.5 }}>
      <kbd style={{ padding: '2px 7px', border: '1px solid var(--border)', borderBottomWidth: 2, borderRadius: 5, background: 'var(--paper-alt)', color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>Enter</kbd>{' '}
      {t.practice.shortcuts.enter}
    </div>}
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18, position: 'sticky', bottom: 10 }}>
      {!hasResult ? <><button type="button" style={primary} disabled={pending != null} onClick={() => void submit()}>{pending === 'check' ? t.practice.loading : t.practice.actions.check}</button><button type="button" style={button} disabled={pending != null} onClick={skip}>{t.practice.actions.skip}</button><button type="button" style={button} disabled={pending != null} onClick={() => void reveal()}>{t.practice.actions.reveal}</button></> : <button type="button" style={primary} onClick={advance}>{progress.currentIndex + 1 >= progress.queue.length ? t.practice.actions.finish : t.practice.actions.next}</button>}
    </div>
  </section>;
}
