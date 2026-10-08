'use client';

import HanziZoom from '@/app/components/HanziZoom';
import { t } from '@/i18n';
import {
  isDictationCheckResult, isDictationDisplaySymbol, matchDictationWords, normalizeDictationInput,
  type DictationCheckResult, type DictationSentence, type DictationToken, type WordSlot,
} from '@/lib/dictation';
import {
  DICTATION_PROGRESS_VERSION, DICTATION_SCORING_VERSION, dictationContentSignature, dictationProgressKey,
  readDictationProgress, removeDictationProgress, writeDictationProgress,
  type DictationDifficulty, type DictationProgressV1, type WordHintMode,
} from '@/lib/dictationProgress';
import { shouldIgnorePageShortcut } from '@/lib/keyboard';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Lesson = {
  slug: string;
  title_en: string;
  title_zh_simplified: string;
  hsk_level: number;
  categories: string[];
  audio_url: string | null;
  vocabCount?: number;
};
type Sentence = DictationSentence & { start: number | null; end: number | null };
type Submission = { input: string; result: DictationCheckResult };
type ActiveAudioClip = { sentenceIndex: number; start: number; end: number };
type StudyState = {
  currentSentenceIndex: number;
  drafts: Record<string, string>;
  submissions: Record<string, Submission>;
  hintUsed: Record<string, boolean>;
  wordHintsUsed: Record<string, Record<string, { hanzi: boolean; pinyin: boolean }>>;
  playbackRate: 0.75 | 1;
  difficulty: DictationDifficulty;
  wordHintMode: WordHintMode;
};

const LEVEL_COLOR: Record<number, string> = { 1: '#3a8a5c', 2: '#4a72a0', 3: '#a0720a', 4: '#c8392b', 5: '#7a3db0' };
const SLOT_COLOR: Record<WordSlot['status'], string> = { empty: 'var(--ash)', partial: 'var(--ink)', correct: '#16a34a', wrong: '#dc2626', extra: '#dc2626' };
const subscribeSpeechSupport = () => () => {};
const getSpeechSupport = () => 'speechSynthesis' in window;

function blankStudy(keep?: Pick<StudyState, 'playbackRate' | 'difficulty' | 'wordHintMode'>): StudyState {
  return {
    currentSentenceIndex: 0, drafts: {}, submissions: {}, hintUsed: {}, wordHintsUsed: {},
    playbackRate: keep?.playbackRate ?? 1,
    difficulty: keep?.difficulty ?? 'normal',
    wordHintMode: keep?.wordHintMode ?? 'pinyin',
  };
}

function getAlignmentStatus(categories: string[]): 'Checked' | 'Uncheck' | null {
  if (categories.includes('Uncheck')) return 'Uncheck';
  if (categories.includes('Checked')) return 'Checked';
  return null;
}

function hasAlignedAudio(sentence?: Sentence): boolean {
  return sentence?.start != null && sentence.end != null;
}

function wordKey(sentenceIndex: number): string {
  return String(sentenceIndex);
}

function restoreStudy(progress: DictationProgressV1, sentences: Sentence[]): StudyState {
  const validIndexes = new Set(sentences.map(sentence => wordKey(sentence.index)));
  const study = blankStudy({
    playbackRate: progress.playbackRate,
    difficulty: progress.difficulty,
    wordHintMode: progress.wordHintMode,
  });
  study.currentSentenceIndex = validIndexes.has(wordKey(progress.currentSentenceIndex)) ? progress.currentSentenceIndex : sentences[0]?.index ?? 0;
  for (const [index, saved] of Object.entries(progress.sentences)) {
    if (!validIndexes.has(index)) continue;
    if (saved.draft) study.drafts[index] = saved.draft;
    if (saved.hintUsed) study.hintUsed[index] = true;
    if (Object.keys(saved.wordHintsUsed).length) study.wordHintsUsed[index] = saved.wordHintsUsed;
    if (saved.submission && progress.scoringVersion === DICTATION_SCORING_VERSION) study.submissions[index] = saved.submission;
  }
  return study;
}

