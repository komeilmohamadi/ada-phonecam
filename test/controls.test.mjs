import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCameraControl, controlSupported } from '../public/camera-controls.js';
function camera(overrides = {}) {
  let settings = { zoom: 1, frameRate: 30, focusDistance: 0 };
  let constraints = { width: { ideal: 1920 }, advanced: [{ torch: false }] };
  return {
    readyState: 'live',
    getCapabilities: () => ({
      zoom: { min: 1, max: 5, step: 0.1 },
      frameRate: { min: 15, max: 60 },
      focusDistance: { min: 0, max: 10 },
      focusMode: ['manual', 'continuous'],
      torch: [true, false],
    }),
    getSettings: () => settings,
    getConstraints: () => constraints,
    applyConstraints: async (value) => {
      constraints = value;
      settings = {
        ...settings,
        ...Object.assign({}, ...(value.advanced ?? [])),
        ...(value.frameRate ? { frameRate: value.frameRate.exact } : {}),
      };
    },
    ...overrides,
  };
}
test('unsupported and out-of-range controls never reach the camera', async () => {
  let called = false;
  const track = camera({
    applyConstraints: async () => {
      called = true;
    },
  });
  for (const [name, value] of [
    ['iso', 200],
    ['zoom', 100],
    ['zoom', NaN],
    ['torch', 'true'],
    ['focusMode', 'auto'],
  ])
    await assert.rejects(applyCameraControl(track, name, value));
  assert.equal(called, false);
  assert.equal(controlSupported({ zoom: { min: 1, max: 1 } }, 'zoom'), false);
});
test('image controls preserve capture constraints and select manual focus when available', async () => {
  const track = camera();
  const result = await applyCameraControl(track, 'focusDistance', 3);
  assert.equal(result.verified, true);
  assert.deepEqual(track.getConstraints().width, { ideal: 1920 });
  assert.equal(track.getConstraints().advanced[0].focusMode, 'manual');
  assert.deepEqual(track.getConstraints().advanced[1], { torch: false });
  assert.equal(track.getSettings().torch, false);
  assert.equal((await applyCameraControl(track, 'torch', true)).verified, true);
  assert.equal((await applyCameraControl(track, 'focusDistance', 4)).verified, true);
  assert.deepEqual(track.getConstraints().advanced[1], { torch: true });
  assert.equal(track.getSettings().torch, true);
});
test('FPS requests use exact constraints; silently ignored values are not reported as verified', async () => {
  const track = camera();
  await applyCameraControl(track, 'frameRate', 60);
  assert.deepEqual(track.getConstraints().frameRate, { exact: 60 });
  const ignored = camera({ applyConstraints: async () => {} });
  assert.equal((await applyCameraControl(ignored, 'zoom', 3)).verified, false);
  await assert.rejects(applyCameraControl(camera({ readyState: 'ended' }), 'zoom', 2));
});
