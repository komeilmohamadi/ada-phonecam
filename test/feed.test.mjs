import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feedAudioAllowed,
  isFeedWindow,
  normalizeFeedSettings,
  selectLiveStream,
} from '../public/feed.js';

const origin = 'https://localhost:8443';
const windowAt = (pathname = '/view') => ({ closed: false, location: { origin, pathname } });
const track = (readyState = 'live', muted = false) => ({ readyState, muted });
const stream = (video = [], audio = []) => ({
  getVideoTracks: () => video,
  getAudioTracks: () => audio,
});

test('feed settings accept only supported rotations and explicit boolean switches', () => {
  assert.deepEqual(normalizeFeedSettings(), {
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    audio: false,
  });
  assert.deepEqual(normalizeFeedSettings({ rotation: '270', mirrorX: true, audio: 'true' }), {
    rotation: 270,
    mirrorX: true,
    mirrorY: false,
    audio: false,
  });
  for (const rotation of [45, -90, 360, 'invalid']) {
    assert.equal(normalizeFeedSettings({ rotation }).rotation, 0);
  }
});

test('only the exact same-origin, open clean feed window is authorized', () => {
  const viewer = windowAt();
  assert.equal(isFeedWindow(viewer, viewer, origin), true);
  assert.equal(isFeedWindow(viewer, windowAt(), origin), false);
  assert.equal(isFeedWindow(null, null, origin), false);
  viewer.location.pathname = '/studio';
  assert.equal(isFeedWindow(viewer, viewer, origin), false);
  viewer.location.pathname = '/view';
  viewer.location.origin = 'https://192.168.1.1:8443';
  assert.equal(isFeedWindow(viewer, viewer, origin), false);
  viewer.location.origin = origin;
  viewer.closed = true;
  assert.equal(isFeedWindow(viewer, viewer, origin), false);
  const inaccessible = {
    get location() {
      throw new Error('Cross-origin');
    },
  };
  assert.equal(isFeedWindow(inaccessible, inaccessible, origin), false);
});

test('the shared stream is returned by reference only while video is live and connected', () => {
  const live = stream([track()]);
  assert.equal(selectLiveStream(live, 'connected'), live);
  for (const state of ['new', 'connecting', 'disconnected', 'failed', 'closed']) {
    assert.equal(selectLiveStream(live, state), null);
  }
  assert.equal(selectLiveStream(stream([track('ended')]), 'connected'), null);
  assert.equal(selectLiveStream(stream([track('live', true)]), 'connected'), null);
  assert.equal(selectLiveStream(stream(), 'connected'), null);
  assert.equal(selectLiveStream(null, 'connected'), null);
});

test('feed audio is opt-in and requires a live, unmuted audio track', () => {
  const live = stream([track()], [track()]);
  assert.equal(feedAudioAllowed({ audio: true }, live), true);
  assert.equal(feedAudioAllowed({ audio: false }, live), false);
  assert.equal(feedAudioAllowed({ audio: 'true' }, live), false);
  assert.equal(feedAudioAllowed({ audio: true }, stream()), false);
  assert.equal(feedAudioAllowed({ audio: true }, stream([], [track('ended')])), false);
  assert.equal(feedAudioAllowed({ audio: true }, stream([], [track('live', true)])), false);
  assert.equal(feedAudioAllowed({ audio: true }, null), false);
});
