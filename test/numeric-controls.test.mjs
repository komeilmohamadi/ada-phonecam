import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCameraControl,
  formatControlNumber,
  incrementControlNumber,
  normalizeControlNumber,
  parseControlNumber,
} from '../public/camera-controls.js';

test('raw browser floats are readable without rounding tiny exposure values to zero', () => {
  assert.equal(formatControlNumber(1.8005295991897583, 'zoom'), '1.8');
  assert.equal(formatControlNumber(29.970001220703125, 'frameRate'), '29.97');
  assert.equal(formatControlNumber(199.9999999, 'iso'), '200');
  assert.equal(formatControlNumber(0.000000023, 'exposureTime'), '2.3e-8');
  assert.equal(formatControlNumber(undefined, 'zoom'), '');
  assert.equal(formatControlNumber(NaN, 'zoom'), '');
});

test('numeric requests follow the hardware grid starting at its minimum', () => {
  const cap = { min: 0.3, max: 2, step: 0.2 };
  assert.ok(Math.abs(normalizeControlNumber(cap, 1.42) - 1.5) < 1e-12);
  assert.ok(Math.abs(normalizeControlNumber(cap, 2) - 1.9) < 1e-12);
  assert.equal(normalizeControlNumber({ min: 0, max: 0.3, step: 0.1 }, 0.3), 0.3);
  assert.equal(normalizeControlNumber({ min: 0, max: 5, step: 0 }, 1.234), 1.234);
  for (const value of [NaN, Infinity, -1, 10, '1.2', null]) {
    assert.throws(() => normalizeControlNumber(cap, value));
  }
});

test('manual input rejects blanks and accepts rounded display boundaries', () => {
  const cap = { min: 1.8005295991897583, max: 3.1998, step: 0 };
  assert.equal(parseControlNumber('zoom', cap, '1.8'), cap.min);
  assert.equal(parseControlNumber('zoom', cap, '3.2'), cap.max);
  for (const value of ['', ' ', 'NaN', 'Infinity', '0', '5', '0x2', '0b10']) {
    assert.throws(() => parseControlNumber('zoom', cap, value));
  }
});

test('increment buttons use practical changes and stay within reported limits', () => {
  const cap = { min: 1, max: 4, step: 0.00001 };
  const up = incrementControlNumber('zoom', cap, 1.8005295991897583, 1);
  assert.equal(formatControlNumber(up, 'zoom'), '1.9');
  assert.equal(formatControlNumber(incrementControlNumber('zoom', cap, up, -1), 'zoom'), '1.8');
  assert.equal(incrementControlNumber('zoom', cap, 4, 1), 4);
  assert.equal(incrementControlNumber('zoom', cap, 1, -1), 1);
  assert.throws(() => incrementControlNumber('zoom', cap, 2, 0));
});

test('camera receives a normalized target and does not confirm a different value', async () => {
  let actual = 1;
  let constraints = { width: { ideal: 1920 }, advanced: [{ torch: true }] };
  const track = {
    readyState: 'live',
    getCapabilities: () => ({ zoom: { min: 1, max: 5, step: 0.1 } }),
    getConstraints: () => constraints,
    getSettings: () => ({ zoom: actual }),
    async applyConstraints(value) {
      constraints = value;
      actual = Math.fround(value.advanced[0].zoom);
    },
  };
  const confirmed = await applyCameraControl(track, 'zoom', 1.8005295991897583);
  assert.equal(confirmed.verified, true);
  assert.equal(formatControlNumber(confirmed.actual, 'zoom'), '1.8');
  assert.deepEqual(constraints.width, { ideal: 1920 });
  assert.deepEqual(constraints.advanced[1], { torch: true });
  track.applyConstraints = async () => {};
  assert.equal((await applyCameraControl(track, 'zoom', 1.9)).verified, false);
});
