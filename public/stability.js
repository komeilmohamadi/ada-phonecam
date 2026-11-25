import { getMedia, getPeer, isPhone, recoverMedia } from './stream.js';
import { appendSample, networkStats, shouldHoldScreen, shouldRecover } from './monitor.js';

const $ = (id) => document.getElementById(id);
const metrics = $('network-metrics');
const graph = $('history-graph');
const ctx = graph.getContext('2d');
let history = [],
  previous = null,
  stopped = false;
const format = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : 'N/A');
function draw() {
  if (!ctx) return;
  const { width, height } = graph;
  ctx.clearRect(0, 0, width, height);
  for (const [key, color, offset, label] of [
    ['fps', '#67b7ff', 0, 'FPS'],
    ['mbps', '#53d5a4', height / 2, 'Mbps'],
  ]) {
    const h = height / 2;
    const max = Math.max(1, ...history.map((s) => s[key] ?? 0));
    ctx.strokeStyle = '#425069';
    ctx.beginPath();
    ctx.moveTo(0, offset + h - 1);
    ctx.lineTo(width, offset + h - 1);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '13px sans-serif';
    ctx.fillText(`${label} (scale 0-${max.toFixed(1)})`, 8, offset + 15);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    history.forEach((s, i) => {
      if (!Number.isFinite(s[key])) {
        pen = false;
        return;
      }
      const x = (i * (width - 1)) / 59;
      const y = offset + h - 3 - (s[key] / max) * (h - 24);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    });
    ctx.stroke();
  }
}
function clearStats() {
  previous = null;
  history = [];
  metrics.textContent = 'Waiting for connected video statistics.';
  draw();
}
window.addEventListener('ada-stats-reset', clearStats);
window.addEventListener('ada-stats', ({ detail: { report, direction, sample, metrics: video } }) => {
  const result = networkStats(report, direction, sample.id, previous);
  previous = result.sample;
  const m = result.metrics;
  history = appendSample(history, { fps: video.fps, mbps: video.mbps });
  metrics.textContent = `RTT: ${format(m.rtt)} ms | Jitter: ${format(m.jitter)} ms | Interval loss: ${format(m.loss, 2)}% | Dropped: ${format(m.dropped, 0)} | Freezes: ${format(m.freezes, 0)}`;
  draw();
});
clearStats();

let wake = null,
  wakeBusy = false;
const wakeStatus = $('wake-status');
const wakeToggle = $('wake-enabled');
const active = () => getMedia()?.getVideoTracks().some((t) => t.readyState === 'live') === true;
const wantsWake = () =>
  !stopped &&
  isPhone &&
  shouldHoldScreen({ active: active(), visible: !document.hidden, enabled: wakeToggle.checked });
async function syncWake() {
  if (!isPhone) return;
  if (!wantsWake()) {
    const current = wake;
    wake = null;
    if (current) await current.release().catch(() => {});
    wakeStatus.textContent = 'Screen lock inactive.';
    return;
  }
  if (!navigator.wakeLock?.request) {
    wakeStatus.textContent = 'Screen Wake Lock unavailable. Keep the phone awake manually.';
    return;
  }
  if (wake || wakeBusy) return;
  wakeBusy = true;
  try {
    const acquired = await navigator.wakeLock.request('screen');
    if (!wantsWake()) {
      await acquired.release();
      return;
    }
    wake = acquired;
    wakeStatus.textContent = 'Screen Wake Lock active.';
    acquired.addEventListener('release', () => {
      if (wake !== acquired) return;
      wake = null;
      wakeStatus.textContent = 'Screen Wake Lock released by the browser.';
    });
  } catch {
    wakeStatus.textContent = 'Screen Wake Lock denied or unavailable.';
  } finally {
    wakeBusy = false;
  }
}
if (isPhone) {
  $('wake-controls').hidden = false;
  wakeToggle.onchange = syncWake;
  document.addEventListener('visibilitychange', syncWake);
  window.addEventListener('capturechange', syncWake);
}

let attempt = 0,
  since = performance.now(),
  connectedSince = null,
  observed = null,
  busy = false;
const recovery = $('recovery-status');
const events = document.createElement('details');
const eventTitle = document.createElement('summary');
eventTitle.textContent = 'Recent connection events';
const eventList = document.createElement('ol');
events.append(eventTitle, eventList);
recovery.after(events);
function record(message) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  eventList.prepend(item);
  while (eventList.childElementCount > 20) eventList.lastElementChild.remove();
}
window.addEventListener('signalmessage', ({ detail }) => {
  if (['authenticated', 'paired', 'left', 'stopped'].includes(detail.type)) record(detail.type);
});
let lastState;
function setRecovery(message) {
  if (lastState === message) return;
  lastState = message;
  recovery.textContent = message;
  record(message);
}
async function tick() {
  if (!isPhone || stopped || busy) return;
  const current = getPeer();
  if (!active() || !current) {
    attempt = 0;
    observed = null;
    connectedSince = null;
    setRecovery('Recovery idle.');
    return;
  }
  const state = current.connectionState;
  const now = performance.now();
  if (state === 'connected') {
    connectedSince ??= now;
    if (now - connectedSince >= 15000) attempt = 0;
    observed = null;
    setRecovery('Media connected.');
    return;
  }
  connectedSince = null;
  if (observed !== current) {
    observed = current;
    since = now;
  }
  if (attempt >= 3) {
    setRecovery('Recovery limit reached. Stop and start the camera manually.');
    return;
  }
  if (!shouldRecover(state, now - since, attempt)) return;
  busy = true;
  try {
    attempt++;
    setRecovery(`Recovering media (${attempt}/3)...`);
    await recoverMedia(current);
  } catch (error) {
    setRecovery(`Recovery failed: ${error.message}`);
  } finally {
    since = performance.now();
    busy = false;
  }
}
const timer = isPhone ? setInterval(tick, 1000) : null;
window.addEventListener('pagehide', () => {
  stopped = true;
  clearInterval(timer);
  syncWake();
});
