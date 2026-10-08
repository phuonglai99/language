import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHanziiWordResponse } from '../../src/server/third-party-service/hanzii';

test('Hanzii not-found is a valid empty result, malformed responses are errors', () => {
  assert.deepEqual(parseHanziiWordResponse({ found: false }), []);
  assert.deepEqual(parseHanziiWordResponse({ found: true, result: [] }), []);
  for (const payload of [null, 'error', {}, { found: true, result: 'unavailable' }]) {
    assert.throws(() => parseHanziiWordResponse(payload), /Invalid Hanzii results/);
  }
});
