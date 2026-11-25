import { feedAudioAllowed, normalizeFeedSettings } from './feed.js';

const video = document.getElementById('feed-video');
const frame = document.getElementById('feed-frame');
let lastSettings = '';
let requestedAudio = false;
let audioBlocked = false;
let generation = 0;
let lastReport = '';
let lastStream = null;

function studio() {
  try {
    const parent = window.opener;
    if (
      parent &&
      !parent.closed &&
      parent.location.origin === location.origin &&
      parent.location.pathname === '/studio'
    ) {
      return parent;
    }
  } catch {
    // A navigated or cross-origin opener cannot provide a stream.
  }
  return null;
}

function report(state) {
  if (state === lastReport) return;
  lastReport = state;
  try {
    studio()?.adaReportCleanFeed?.(window, state);
  } catch {
    // The studio may have closed while reporting.
  }
}

function playback() {
  if (!lastStream) return;
  const attempt = ++generation;
  video.play().then(
    () => {
      if (attempt === generation) report(audioBlocked ? 'blocked' : 'playing');
    },
    () => {
      if (attempt !== generation) return;
      if (!video.muted) {
        audioBlocked = true;
        video.muted = true;
        report('blocked');
        playback();
      } else {
        report('paused');
      }
    },
  );
}

function sync() {
  let snapshot = null;
  try {
    snapshot = studio()?.adaReadCleanFeed?.(window) ?? null;
  } catch {
    // The studio may have closed or navigated while polling.
  }
  const settings = normalizeFeedSettings(snapshot?.settings);
  const key = JSON.stringify(settings);
  if (key !== lastSettings) {
    frame.dataset.rotation = String(settings.rotation);
    frame.dataset.mirrorX = String(settings.mirrorX);
    frame.dataset.mirrorY = String(settings.mirrorY);
    lastSettings = key;
  }
  const stream = snapshot?.stream ?? null;
  const audio = feedAudioAllowed(settings, stream);
  const changed = stream !== lastStream || audio !== requestedAudio;
  if (!changed) return;
  generation++;
  if (stream !== lastStream) {
    lastStream = stream;
    video.pause();
    video.srcObject = stream;
    audioBlocked = false;
  }
  if (audio !== requestedAudio) audioBlocked = false;
  requestedAudio = audio;
  video.muted = !audio || audioBlocked;
  if (!stream) {
    report('waiting');
    return;
  }
  playback();
}

function retryAudio() {
  if (!lastStream) return;
  audioBlocked = false;
  video.muted = !requestedAudio;
  playback();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await frame.requestFullscreen();
  } catch {
    // Browser fullscreen may be unavailable; normal window capture remains usable.
  }
}

frame.addEventListener('click', retryAudio);
frame.addEventListener('dblclick', toggleFullscreen);
window.addEventListener('keydown', (event) => {
  if (!event.repeat && event.key.toLowerCase() === 'f') toggleFullscreen();
});
video.addEventListener('pause', () => {
  if (lastStream && video.paused) report(audioBlocked ? 'blocked' : 'paused');
});

report('waiting');
sync();
const timer = setInterval(sync, 250);
window.addEventListener('pagehide', () => {
  clearInterval(timer);
  generation++;
  video.pause();
  video.srcObject = null;
  lastStream = null;
});
