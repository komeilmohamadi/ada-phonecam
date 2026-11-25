import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openTrustedPhone } from '../src/trusted-phone.mjs';
import { saveFullProfile, readFullProfile, profileConstraints, restoreProfileControls } from '../public/full-profile.js';
import { defaultQuality } from '../public/quality.js';

const storage = () => {
  const map = new Map();
  return { setItem: (k, v) => map.set(k, v), getItem: (k) => map.get(k) ?? null };
};
const camera = () => {
  let state = { deviceId: 'rear', width: 1080, height: 1920, zoom: 1.8, focusMode: 'continuous', focusDistance: 2, torch: false };
  let constraints = { frameRate: { exact: 30 } };
  return { readyState: 'live', getSettings: () => state, getConstraints: () => constraints,
    getCapabilities: () => ({ zoom: { min: 1, max: 5, step: 0.1 }, focusMode: ['manual', 'continuous'], focusDistance: { min: 0, max: 10 }, torch: true }),
    async applyConstraints(next) { constraints = next; state = { ...state, ...Object.assign({}, ...(next.advanced ?? [])) }; },
  };
};

test('trusted token survives server restart, is hashed at rest, and is revocable', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ada-trust-'));
  try {
    const file = path.join(dir, 'trusted.json');
    const first = openTrustedPhone(file);
    assert.equal(first.exists(), false);
    const token = first.remember();
    assert.equal(token.length, 64);
    assert.ok(!readFileSync(file, 'utf8').includes(token));
    const second = openTrustedPhone(file);
    assert.equal(second.matches(token), true);
    assert.equal(second.matches('x'), false);
    const replacement = second.remember();
    assert.equal(openTrustedPhone(file).matches(token), false);
    assert.equal(openTrustedPhone(file).matches(replacement), true);
    second.forget();
    assert.equal(openTrustedPhone(file).matches(replacement), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('profile stores actual camera, zoom, modes, orientation, torch and requested quality', () => {
  const store = storage();
  const saved = saveFullProfile(store, camera(), { ...defaultQuality, resolution: 2160 }, true);
  assert.deepEqual(readFullProfile(store), saved);
  assert.equal(saved.deviceId, 'rear');
  assert.equal(saved.orientation, 'portrait');
  assert.equal(saved.controls.zoom, 1.8);
  assert.equal(saved.controls.torch, false);
  assert.equal(saved.microphone, true);
  assert.equal(saved.quality.resolution, 2160);
  const target = profileConstraints(saved);
  assert.deepEqual(target.deviceId, { exact: 'rear' });
  assert.equal(target.height.ideal, 3840);
  assert.deepEqual(target.frameRate, { exact: 30 });
  assert.equal(readFullProfile(storage()), null);
});

test('restoring auto focus does not set a manual focus distance', async () => {
  const store = storage();
  const saved = saveFullProfile(store, camera(), defaultQuality, false);
  const track = camera();
  await restoreProfileControls(track, saved);
  assert.equal(track.getSettings().focusMode, 'continuous');
  assert.equal(track.getConstraints().advanced.some((entry) => 'focusDistance' in entry), false);
});

test('unavailable controls are reported and storage failures are not reported as saved', async () => {
  const saved = saveFullProfile(storage(), camera(), defaultQuality, false);
  const track = camera();
  track.getCapabilities = () => ({});
  assert.match(await restoreProfileControls(track, saved), /Not confirmed:.*zoom/);
  assert.throws(() => saveFullProfile({ setItem() { throw Error('blocked'); } }, camera(), defaultQuality, false));
  assert.equal(readFullProfile({ getItem() { throw Error('blocked'); } }), null);
});
