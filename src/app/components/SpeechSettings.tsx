'use client';

import { useEffect, useState } from 'react';
import { canSpeakChinese, getSpeechSettings, mandarinVoices, saveSpeechSettings, speakChinese, type SpeechSettings as Settings } from '@/lib/speech';
import { t } from '@/i18n';

export function SpeechSettings() {
  const [settings, setSettings] = useState<Settings>({ voiceURI: '', rate: 0.9 });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const synth = window.speechSynthesis;
    const refresh = () => {
      setSupported(canSpeakChinese());
      setSettings(getSpeechSettings());
      setVoices(canSpeakChinese() ? mandarinVoices(synth.getVoices()) : []);
    };
    // Subscribe before reading: some browsers populate voices asynchronously.
    synth?.addEventListener('voiceschanged', refresh);
    const timer = window.setTimeout(refresh, 0);
    return () => {
      window.clearTimeout(timer);
      synth?.removeEventListener('voiceschanged', refresh);
    };
  }, []);

  function update(next: Settings) {
    setSettings(next);
    saveSpeechSettings(next);
  }

  const copy = t.vocab.speech;
  const controlStyle = { background: 'var(--paper-alt)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', maxWidth: '100%' };
  return (
    <details style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{copy.title}</summary>
      {supported === false ? <p role="status">{copy.unavailable}</p> : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12, marginTop: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, maxWidth: '100%' }}>
              {copy.title}
              <select style={controlStyle} value={voices.some(v => v.voiceURI === settings.voiceURI) ? settings.voiceURI : ''} onChange={e => update({ ...settings, voiceURI: e.target.value })}>
                <option value="">{copy.automatic}</option>
                {voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>
              {copy.speed}: {settings.rate.toFixed(1)}×
              <input type="range" min="0.6" max="1.2" step="0.1" value={settings.rate} onChange={e => update({ ...settings, rate: Number(e.target.value) })} />
            </label>
            <button type="button" style={{ ...controlStyle, cursor: 'pointer' }} disabled={!supported} onClick={() => speakChinese(copy.sample)}>{copy.preview}</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ash)', marginBottom: 0 }} role="status">{supported && voices.length === 0 ? copy.noVoices : copy.deviceHint}</p>
        </>
      )}
    </details>
  );
}
