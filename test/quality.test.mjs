import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableCodecs,
  captureTargets,
  configureReceiver,
  configureSender,
  defaultQuality,
  preferCodec,
  validateQuality,
  videoStats,
} from '../public/quality.js';

test('quality defaults and invalid remote requests are validated', () => {
  assert.deepEqual(validateQuality(defaultQuality), defaultQuality);
  assert.deepEqual(captureTargets(defaultQuality), {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 60, max: 60 },
  });
  for (const overrides of [
    { resolution: 999 },
    { fps: 120 },
    { bitrate: NaN },
    { bitrate: 151 },
    { bitrate: 0 },
    { bitrate: '12' },
    { codec: 'AV1' },
    { profile: 'toString' },
    { profile: '__proto__' },
  ]) {
    assert.throws(() => validateQuality({ ...defaultQuality, ...overrides }));
  }
  const high = validateQuality(
    { ...defaultQuality, resolution: 2160, bitrate: 150, codec: 'AV1' },
    ['AV1'],
  );
  assert.equal(captureTargets(high).width.ideal, 3840);
});

test('codec discovery intersects capabilities and preference preserves repair/fallback codecs', () => {
  const h264 = { mimeType: 'video/H264' };
  const vp8 = { mimeType: 'video/VP8' };
  const rtx = { mimeType: 'video/rtx' };
  const av1 = { mimeType: 'video/AV1' };
  const receiver = { getCapabilities: () => ({ codecs: [vp8, h264, rtx, av1] }) };
  const sender = { getCapabilities: () => ({ codecs: [vp8, h264, rtx] }) };
  assert.deepEqual(availableCodecs(sender, receiver), ['H264', 'VP8']);
  let order;
  preferCodec(
    {
      setCodecPreferences: (codecs) => {
        order = codecs;
      },
    },
    'H264',
    receiver,
  );
  assert.deepEqual(order, [h264, vp8, rtx, av1]);
  assert.throws(() => preferCodec({}, 'H264', receiver));
  assert.throws(() => preferCodec({ setCodecPreferences() {} }, 'VP9', receiver));
  preferCodec({}, 'auto', receiver);
});

test('bitrate limits are sent in bits per second and checked separately from optional policy', async () => {
  let parameters = { encodings: [{}] };
  const sender = {
    getParameters: () => structuredClone(parameters),
    setParameters: async (value) => {
      parameters = structuredClone(value);
    },
  };
  const result = await configureSender(sender, {
    ...defaultQuality,
    profile: 'latency',
    bitrate: 8,
  });
  assert.equal(parameters.encodings[0].maxBitrate, 8000000);
  assert.deepEqual(result, { confirmed: true, policy: 'maintain-framerate' });
  const ignored = await configureSender(
    { ...sender, setParameters: async () => {} },
    defaultQuality,
  );
  assert.equal(ignored.confirmed, false);
  await assert.rejects(
    configureSender({ ...sender, getParameters: () => ({ encodings: [] }) }, defaultQuality),
  );
  await assert.rejects(
    configureSender(
      {
        ...sender,
        setParameters: async () => {
          throw Error('rejected');
        },
      },
      defaultQuality,
    ),
  );
  parameters = { encodings: [{}] };
  const partial = await configureSender(
    {
      ...sender,
      setParameters: async (value) => {
        if (value.degradationPreference) throw Error('policy unsupported');
        parameters = structuredClone(value);
      },
    },
    { ...defaultQuality, bitrate: 8 },
  );
  assert.deepEqual(partial, { confirmed: true, policy: 'browser default' });
});

test('optional receiver hint safely falls back and resets to the browser default', () => {
  assert.equal(configureReceiver({}, 'latency'), false);
  const receiver = { jitterBufferTarget: null };
  assert.equal(configureReceiver(receiver, 'latency'), true);
  assert.equal(receiver.jitterBufferTarget, 0);
  assert.equal(configureReceiver(receiver, 'balanced'), false);
  assert.equal(receiver.jitterBufferTarget, null);
  const rejected = {
    get jitterBufferTarget() {
      return null;
    },
    set jitterBufferTarget(value) {
      throw Error(String(value));
    },
  };
  assert.equal(configureReceiver(rejected, 'latency'), false);
});

function report(timestamp, bytesReceived, framesDecoded, id = 'video') {
  return new Map([
    ['video-codec', { mimeType: 'video/H264' }],
    ['rtx-codec', { mimeType: 'video/rtx' }],
    [
      id,
      {
        id,
        type: 'inbound-rtp',
        kind: 'video',
        timestamp,
        bytesReceived,
        framesDecoded,
        codecId: 'video-codec',
        frameWidth: 1920,
        frameHeight: 1080,
      },
    ],
    [
      'rtx',
      {
        id: 'rtx',
        type: 'inbound-rtp',
        kind: 'video',
        timestamp,
        bytesReceived: bytesReceived * 10,
        codecId: 'rtx-codec',
      },
    ],
    [
      'audio',
      {
        id: 'audio',
        type: 'inbound-rtp',
        kind: 'audio',
        timestamp,
        bytesReceived: bytesReceived * 20,
      },
    ],
  ]);
}

test('RTP statistics use real counter deltas, exclude repair/audio and reset on new streams', () => {
  const first = videoStats(report(1000, 1000000, 60), 'inbound');
  assert.equal(first.metrics.mbps, null);
  assert.equal(first.metrics.fps, null);
  const second = videoStats(report(2000, 2500000, 120), 'inbound', first.sample);
  assert.equal(second.metrics.mbps, 12);
  assert.equal(second.metrics.fps, 60);
  assert.equal(second.metrics.width, 1920);
  assert.equal(second.metrics.codec, 'video/H264');
  assert.equal(videoStats(report(3000, 1, 1), 'inbound', second.sample).metrics.mbps, null);
  assert.equal(
    videoStats(report(3000, 5000000, 180, 'new-video'), 'inbound', second.sample).metrics.mbps,
    null,
  );
  assert.equal(videoStats(new Map(), 'inbound', second.sample).metrics, null);
});

test('outbound stats report encoder limitation and native FPS without inventing unavailable fields', () => {
  const result = videoStats(
    new Map([
      [
        'out',
        {
          id: 'out',
          type: 'outbound-rtp',
          kind: 'video',
          timestamp: 1000,
          bytesSent: 100,
          framesEncoded: 1,
          framesPerSecond: 29.5,
          qualityLimitationReason: 'cpu',
        },
      ],
    ]),
    'outbound',
  );
  assert.equal(result.metrics.fps, 29.5);
  assert.equal(result.metrics.limitation, 'cpu');
  assert.equal(result.metrics.codec, null);
  assert.equal(result.metrics.width, null);
});
