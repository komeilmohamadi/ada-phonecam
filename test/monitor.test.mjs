import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSample,
  networkStats,
  recoveryDelay,
  shouldHoldScreen,
  shouldRecover,
  signalRetryDelay,
} from '../public/monitor.js';

test('network statistics use the selected pair and interval packet counters', () => {
  const report = new Map([
    [
      'video',
      { id: 'video', transportId: 't', packetsReceived: 190, packetsLost: 10, jitter: 0.004 },
    ],
    ['t', { selectedCandidatePairId: 'p' }],
    ['p', { currentRoundTripTime: 0.012 }],
  ]);
  const first = networkStats(report, 'inbound', 'video');
  assert.equal(first.metrics.loss, null);
  assert.equal(first.metrics.rtt, 12);
  assert.equal(first.metrics.jitter, 4);
  const second = networkStats(report, 'inbound', 'video', { id: 'video', received: 95, lost: 5 });
  assert.equal(second.metrics.loss, 5);
  assert.equal(networkStats(report, 'inbound', 'video', { id: 'other' }).metrics.loss, null);
});

test('outbound reports use matching remote inbound statistics or report unavailable', () => {
  const report = new Map([
    ['video', { remoteId: 'r' }],
    ['r', { id: 'r', packetsReceived: 20, packetsLost: 2, jitter: 0.003, fractionLost: 0.1 }],
  ]);
  assert.equal(networkStats(report, 'outbound', 'video').metrics.jitter, 3);
  assert.equal(networkStats(report, 'outbound', 'video').metrics.loss, 10);
  assert.equal(networkStats(report, 'outbound', 'missing').metrics.loss, null);
  assert.equal(networkStats(report, 'outbound', 'missing').metrics.rtt, null);
});

test('history is bounded and unavailable samples are preserved', () => {
  let history = [];
  for (let i = 0; i < 100; i++) history = appendSample(history, { fps: i });
  assert.equal(history.length, 60);
  assert.equal(history[0].fps, 40);
  assert.equal(appendSample(history, { fps: null }).at(-1).fps, null);
});

test('recovery is delayed, bounded and never triggers for a healthy connection', () => {
  assert.equal(recoveryDelay(0), 2000);
  assert.equal(recoveryDelay(3), null);
  assert.equal(shouldRecover('connected', 30000, 0), false);
  assert.equal(shouldRecover('disconnected', 5000, 0), false);
  assert.equal(shouldRecover('disconnected', 10000, 0), true);
  assert.equal(shouldRecover('failed', 9000, 3), false);
  assert.equal(signalRetryDelay(0), 1000);
  assert.equal(signalRetryDelay(100), 30000);
});

test('wake lock is requested only while capture is active, visible and enabled', () => {
  assert.equal(shouldHoldScreen({ active: true, visible: true, enabled: true }), true);
  assert.equal(shouldHoldScreen({ active: false, visible: true, enabled: true }), false);
  assert.equal(shouldHoldScreen({ active: true, visible: false, enabled: true }), false);
  assert.equal(shouldHoldScreen({ active: true, visible: true, enabled: false }), false);
});
