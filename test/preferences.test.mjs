import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultQuality } from '../public/quality.js';
import { readTheme, saveTheme, loadPreset, savePreset } from '../public/preferences.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
}

test('themes persist locally and safely fall back when storage is unavailable', () => {
  const s = storage();
  assert.equal(readTheme(s), 'dark');
  assert.equal(saveTheme(s, 'light'), true);
  assert.equal(readTheme(s), 'light');
  assert.equal(saveTheme(s, 'unexpected'), true);
  assert.equal(readTheme(s), 'dark');
  assert.equal(readTheme(undefined), 'dark');
  assert.equal(saveTheme(undefined, 'light'), false);
});

test('presets validate targets, keep distinct slots and discard extra fields', () => {
  const s = storage();
  const first = { ...defaultQuality, token: 'not stored', microphone: true };
  savePreset(s, '1', first, []);
  savePreset(s, '2', { ...defaultQuality, resolution: 720 }, []);
  assert.deepEqual(loadPreset(s, '1', []), defaultQuality);
  assert.equal(loadPreset(s, '2', []).resolution, 720);
  assert.throws(() => loadPreset(s, '3', []), /empty/);
  assert.throws(() => savePreset(s, '4', first, []), /slot/);
  assert.throws(() => savePreset(s, '1', { ...first, bitrate: 999 }, []), /Bitrate/);
  assert.deepEqual(loadPreset(s, '1', []), defaultQuality);
});

test('a saved codec must be supported on the currently connected phone', () => {
  const s = storage();
  savePreset(s, '1', { ...defaultQuality, codec: 'H264' }, ['H264']);
  assert.throws(() => loadPreset(s, '1', []), /codec/);
  assert.equal(loadPreset(s, '1', ['H264']).codec, 'H264');
});
