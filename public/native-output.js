import { getPeer, isPhone } from './stream.js';
import { selectLiveStream } from './feed.js';

if (!isPhone && location.hostname === 'localhost' && location.pathname === '/studio') {
  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const toggle = $('native-enabled');
  const status = $('native-status');
  $('native-camera').hidden = false;
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  let busy = false;
  let lastTime = -1;
  let nextProbe = 0;
  let ready = false;
  let closed = false;
  const headers = { 'X-Ada-Frame': '1' };
  function clear() {
    lastTime = -1;
    ready = false;
    nextProbe = 0;
    fetch('/api/native-camera/frame', { method: 'DELETE', headers, keepalive: true }).catch(
      () => {},
    );
  }
  toggle.addEventListener('change', () => {
    clear();
    status.textContent = toggle.checked ? 'Waiting for the native camera helper.' : 'Output disabled.';
  });
  async function tick() {
    if (closed || busy || !toggle.checked) return;
    if (!selectLiveStream(video.srcObject, getPeer()?.connectionState) || video.readyState < 2) {
      if (lastTime !== -1) clear();
      status.textContent = 'Waiting for live phone video.';
      return;
    }
    if (!ctx) {
      status.textContent = 'Frame access is unavailable in this browser.';
      return;
    }
    busy = true;
    try {
      if (!ready) {
        if (performance.now() < nextProbe) return;
        nextProbe = performance.now() + 1000;
        ready = (
          await fetch('/api/native-camera/ready', { method: 'POST', headers })
        ).status === 204;
        if (!ready) {
          status.textContent = 'Start Native-Camera.cmd Start on this computer.';
          return;
        }
      }
      if (closed || !toggle.checked || video.currentTime === lastTime) return;
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      lastTime = video.currentTime;
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const response = await fetch('/api/native-camera/frame', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: frame,
      });
      if (closed || !toggle.checked) {
        clear();
        return;
      }
      ready = response.status === 204;
      if (!ready) lastTime = -1;
      status.textContent = ready
        ? 'Sending local 720p frames; confirm video in the target application.'
        : 'Native helper is not ready. Retrying.';
    } catch {
      ready = false;
      status.textContent = 'Local camera bridge unavailable. Retrying.';
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(tick, 1000 / 30);
  window.addEventListener('pagehide', () => {
    closed = true;
    clearInterval(timer);
    if (toggle.checked) clear();
  });
}
