/**
 * Chinese pronunciation with the browser's speech synthesis (Web Speech API).
 * Voices depend on the device: macOS/iOS ship Chinese voices, Chrome has "Google 普通话",
 * some Windows/Android setups have none — check canSpeakChinese() before showing a button.
 */

function pickChineseVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find(v => v.lang === 'zh-CN')
    ?? voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith('zh-cn'))
    ?? voices.find(v => v.lang.toLowerCase().startsWith('zh'));
}

/** True when the browser can synthesise speech at all (voices may still load later). */
export function canSpeakChinese(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Reads Chinese text aloud, interrupting whatever is being read. Returns false if unsupported. */
export function speakChinese(text: string, rate = 0.85): boolean {
  if (!canSpeakChinese() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = rate;
  // getVoices() is empty until the browser has loaded them; lang alone still selects one.
  const voice = pickChineseVoice();
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