function toProgress(slug: string, contentSignature: string, study: StudyState): DictationProgressV1 {
  const indexes = new Set([
    ...Object.keys(study.drafts), ...Object.keys(study.submissions), ...Object.keys(study.hintUsed), ...Object.keys(study.wordHintsUsed),
  ]);
  const sentences: DictationProgressV1['sentences'] = {};
  for (const index of indexes) {
    sentences[index] = {
      draft: study.drafts[index] ?? '',
      hintUsed: study.hintUsed[index] === true,
      wordHintsUsed: study.wordHintsUsed[index] ?? {},
      ...(study.submissions[index] ? { submission: study.submissions[index] } : {}),
    };
  }
  return {
    version: DICTATION_PROGRESS_VERSION, slug, updatedAt: Date.now(), contentSignature,
    scoringVersion: DICTATION_SCORING_VERSION, currentSentenceIndex: study.currentSentenceIndex,
    playbackRate: study.playbackRate, difficulty: study.difficulty, wordHintMode: study.wordHintMode, sentences,
  };
}

function SlotText({ slot }: { slot: WordSlot }) {
  const raw = slot.text ?? slot.expected;
  let typedAt = 0;
  return (
    <>
      {[...raw].map((char, index) => {
        if (isDictationDisplaySymbol(char)) return <span key={index} style={{ color: 'var(--ash)', letterSpacing: 0 }}>{char}</span>;
        const typed = slot.typed[typedAt++];
        const digit = /^[0-9０-９]$/.test(char);
        return <span key={index} style={{ color: typed ? SLOT_COLOR[slot.status] : digit ? '#dc2626' : SLOT_COLOR[slot.status] }}>{typed ?? '*'}</span>;
      })}
    </>
  );
}

