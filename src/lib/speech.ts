/** Device-provided Mandarin speech, shared by vocabulary, notes and reading. */
const SETTINGS_KEY = 'hsk-speech-settings';
export interface SpeechSettings { voiceURI: string; rate: number }
const defaults: SpeechSettings = { voiceURI: '', rate: 0.9 };

export function canSpeakChinese(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Exclude Cantonese rather than treating every zh voice as Mandarin. */
export function mandarinVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (voice: SpeechSynthesisVoice) => {
    const lang = voice.lang.replaceAll('_', '-').toLowerCase();
    return (/^zh-(cn|hans)(-|$)/.test(lang) ? 100 : 0)
      + (/natural|neural|premium|enhanced/i.test(voice.name) ? 40 : 0)
      + (/google/i.test(voice.name) ? 20 : 0);
  };
  return voices.filter(voice => /^(zh(?:-(?:cn|sg|tw|hans|hant)(?:-.*)?)?|cmn(?:-.*)?)$/i.test(voice.lang.replaceAll('_', '-'))
    && !/cantonese|粵|粤/i.test(voice.name))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function getSpeechSettings(): SpeechSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      voiceURI: typeof saved?.voiceURI === 'string' ? saved.voiceURI : '',
      rate: typeof saved?.rate === 'number' && Number.isFinite(saved.rate)
        ? Math.min(1.2, Math.max(0.6, saved.rate)) : defaults.rate,
    };
  } catch { return { ...defaults }; }
}

export function saveSpeechSettings(settings: SpeechSettings): void {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage may be disabled. */ }
}

// Keep the current utterance alive for browsers that otherwise drop its callbacks.
let activeUtterance: SpeechSynthesisUtterance | null = null;

/** Reads a whole word without splitting syllables, preserving connected pronunciation. */
export function speakChinese(text: string, rate?: number): boolean {
  if (!canSpeakChinese() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  const settings = getSpeechSettings();
  const voices = mandarinVoices(synth.getVoices());
  const voice = voices.find(v => v.voiceURI === settings.voiceURI) ?? voices[0];
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = voice?.lang ?? 'zh-CN';
  utterance.rate = rate !== undefined && Number.isFinite(rate)
    ? Math.min(1.2, Math.max(0.6, rate)) : settings.rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  activeUtterance = utterance;
  const release = () => { if (activeUtterance === utterance) activeUtterance = null; };
  utterance.onend = release;
  utterance.onerror = release;
  synth.speak(utterance);
  return true;
}
