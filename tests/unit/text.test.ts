import assert from 'node:assert/strict';
import { test } from 'node:test';
import { neutralToneVariants, normalizePinyin, pinyinPlain, stripVietnamese } from '../../src/shared/text';

test('dictionary identity normalizes sandhi and preserves syllable boundaries', () => {
  assert.equal(normalizePinyin('不是', 'bú shì'), 'bùshì');
  assert.equal(normalizePinyin('可爱', 'kě ài'), "kě'ài");
});

test('neutral-tone matching does not merge distinct dictionary tones', () => {
  assert.equal(neutralToneVariants('dōngxī', 'dōngxi'), true);
  assert.equal(neutralToneVariants('zhōng', 'zhòng'), false);
  assert.equal(neutralToneVariants('lǜ', 'lù'), false);
});

test('search accepts composed and decomposed accents', () => {
  assert.equal(pinyinPlain('Lǜ'.normalize('NFD')), 'lv');
  assert.equal(stripVietnamese('Đường đến trường'), 'duong den truong');
});