function WordBlanks({
  tokens, slots, activeIndex, wordHints, openHintId, showAllPinyin, onToggleHint, onRevealHint,
}: {
  tokens: DictationToken[];
  slots: WordSlot[];
  activeIndex: number;
  wordHints: Record<string, { hanzi: boolean; pinyin: boolean }>;
  openHintId: string | null;
  showAllPinyin: boolean;
  onToggleHint: (token: DictationToken) => void;
  onRevealHint: (token: DictationToken, mode: WordHintMode) => void;
}) {
  let slotIndex = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div aria-hidden="true" style={{ flexShrink: 0, width: 48, paddingTop: 1, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>{t.dictation.practice.pinyinRow}</div>
        <div style={{ height: 34, display: 'flex', alignItems: 'center' }}>{t.dictation.practice.hanziRow}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, rowGap: 18, alignItems: 'flex-start', minWidth: 0 }}>
        {tokens.map(token => {
          if (!token.scorable) return <div key={token.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}><span style={{ height: 24 }} /><span style={{ height: 34, display: 'flex', alignItems: 'center', color: 'var(--ash)', fontSize: 20, fontFamily: 'Noto Serif SC, serif' }}>{token.text}</span></div>;
          const slot = slots[slotIndex];
          const index = slotIndex++;
          if (!slot) return null;
          const hints = wordHints[token.id] ?? { hanzi: false, pinyin: false };
          const correct = slot.status === 'correct';
          const showPinyin = correct || showAllPinyin || hints.pinyin;
          const showHanzi = correct || hints.hanzi;
          const canRevealPinyin = !!token.pinyin && !showAllPinyin && !hints.pinyin;
          const canRevealHanzi = !hints.hanzi;
          const canOpen = !correct && (canRevealPinyin || canRevealHanzi);
          const open = openHintId === token.id;
          const width = Math.max([...token.text].length * 18 + 12, token.pinyin.length * 7 + 12, 42);
          return (
            <div key={token.id} data-word-hint-popup style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: width }}>
              <span style={{ height: 24, maxWidth: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showPinyin ? '#a0720a' : 'transparent', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {showPinyin ? token.pinyin || '—' : '•'}
              </span>
              <button type="button" onClick={() => canOpen && onToggleHint(token)} disabled={!canOpen}
                aria-label={canOpen ? t.dictation.practice.openWordHint(index + 1) : undefined} aria-expanded={canOpen ? open : undefined}
                style={{
                  height: 34, minWidth: width, padding: '2px 6px 1px', border: 0,
                  borderBottom: `2px solid ${index === activeIndex ? '#a0720a' : SLOT_COLOR[slot.status]}`,
                  borderRadius: '5px 5px 0 0', background: index === activeIndex ? 'rgba(160,114,10,0.07)' : 'transparent',
                  color: SLOT_COLOR[slot.status], cursor: canOpen ? 'pointer' : 'default',
                  fontFamily: 'Noto Serif SC, JetBrains Mono, serif', fontSize: 20, letterSpacing: showHanzi ? '0.04em' : '0.12em', lineHeight: 1.3,
                }}>
                {showHanzi ? token.text : <SlotText slot={slot} />}
              </button>
              {open && <div role="dialog" aria-label={t.dictation.practice.wordHintPopupTitle} style={{
                position: 'absolute', zIndex: 20, top: 64, left: '50%', transform: 'translateX(-50%)', width: 176,
                padding: 10, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--card-bg)', boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
              }}>
                <div style={{ marginBottom: 8, color: 'var(--ash)', fontSize: 11, fontWeight: 600 }}>{t.dictation.practice.wordHintPopupTitle}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button type="button" disabled={!canRevealPinyin} onClick={() => onRevealHint(token, 'pinyin')} style={{ padding: '7px 6px', border: '1px solid var(--border)', borderRadius: 6, background: !canRevealPinyin ? 'var(--paper-alt)' : 'transparent', color: !token.pinyin ? 'var(--ash-light)' : 'var(--ink)', cursor: canRevealPinyin ? 'pointer' : 'default' }}>{t.dictation.practice.wordHintModes.pinyin}</button>
                  <button type="button" disabled={!canRevealHanzi} onClick={() => onRevealHint(token, 'hanzi')} style={{ padding: '7px 6px', border: '1px solid var(--border)', borderRadius: 6, background: !canRevealHanzi ? 'var(--paper-alt)' : 'transparent', color: 'var(--ink)', cursor: canRevealHanzi ? 'pointer' : 'default' }}>{t.dictation.practice.wordHintModes.hanzi}</button>
                </div>
                {!token.pinyin && <div style={{ marginTop: 7, color: '#dc2626', fontSize: 10 }}>{t.dictation.practice.pinyinUnavailable}</div>}
              </div>}
            </div>
          );
        })}
        {slots.filter(slot => slot.status === 'extra').map((slot, index) => (
          <div key={`extra-${index}`} style={{ display: 'flex', flexDirection: 'column' }}><span style={{ height: 24 }} /><span style={{ height: 34, display: 'flex', alignItems: 'center', color: SLOT_COLOR.extra, borderBottom: '2px solid #dc2626', fontFamily: 'Noto Serif SC, serif', fontSize: 20 }}>{slot.typed}</span></div>
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#16a34a' : pct >= 60 ? '#a0720a' : '#dc2626';
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} /></div>
    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
  </div>;
}

export default function DictationExercisePage() {
  const { slug } = useParams<{ slug: string }>();
  return <DictationSession key={slug} slug={slug} />;
}

function DictationSession({ slug }: { slug: string }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [study, setStudy] = useState<StudyState>(() => blankStudy());
  const studyRef = useRef(study);
  const dataRef = useRef<{ slug: string; signature: string; sentences: Sentence[] } | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const persistenceActiveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef(0);
  const controllersRef = useRef(new Set<AbortController>());
  const [notice, setNotice] = useState<string | null>(null);
  const [storageConflict, setStorageConflict] = useState(false);
  const [checkingIndex, setCheckingIndex] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [openWordHintId, setOpenWordHintId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [inputBeforeIme, setInputBeforeIme] = useState('');
  const [compositionText, setCompositionText] = useState('');
  const ttsSupported = useSyncExternalStore(subscribeSpeechSupport, getSpeechSupport, () => false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const stopHandlerRef = useRef<(() => void) | null>(null);
  const activeAudioClipRef = useRef<ActiveAudioClip | null>(null);

  const replaceStudy = useCallback((next: StudyState) => {
    studyRef.current = next;
    setStudy(next);
  }, []);
  const updateStudy = useCallback((recipe: (previous: StudyState) => StudyState) => {
    const next = recipe(studyRef.current);
    studyRef.current = next;
    setStudy(next);
  }, []);
  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);
  const persistNow = useCallback(() => {
    cancelPendingSave();
    const data = dataRef.current;
    if (!persistenceActiveRef.current || !data) return;
    if (!writeDictationProgress(toProgress(data.slug, data.signature, studyRef.current))) {
      persistenceActiveRef.current = false;
      setNotice(t.dictation.practice.storageUnavailable);
    }
  }, [cancelPendingSave]);
  const schedulePersist = useCallback(() => {
    cancelPendingSave();
    if (!persistenceActiveRef.current || !dataRef.current) return;
    saveTimerRef.current = setTimeout(persistNow, 500);
  }, [cancelPendingSave, persistNow]);

  const clearAudioStop = useCallback(() => {
    const audio = audioRef.current;
    if (audio && stopHandlerRef.current) {
      audio.removeEventListener('timeupdate', stopHandlerRef.current);
      stopHandlerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (persistenceReady) schedulePersist();
  }, [study, persistenceReady, schedulePersist]);

  useEffect(() => {
    const onLifecycle = () => persistNow();
    const onVisibility = () => { if (document.visibilityState === 'hidden') persistNow(); };
    window.addEventListener('pagehide', onLifecycle);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onLifecycle);
      document.removeEventListener('visibilitychange', onVisibility);
      persistNow();
    };
  }, [persistNow]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== dictationProgressKey(slug) || !persistenceActiveRef.current) return;
      persistenceActiveRef.current = false;
      sessionRef.current++;
      cancelPendingSave();
      controllersRef.current.forEach(controller => controller.abort());
      setStorageConflict(true);
      setNotice(t.dictation.practice.storageConflict);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [slug, cancelPendingSave]);

  useEffect(() => {
    const controller = new AbortController();
    sessionRef.current++;
    fetch(`/api/dictation/lessons/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('not-found');
        return response.json() as Promise<{ lesson: Lesson; sentences: Sentence[] }>;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        const signature = dictationContentSignature(data.sentences);
        dataRef.current = { slug, signature, sentences: data.sentences };
        const saved = readDictationProgress(slug);
        let next = blankStudy();
        let message: string | null = null;
        if (saved?.contentSignature === signature) {
          next = restoreStudy(saved, data.sentences);
          message = saved.scoringVersion === DICTATION_SCORING_VERSION
            ? t.dictation.practice.progressRestored
            : t.dictation.practice.scoringChanged;
        } else if (saved) {
          next = blankStudy({ playbackRate: saved.playbackRate, difficulty: saved.difficulty, wordHintMode: saved.wordHintMode });
          removeDictationProgress(slug);
          message = t.dictation.practice.contentChanged;
        }
        replaceStudy(next);
        setLesson(data.lesson);
        setSentences(data.sentences);
        setNotice(message);
        setLoading(false);
        persistenceActiveRef.current = true;
        setPersistenceReady(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setNotFound(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [slug, persistNow, replaceStudy]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = study.playbackRate;
  }, [study.playbackRate]);
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    clearAudioStop();
    activeAudioClipRef.current = null;
    controllersRef.current.forEach(controller => controller.abort());
  }, [clearAudioStop]);
  useEffect(() => {
    const position = sentences.findIndex(sentence => sentence.index === study.currentSentenceIndex);
    const element = rightPanelRef.current?.querySelector(`[data-sentence="${position}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sentences, study.currentSentenceIndex]);

  const currentPosition = Math.max(0, sentences.findIndex(sentence => sentence.index === study.currentSentenceIndex));
  const currentSentence = sentences[currentPosition];
  const currentKey = currentSentence ? wordKey(currentSentence.index) : '';
  const userInput = study.drafts[currentKey] ?? '';
  const currentSubmission = study.submissions[currentKey];
  const currentResult = currentSubmission?.result;
  const levelColor = LEVEL_COLOR[lesson?.hsk_level ?? 0] ?? 'var(--ash)';

  const changeSentence = useCallback((position: number) => {
    const sentence = sentences[position];
    if (!sentence || sentence.index === studyRef.current.currentSentenceIndex) return;
    window.speechSynthesis?.cancel();
    clearAudioStop();
    activeAudioClipRef.current = null;
    audioRef.current?.pause();
    setShowHint(false);
    setOpenWordHintId(null);
    setComposing(false);
    setInputBeforeIme('');
    setCompositionText('');
    updateStudy(previous => ({ ...previous, currentSentenceIndex: sentence.index }));
    persistNow();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [sentences, clearAudioStop, updateStudy, persistNow]);

  const setHintUsed = useCallback((sentenceIndex: number) => {
    const key = wordKey(sentenceIndex);
    updateStudy(previous => ({ ...previous, hintUsed: { ...previous.hintUsed, [key]: true } }));
  }, [updateStudy]);

  const checkAnswer = useCallback(async () => {
    const sentence = currentSentence;
    const input = userInput;
    if (!sentence || !input.trim() || checkingIndex != null) return;
    const requestSession = sessionRef.current;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    setCheckingIndex(sentence.index);
    try {
      const response = await fetch('/api/dictation/check', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, sentence_index: sentence.index, user_input: input }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !isDictationCheckResult(data)) throw new Error('invalid-check-result');
      if (controller.signal.aborted || requestSession !== sessionRef.current || dataRef.current?.slug !== slug) return;
      updateStudy(previous => ({
        ...previous,
        submissions: { ...previous.submissions, [wordKey(sentence.index)]: { input, result: data } },
      }));
      persistNow();
    } catch {
      if (!controller.signal.aborted) setNotice(t.dictation.practice.checkFailed);
    } finally {
      controllersRef.current.delete(controller);
      if (!controller.signal.aborted && requestSession === sessionRef.current) setCheckingIndex(previous => previous === sentence.index ? null : previous);
    }
  }, [checkingIndex, currentSentence, userInput, slug, updateStudy, persistNow]);

  const speakSentence = useCallback((hanzi: string, rate: number) => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(hanzi);
    utterance.lang = 'zh-CN';
    utterance.rate = rate * 0.85;
    utterance.onstart = () => undefined;
    window.speechSynthesis.speak(utterance);
  }, [ttsSupported]);
  const playSentence = useCallback((sentenceIndex: number, start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearAudioStop();
    window.speechSynthesis?.cancel();
    activeAudioClipRef.current = { sentenceIndex, start, end };
    const stop = () => {
      if (audio.currentTime >= end + 0.15) {
        audio.pause();
        clearAudioStop();
        activeAudioClipRef.current = null;
      }
    };
    stopHandlerRef.current = stop;
    audio.addEventListener('timeupdate', stop);
    const begin = () => {
      audio.currentTime = start;
      audio.playbackRate = studyRef.current.playbackRate;
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= 1) begin();
    else {
      const ready = () => { audio.removeEventListener('loadedmetadata', ready); begin(); };
      audio.addEventListener('loadedmetadata', ready);
      audio.load();
    }
  }, [clearAudioStop]);
  const replayAudio = useCallback(() => {
    if (!currentSentence) return;
    if (hasAlignedAudio(currentSentence)) playSentence(currentSentence.index, currentSentence.start as number, currentSentence.end as number);
    else if (currentSentence.hanzi) speakSentence(currentSentence.hanzi, studyRef.current.playbackRate);
  }, [currentSentence, playSentence, speakSentence]);
  const togglePlay = useCallback(() => {
    if (!currentSentence) return;
    const audio = audioRef.current;
    if (hasAlignedAudio(currentSentence)) {
      const activeClip = activeAudioClipRef.current;
      const canResume = audio?.paused
        && activeClip?.sentenceIndex === currentSentence.index
        && audio.currentTime >= activeClip.start
        && audio.currentTime < activeClip.end + 0.15;
      if (audio && !audio.paused) audio.pause();
      else if (audio && canResume) {
        audio.playbackRate = studyRef.current.playbackRate;
        void audio.play().catch(() => undefined);
      } else playSentence(currentSentence.index, currentSentence.start as number, currentSentence.end as number);
    } else if (currentSentence.hanzi) speakSentence(currentSentence.hanzi, studyRef.current.playbackRate);
  }, [currentSentence, playSentence, speakSentence]);

  const resetSentence = useCallback(() => {
    if (!currentSentence) return;
    const key = wordKey(currentSentence.index);
    updateStudy(previous => {
      const drafts = { ...previous.drafts }; delete drafts[key];
      const submissions = { ...previous.submissions }; delete submissions[key];
      return { ...previous, drafts, submissions };
    });
    persistNow();
  }, [currentSentence, updateStudy, persistNow]);
  const resetLesson = useCallback(() => {
    if (!window.confirm(t.dictation.practice.resetLessonConfirm)) return;
    sessionRef.current++;
    controllersRef.current.forEach(controller => controller.abort());
    setCheckingIndex(null);
    removeDictationProgress(slug);
    replaceStudy(blankStudy(studyRef.current));
    setShowHint(false);
    setOpenWordHintId(null);
    setNotice(null);
    persistNow();
  }, [slug, replaceStudy, persistNow]);

  const toggleSentenceHint = useCallback(() => {
    if (!currentSentence) return;
    setShowHint(previous => {
      if (!previous) setHintUsed(currentSentence.index);
      return !previous;
    });
    persistNow();
  }, [currentSentence, setHintUsed, persistNow]);
  const toggleWordHint = useCallback((token: DictationToken) => {
    setOpenWordHintId(previous => previous === token.id ? null : token.id);
  }, []);
  const revealWordHint = useCallback((token: DictationToken, mode: WordHintMode) => {
    if (!currentSentence) return;
    if (mode === 'pinyin' && !token.pinyin) { setNotice(t.dictation.practice.pinyinUnavailable); return; }
    const key = wordKey(currentSentence.index);
    updateStudy(previous => ({
      ...previous,
      wordHintMode: mode,
      hintUsed: { ...previous.hintUsed, [key]: true },
      wordHintsUsed: {
        ...previous.wordHintsUsed,
        [key]: { ...previous.wordHintsUsed[key], [token.id]: { hanzi: previous.wordHintsUsed[key]?.[token.id]?.hanzi ?? false, pinyin: previous.wordHintsUsed[key]?.[token.id]?.pinyin ?? false, [mode]: true } },
      },
    }));
    setOpenWordHintId(null);
    persistNow();
  }, [currentSentence, updateStudy, persistNow]);

  useEffect(() => {
    if (!openWordHintId) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-word-hint-popup]')) return;
      setOpenWordHintId(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenWordHintId(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [openWordHintId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnorePageShortcut(event) || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key !== 'h') return;
      if (event.key === ' ') { event.preventDefault(); togglePlay(); }
      else if (event.key === 'Tab') { event.preventDefault(); replayAudio(); }
      else if (event.key === 'Enter') { event.preventDefault(); void checkAnswer(); }
      else if (event.key === 'h' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); toggleSentenceHint(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); changeSentence(Math.min(currentPosition + 1, sentences.length - 1)); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); changeSentence(Math.max(currentPosition - 1, 0)); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, replayAudio, checkAnswer, toggleSentenceHint, changeSentence, currentPosition, sentences.length]);

  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)', color: 'var(--ash)' }}>{t.common.loading}</div>;
  if (notFound || !lesson) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)', gap: 16 }}>
    <div>{t.dictation.practice.notFound}</div><Link href="/dictation">{t.common.backToList}</Link>
  </div>;
  if (!currentSentence) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>{t.dictation.practice.noSentences}</div>;

  const displayedInput = composing ? inputBeforeIme : userInput;
  const liveSlots = matchDictationWords(displayedInput, currentSentence.tokens);
  const scorableSlots = liveSlots.filter(slot => slot.status !== 'extra');
  const targetWordCount = scorableSlots.length;
  const filledWordCount = scorableSlots.filter(slot => slot.status === 'correct' || slot.status === 'wrong').length;
  const remainingWordCount = scorableSlots.filter(slot => slot.status === 'empty' || slot.status === 'partial').length;
  const extraWordCount = liveSlots.filter(slot => slot.status === 'extra').length;
  const correctLiveCount = scorableSlots.filter(slot => slot.status === 'correct').length;
  const allWordsCorrect = targetWordCount > 0 && correctLiveCount === targetWordCount && !extraWordCount;
  const activeWordIndex = liveSlots.findIndex(slot => slot.status === 'empty' || slot.status === 'partial');
  const wordCountColor = extraWordCount ? '#dc2626' : allWordsCorrect ? '#16a34a' : 'var(--ash)';
  const submissions = Object.values(study.submissions);
  const totalAnswered = submissions.length;
  const totalCorrect = submissions.filter(submission => submission.result.is_perfect).length;
  const scorePercent = sentences.length ? Math.round((submissions.reduce((sum, submission) => {
    const slots = submission.result.result.filter(slot => slot.status !== 'extra');
    return sum + (slots.length ? slots.filter(slot => slot.status === 'correct').length / slots.length : 0);
  }, 0) / sentences.length) * 100) : 0;
  const canPlaySentence = hasAlignedAudio(currentSentence) || ttsSupported;
  const currentHintUsed = study.hintUsed[currentKey] === true;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dictation" style={{ color: 'rgba(200,191,176,0.7)', textDecoration: 'none', fontSize: 13 }}>{t.dictation.backToDictation}</Link>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span style={{ padding: '2px 8px', borderRadius: 4, background: levelColor, color: '#fff', fontSize: 10, fontWeight: 700 }}>HSK {lesson.hsk_level}</span>
          {getAlignmentStatus(lesson.categories) && <span style={{ color: '#86efac', fontSize: 10 }}>{t.common.alignmentStatus[getAlignmentStatus(lesson.categories) as 'Checked' | 'Uncheck']}</span>}
          <span style={{ fontFamily: 'Noto Serif SC, serif', fontSize: 14, color: '#f5f1e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}><HanziZoom text={lesson.title_zh_simplified} /></span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(200,191,176,0.5)' }}>{t.dictation.practice.headerStats(lesson.vocabCount ?? sentences.reduce((sum, sentence) => sum + sentence.wordCount, 0), totalAnswered, sentences.length)}</span>
        </div>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 300px', maxWidth: 1280, margin: '0 auto', width: '100%', padding: '0 24px', gap: 20, boxSizing: 'border-box' }}>
        <aside style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', marginBottom: 10 }}>{t.dictation.practice.listenSentence}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {([0.75, 1] as const).map(rate => <button key={rate} onClick={() => { updateStudy(previous => ({ ...previous, playbackRate: rate })); persistNow(); }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${study.playbackRate === rate ? levelColor : 'var(--border)'}`, background: study.playbackRate === rate ? levelColor : 'transparent', color: study.playbackRate === rate ? '#fff' : 'var(--ash)', cursor: 'pointer' }}>{rate}x</button>)}
            </div>
            <button onClick={togglePlay} disabled={!canPlaySentence} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 0, background: canPlaySentence ? levelColor : 'var(--border)', color: '#fff', fontWeight: 700, cursor: canPlaySentence ? 'pointer' : 'default' }}>{t.dictation.practice.playSentence}</button>
            <button onClick={replayAudio} disabled={!canPlaySentence} style={{ width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)', cursor: canPlaySentence ? 'pointer' : 'default' }}>{t.dictation.practice.replay}</button>
          </section>
          {lesson.audio_url && <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', marginBottom: 10 }}>{t.dictation.practice.fullAudio}</div>
            <audio ref={audioRef} src={lesson.audio_url} controls style={{ width: '100%' }} />
          </section>}
          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)', marginBottom: 10 }}>{t.dictation.practice.shortcuts}</div>
            <div style={{ display: 'grid', gap: 7 }}>
              {t.dictation.practice.shortcutList.map(shortcut => <div key={shortcut.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
                <span style={{ color: 'var(--ash)' }}>{shortcut.desc}</span>
                <kbd style={{ flexShrink: 0, padding: '2px 6px', border: '1px solid var(--border)', borderBottomWidth: 2, borderRadius: 5, background: 'var(--paper-alt)', color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{shortcut.key}</kbd>
              </div>)}
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--ash-light)', fontSize: 10, lineHeight: 1.5 }}>{t.dictation.practice.shortcutNote}</p>
          </section>
          <button onClick={resetLesson} style={{ padding: '9px', borderRadius: 8, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>{t.dictation.practice.resetLesson}</button>
        </aside>

        <main style={{ padding: '24px 0', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            {(['easy', 'normal', 'hard'] as const).map(difficulty => {
              const color = difficulty === 'easy' ? '#16a34a' : difficulty === 'normal' ? '#a0720a' : '#dc2626';
              return <button key={difficulty} onClick={() => { updateStudy(previous => ({ ...previous, difficulty })); persistNow(); }} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${study.difficulty === difficulty ? color : 'var(--border)'}`, background: study.difficulty === difficulty ? color : 'transparent', color: study.difficulty === difficulty ? '#fff' : 'var(--ash)', cursor: 'pointer' }}>{t.dictation.practice.difficulty[difficulty]}</button>;
            })}
            <div style={{ flex: 1 }} />
            <button onClick={() => changeSentence(currentPosition - 1)} disabled={currentPosition === 0}>◄</button>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{currentPosition + 1}/{sentences.length}</span>
            <button onClick={() => changeSentence(currentPosition + 1)} disabled={currentPosition === sentences.length - 1}>►</button>
          </div>
          {notice && <div role="status" style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 7, background: storageConflict ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)', color: storageConflict ? '#dc2626' : '#3a8a5c', fontSize: 12 }}>{notice}</div>}
          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--ash)' }}>{t.dictation.practice.inputLabel} {t.dictation.practice.inputSentence(currentSentence.index + 1, targetWordCount)}</div>
              <div style={{ color: wordCountColor, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{t.dictation.practice.wordProgress(filledWordCount, targetWordCount)}</div>
            </div>
            <p style={{ margin: '10px 0', color: '#dc2626', fontSize: 12 }}>{t.dictation.practice.numberMaskHelp}</p>
            <div style={{ padding: '14px 12px 16px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--paper-alt)' }}>
              <WordBlanks
                tokens={currentSentence.tokens}
                slots={liveSlots}
                activeIndex={currentResult ? -1 : activeWordIndex}
                wordHints={study.wordHintsUsed[currentKey] ?? {}}
                openHintId={openWordHintId}
                showAllPinyin={showHint || study.difficulty === 'easy'}
                onToggleHint={toggleWordHint}
                onRevealHint={revealWordHint}
              />
            </div>

            <textarea ref={textareaRef} value={composing ? compositionText : userInput}
              onChange={event => {
                if (composing) setCompositionText(event.target.value);
                else updateStudy(previous => ({ ...previous, drafts: { ...previous.drafts, [currentKey]: event.target.value } }));
              }}
              onCompositionStart={() => { setComposing(true); setInputBeforeIme(userInput); setCompositionText(userInput); }}
              onCompositionEnd={event => { setComposing(false); setCompositionText(''); updateStudy(previous => ({ ...previous, drafts: { ...previous.drafts, [currentKey]: event.currentTarget.value } })); }}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing) return;
                if (event.key === 'Tab') { event.preventDefault(); replayAudio(); }
                if (event.key === 'h' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); toggleSentenceHint(); }
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void checkAnswer(); }
              }}
              aria-label={t.dictation.practice.inputSentence(currentSentence.index + 1, targetWordCount)}
              placeholder={t.dictation.practice.inputPlaceholder}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 105, marginTop: 16, padding: '12px 14px', background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', fontFamily: 'Noto Serif SC, serif', fontSize: 20, color: 'var(--ink)', lineHeight: 1.8 }} />
            <div style={{ marginTop: 6, color: wordCountColor, fontSize: 12 }}>{extraWordCount ? t.dictation.practice.tooManyChars : remainingWordCount ? t.dictation.practice.wordsMissing(remainingWordCount) : allWordsCorrect ? t.dictation.practice.allCorrect : t.dictation.practice.checkRedWords}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => void checkAnswer()} disabled={checkingIndex != null || !userInput.trim()} style={{ flex: 1, padding: '10px 0', border: 0, borderRadius: 8, background: userInput.trim() ? levelColor : 'var(--border)', color: '#fff', fontWeight: 700, cursor: userInput.trim() ? 'pointer' : 'default' }}>{checkingIndex === currentSentence.index ? t.dictation.practice.checking : t.dictation.practice.check}</button>
              {study.difficulty !== 'easy' && <button onClick={toggleSentenceHint} style={{ padding: '10px 14px', borderRadius: 8, border: `1px solid ${currentHintUsed ? '#dc2626' : 'var(--border)'}`, background: 'transparent', color: currentHintUsed ? '#dc2626' : 'var(--ash)', cursor: 'pointer' }}>{showHint ? t.dictation.practice.hideHint : t.dictation.practice.showHint}</button>}
              {(currentResult || userInput) && <button onClick={resetSentence} aria-label={t.dictation.practice.resetSentence} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>↩</button>}
            </div>
            {currentResult && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t.dictation.practice.result}</span><strong style={{ color: currentResult.is_perfect ? '#16a34a' : '#dc2626' }}>{currentResult.is_perfect ? t.dictation.practice.perfect : t.dictation.practice.correctWords(currentResult.result.filter(slot => slot.status === 'correct').length, currentResult.result.filter(slot => slot.status !== 'extra').length)}</strong></div>
              {!currentResult.is_perfect && <div style={{ marginTop: 10, padding: 10, background: 'rgba(22,163,74,0.06)', borderRadius: 6 }}><div style={{ fontSize: 10, color: 'var(--ash)' }}>{t.dictation.practice.correctAnswer}</div><HanziZoom text={currentResult.correct_hanzi} /><div style={{ color: 'var(--ash)', fontSize: 12 }}>{currentResult.pinyin}</div></div>}
            </div>}
          </section>
        </main>

        <aside style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--ash)' }}>{t.dictation.practice.board}</span><ScoreBar pct={scorePercent} /></div>
          <div ref={rightPanelRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sentences.map((sentence, position) => {
              const key = wordKey(sentence.index);
              const submission = study.submissions[key];
              const active = position === currentPosition;
              const border = active ? levelColor : submission?.result.is_perfect ? '#16a34a' : submission ? '#dc2626' : 'var(--border)';
              return <button key={sentence.index} data-sentence={position} onClick={() => changeSentence(position)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${border}`, background: active ? 'var(--paper-alt)' : 'var(--card-bg)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ash)' }}>#{sentence.index + 1}</span>{study.hintUsed[key] && <span style={{ color: '#dc2626', fontSize: 9 }}>{t.dictation.practice.hintUsed}</span>}</div>
                {submission ? <div style={{ marginTop: 5, color: submission.result.is_perfect ? '#16a34a' : '#dc2626', fontSize: 12 }}>{submission.result.is_perfect ? '✓' : '✗'} {submission.input}</div> : <div style={{ marginTop: 5, color: 'var(--ash)', fontFamily: 'JetBrains Mono, monospace' }}>{sentence.tokens.map(token => token.scorable ? normalizeDictationInput(token.text).split('').map(char => /^[0-9]$/.test(char) ? '*' : '*').join('') : token.text).join('')}</div>}
              </button>;
            })}
          </div>
          {totalAnswered > 0 && <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}><div>{t.dictation.practice.summary}</div><div>✓ {totalCorrect} · ✗ {totalAnswered - totalCorrect} · / {sentences.length}</div></div>}
        </aside>
      </div>
    </div>
  );
}
