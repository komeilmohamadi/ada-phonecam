import test from 'node:test';
import assert from 'node:assert/strict';
import { listedCameras, lowNoiseTarget, luminanceSummary, orientedTargets, qualityConstraints, recommendNetwork } from '../public/camera-tuning.js';

const q = { resolution: 1080, fps: 60 };
test('orientation follows reported dimensions unless explicitly requested', () => {
  assert.equal(orientedTargets(q, { width: 720, height: 1280 }).width.ideal, 1080);
  assert.equal(orientedTargets(q, { width: 720, height: 1280 }, 'landscape').width.ideal, 1920);
  assert.equal(orientedTargets(q, {}, 'portrait').height.ideal, 1920);
  assert.throws(() => orientedTargets(q, {}, 'invalid'));
});
test('bitrate-only requests do not touch camera constraints', () => {
  const track = { getSettings: () => ({ width: 720, height: 1280 }), getConstraints: () => ({ advanced: [{ torch: true }] }) };
  assert.equal(qualityConstraints(track, q, { ...q, bitrate: 25 }), null);
  assert.deepEqual(qualityConstraints(track, q, { ...q, fps: 30 }), { advanced: [{ torch: true }], frameRate: { ideal: 30, max: 30 } });
  assert.equal(qualityConstraints(track, q, { ...q, resolution: 2160 }).height.ideal, 3840);
});
test('camera list deduplicates exposed ids and retains the active camera', () => {
  assert.deepEqual(listedCameras([{ kind: 'videoinput', deviceId: 'a' }, { kind: 'videoinput', deviceId: 'a' }, { kind: 'audioinput', deviceId: 'b' }], { deviceId: 'c' }), [{ id: 'a', label: 'Camera 1' }, { id: 'c', label: 'Current camera' }]);
});
test('noise preset and LAN recommendations are bounded targets', () => {
  assert.deepEqual(lowNoiseTarget(2160), { profile: 'quality', fps: 30, bitrate: 40 });
  assert.equal(recommendNetwork(100).resolution, 2160);
  assert.equal(recommendNetwork(5).bitrate, 1);
  assert.equal(recommendNetwork(NaN), null);
});
test('brightness heuristic distinguishes dark and bright samples', () => {
  assert.equal(luminanceSummary(new Uint8Array([0, 0, 0, 255])).lowLight, true);
  assert.equal(luminanceSummary(new Uint8Array([255, 255, 255, 255])).lowLight, false);
  assert.equal(luminanceSummary([]), null);
});

test('torch accepts boolean support and preserves unrelated image controls', async () => {
  const { applyCameraControl, controlSupported } = await import('../public/camera-controls.js');
  assert.equal(controlSupported({ torch: true }, 'torch'), true);
  assert.equal(controlSupported({ torch: false }, 'torch'), false);
  let current = false;
  let constraints = { width: { ideal: 1920 }, advanced: [{ zoom: 2 }, { torch: false }] };
  const track = {
    readyState: 'live',
    getCapabilities: () => ({ torch: true }),
    getConstraints: () => constraints,
    getSettings: () => ({ torch: current }),
    async applyConstraints(value) {
      constraints = value;
      current = value.advanced.find((entry) => 'torch' in entry).torch;
    },
  };
  assert.deepEqual(await applyCameraControl(track, 'torch', true), { actual: true, verified: true });
  assert.deepEqual(constraints.advanced, [{ zoom: 2 }, { torch: true }]);
  assert.deepEqual(await applyCameraControl(track, 'torch', false), { actual: false, verified: true });
});

test('torch fallback confirms only the reported hardware state', async () => {
  const { applyCameraControl } = await import('../public/camera-controls.js');
  let calls = 0;
  const track = {
    readyState: 'live',
    getCapabilities: () => ({ torch: [true, false] }),
    getConstraints: () => ({}),
    getSettings: () => ({ torch: false }),
    async applyConstraints() { calls++; },
  };
  assert.deepEqual(await applyCameraControl(track, 'torch', true), { actual: false, verified: false });
  assert.equal(calls, 2);
});

test('LAN receiver reports only a complete bounded transfer', async () => {
  const { receiveLanProbe } = await import('../public/lan-probe.js');
  const messages = [];
  const results = [];
  const channel = { label: 'ada-lan-probe-v1', send: (value) => messages.push(value), close() { this.onclose?.(); } };
  receiveLanProbe(channel, (result) => results.push(result));
  channel.onmessage({ data: 'ping' });
  channel.onmessage({ data: 'start:10' });
  for (let i = 0; i < 128; i++) channel.onmessage({ data: new ArrayBuffer(16 * 1024) });
  channel.onmessage({ data: 'end' });
  channel.close();
  assert.deepEqual(messages, ['pong', 'done']);
  assert.equal(results.length, 1);
  assert.equal(results[0].bytes, 2 * 1024 * 1024);
  assert.equal(results[0].rtt, 10);
  assert.ok(results[0].mbps > 0);
});
