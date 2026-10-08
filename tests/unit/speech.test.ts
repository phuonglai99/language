import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSpeechSettings, mandarinVoices, saveSpeechSettings, speakChinese } from '../../src/lib/speech';

const voice = (name: string, lang: string) => ({ name, lang, voiceURI: name, localService: true, default: false }) as SpeechSynthesisVoice;

test('prefers enhanced mainland Mandarin and excludes Cantonese', () => {
  const voices = mandarinVoices([
    voice('Hong Kong', 'zh-HK'), voice('Cantonese', 'zh-CN'), voice('English', 'en-US'),
    voice('Taiwan', 'zh-TW'), voice('Basic', 'zh_CN'), voice('Google 普通话', 'zh-CN'),
    voice('Tingting (Enhanced)', 'zh-CN'), voice('Mandarin', 'cmn-CN'),
  ]);
  assert.deepEqual(voices.map(v => v.name), ['Tingting (Enhanced)', 'Google 普通话', 'Basic', 'Mandarin', 'Taiwan']);
});

test('uses saved voice and rate, interrupts previous speech, and handles corrupt storage', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance');
  let stored = '';
  let cancelled = 0;
  const spoken: SpeechSynthesisUtterance[] = [];
  const preferred = voice('Taiwan', 'zh-TW');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } },
    speechSynthesis: { getVoices: () => [voice('Basic', 'zh-CN'), preferred], cancel: () => { cancelled++; }, speak: (u: SpeechSynthesisUtterance) => spoken.push(u) },
  } });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(public text: string) {} } });
  try {
    saveSpeechSettings({ voiceURI: preferred.voiceURI, rate: 0.7 });
    assert.equal(speakChinese('  你好  '), true);
    assert.equal(cancelled, 1);
    assert.equal(spoken[0].voice, preferred);
    assert.equal(spoken[0].lang, 'zh-TW');
    assert.equal(spoken[0].rate, 0.7);
    assert.equal(spoken[0].text, '你好');
    assert.equal(speakChinese(' '), false);
    assert.equal(cancelled, 1);
    stored = '{broken';
    assert.equal(getSpeechSettings().rate, 0.9);
    stored = '{"rate":999,"voiceURI":"removed"}';
    speakChinese('学习');
    assert.equal(spoken[1].voice?.name, 'Basic');
    assert.equal(spoken[1].rate, 1.2);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalUtterance) Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', originalUtterance);
    else Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
  }
});
