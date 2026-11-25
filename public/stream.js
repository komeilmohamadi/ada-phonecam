import {
  availableCodecs,
  captureTargets,
  configureReceiver,
  configureSender,
  defaultQuality,
  preferCodec,
  setHint,
  validateQuality,
  videoStats,
} from './quality.js';
import { signalRetryDelay } from './monitor.js';

const phone = location.pathname === '/phone';
const $ = (id) => document.getElementById(id);
let token = location.hash.slice(1);
let captureGeneration = 0;
history.replaceState(null, '', location.pathname);
let ws,
  pc,
  media,
  epoch = '',
  queue = [],
  chain = Promise.resolve(),
  retry,
  closed = false,
  authenticated = false,
  retryAttempt = 0;
const status = (text) => {
  $('status').textContent = text;
};
export const send = (data) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
};
export const getMedia = () => media;
export const getPeer = () => pc;
export const isPhone = phone;
let quality = { ...defaultQuality },
  senderStatus = 'Waiting for negotiation',
  codecStatus = '';
let previousStats = null,
  statsBusy = false;
let senderQueue = Promise.resolve();
const metrics = document.createElement('p');
metrics.textContent = 'Waiting for WebRTC video statistics.';
metrics.setAttribute(
  'aria-label',
  phone ? 'Outgoing video statistics' : 'Incoming video statistics',
);
$('video').after(metrics);
export const getQuality = () => ({
  target: { ...quality },
  codecs:
    typeof globalThis.RTCRtpTransceiver?.prototype?.setCodecPreferences === 'function'
      ? availableCodecs()
      : [],
  senderStatus,
  codecStatus,
});
function tuneSender(current) {
  senderQueue = senderQueue.catch(() => {}).then(() => applySender(current));
  return senderQueue;
}
async function applySender(current) {
  if (!phone || current !== pc || !current?.remoteDescription) return;
  const target = quality;
  try {
    const result = await configureSender(
      current.getSenders().find((s) => s.track?.kind === 'video'),
      target,
    );
    if (current !== pc || target !== quality) return;
    senderStatus = `${result.confirmed ? 'Bitrate limit accepted' : 'Bitrate limit not confirmed'}; adaptation: ${result.policy}.`;
  } catch (error) {
    if (current !== pc || target !== quality) return;
    senderStatus = `Sender controls not applied: ${error.message}`;
  }
  window.dispatchEvent(new Event('capturechange'));
}
export async function changeQuality(value) {
  const next = validateQuality(value, getQuality().codecs);
  const track = media?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') throw new Error('Start the phone camera first.');
  const old = quality;
  await track.applyConstraints({ ...track.getConstraints(), ...captureTargets(next) });
  if (track !== media?.getVideoTracks()[0]) throw new Error('Camera changed during the request.');
  quality = next;
  setHint(track, next.profile);
  if (!pc?.remoteDescription || next.codec !== old.codec || next.profile !== old.profile) {
    await offer();
    return 'Quality targets updated. Check actual statistics after renegotiation.';
  }
  await tuneSender(pc);
  return senderStatus;
}
async function refreshStats() {
  if (statsBusy || !pc || pc.connectionState !== 'connected') return;
  const current = pc;
  statsBusy = true;
  try {
    const report = await current.getStats();
    if (current !== pc || current.connectionState !== 'connected') return;
    const result = videoStats(report, phone ? 'outbound' : 'inbound', previousStats);
    previousStats = result.sample;
    const m = result.metrics;
    if (!m) {
      metrics.textContent = 'Waiting for video RTP statistics.';
      window.dispatchEvent(new Event('ada-stats-reset'));
      return;
    }
    window.dispatchEvent(
      new CustomEvent('ada-stats', {
        detail: { report, direction: phone ? 'outbound' : 'inbound', ...result },
      }),
    );
    const format = (v, digits = 0) => (v === null ? 'N/A' : v.toFixed(digits));
    metrics.textContent = `${phone ? 'Sending' : 'Receiving'}: ${format(m.width)} x ${format(m.height)} | ${format(m.fps, 1)} FPS | ${format(m.mbps, 2)} Mbps | ${m.codec ?? 'N/A'}${phone ? ` | Limit: ${m.limitation ?? 'N/A'} | ${senderStatus} ${codecStatus}` : ` | Dropped frames: ${format(m.dropped)}`}`;
  } catch {
    if (current === pc) {
      metrics.textContent = 'Video statistics unavailable.';
      window.dispatchEvent(new Event('ada-stats-reset'));
    }
  } finally {
    statsBusy = false;
  }
}
const statsTimer = setInterval(refreshStats, 1000);
function resetPeer() {
  if (pc) {
    pc.onconnectionstatechange = null;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.close();
  }
  pc = null;
  previousStats = null;
  window.dispatchEvent(new Event('ada-stats-reset'));
  metrics.textContent = 'Waiting for WebRTC video statistics.';
  queue = [];
  if (!phone) $('video').srcObject = null;
}
export function stopMedia() {
  captureGeneration++;
  media?.getTracks().forEach((t) => t.stop());
  media = null;
  resetPeer();
  $('video').srcObject = null;
  send({ type: 'stopped' });
  window.dispatchEvent(new Event('capturechange'));
}
function peer(id) {
  resetPeer();
  epoch = id;
  const current = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
  current.pendingCandidates = [];
  current.descriptionSent = false;
  pc = current;
  current.onicecandidate = (event) => {
    if (event.candidate) {
      const data = { type: 'candidate', candidate: event.candidate.toJSON(), epoch: id };
      if (current.descriptionSent) send(data);
      else current.pendingCandidates.push(data);
    }
  };
  current.ontrack = (event) => {
    if (current !== pc) return;
    $('video').srcObject = event.streams[0];
    $('video')
      .play()
      .catch(() => status('Press Play on the video to start playback.'));
  };
  current.onconnectionstatechange = () => {
    if (current !== pc) return;
    status(`Media: ${current.connectionState}`);
    if (current.connectionState !== 'connected') {
      previousStats = null;
      window.dispatchEvent(new Event('ada-stats-reset'));
      metrics.textContent = `Media: ${current.connectionState}. No current video statistics.`;
    }
    if (current.connectionState === 'failed')
      status('Media connection failed. The phone may attempt bounded recovery.');
  };
  return current;
}
export async function offer() {
  if (!media) return;
  const current = peer(crypto.randomUUID());
  senderStatus = 'Waiting for negotiation';
  codecStatus = '';
  media.getTracks().forEach((track) => {
    const sender = current.addTrack(track, media);
    if (track.kind === 'video') {
      setHint(track, quality.profile);
      try {
        preferCodec(
          current.getTransceivers().find((t) => t.sender === sender),
          quality.codec,
        );
      } catch (error) {
        codecStatus = `Codec preference not applied: ${error.message}`;
      }
    }
  });
  await current.setLocalDescription(await current.createOffer());
  if (current !== pc) return;
  send({
    type: 'offer',
    description: current.localDescription.toJSON(),
    epoch,
    profile: quality.profile,
    codec: quality.codec,
  });
  current.descriptionSent = true;
  current.pendingCandidates.splice(0).forEach(send);
}
export async function recoverMedia(current) {
  if (
    !phone ||
    closed ||
    !authenticated ||
    ws?.readyState !== WebSocket.OPEN ||
    current !== pc ||
    !media?.getVideoTracks().some((track) => track.readyState === 'live') ||
    !['failed', 'disconnected', 'connecting', 'new'].includes(current.connectionState)
  ) {
    return false;
  }
  await offer();
  return true;
}
export async function capture(
  videoConstraints = {
    facingMode: { ideal: 'environment' },
    ...captureTargets(quality),
  },
  microphoneEnabled = true,
) {
  stopMedia();
  const generation = captureGeneration;
  const acquired = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: $('audio').checked,
  });
  if (generation !== captureGeneration || ws?.readyState !== WebSocket.OPEN) {
    acquired.getTracks().forEach((t) => t.stop());
    throw new Error('Connection lost. Pair again before starting.');
  }
  media = acquired;
  media.getAudioTracks().forEach((track) => {
    track.enabled = microphoneEnabled;
  });
  $('video').srcObject = media;
  media.getVideoTracks()[0].onended = () => {
    stopMedia();
    status('Camera ended. Start it again on this phone.');
  };
  try {
    await offer();
  } catch (error) {
    if (generation === captureGeneration) stopMedia();
    throw error;
  }
  window.dispatchEvent(new Event('capturechange'));
}
async function message(m) {
  if (m.type === 'network-changed' && !phone && !m.paired) send({ type: 'pair' });
  if (m.type === 'authenticated') {
    authenticated = true;
    retryAttempt = 0;
    if (phone) {
      token = m.resume;
      $('start').disabled = false;
      status('Paired. Press Start camera to grant camera access.');
    } else {
      status('Studio ready. Create a pairing code.');
      send({ type: 'pair' });
    }
  } else if (m.type === 'pairing') {
    resetPeer();
    $('qr').hidden = !m.qr;
    if (m.qr) $('qr').src = m.qr;
    $('link').textContent = m.link ?? 'No LAN interface found';
    if (m.link) $('link').href = m.link;
    else $('link').removeAttribute('href');
    $('expiry').textContent = `Expires at ${new Date(m.expires).toLocaleTimeString('en-GB')}`;
    $('network').replaceChildren(
      ...m.urls.map((url) => {
        const option = document.createElement('option');
        option.value = url;
        option.textContent = url;
        option.selected = m.link?.startsWith(url + '/');
        return option;
      }),
    );
  } else if (m.type === 'paired') {
    $('qr').hidden = true;
    $('link').removeAttribute('href');
    $('link').textContent = 'Phone paired';
    status('Phone paired. Waiting for camera.');
  } else if (m.type === 'offer' && !phone) {
    const current = peer(m.epoch);
    await current.setRemoteDescription(m.description);
    for (const transceiver of current.getTransceivers()) {
      if (transceiver.receiver.track?.kind !== 'video') continue;
      configureReceiver(transceiver.receiver, m.profile);
      if (['H264', 'VP8', 'VP9', 'AV1'].includes(m.codec)) {
        try {
          preferCodec(transceiver, m.codec);
        } catch {
          // The receiver may negotiate a different supported codec.
        }
      }
    }
    await current.setLocalDescription(await current.createAnswer());
    if (current !== pc) return;
    send({ type: 'answer', description: current.localDescription.toJSON(), epoch });
    current.descriptionSent = true;
    current.pendingCandidates.splice(0).forEach(send);
  } else if (m.type === 'answer' && phone && m.epoch === epoch && pc) {
    const current = pc;
    await current.setRemoteDescription(m.description);
    if (current !== pc) return;
    for (const candidate of queue) await current.addIceCandidate(candidate);
    queue = [];
    await tuneSender(current);
  } else if (m.type === 'candidate' && m.epoch === epoch && pc) {
    if (pc.remoteDescription) await pc.addIceCandidate(m.candidate);
    else queue.push(m.candidate);
  } else if (m.type === 'stop' && phone) {
    stopMedia();
    status('Camera stopped by computer.');
  } else if (['left', 'stopped'].includes(m.type)) {
    resetPeer();
    status('Camera disconnected or stopped.');
  } else if (m.type === 'error') status(m.message);
  window.dispatchEvent(new CustomEvent('signalmessage', { detail: m }));
}
function connect() {
  if (closed) return;
  authenticated = false;
  const socket = new WebSocket(`wss://${location.host}/signal`);
  ws = socket;
  socket.onopen = () => {
    if (socket === ws && !closed) send({ type: 'hello', role: phone ? 'phone' : 'controller', token });
  };
  socket.onmessage = (event) => {
    chain = chain
      .then(() => {
        if (socket === ws && !closed && socket.readyState === WebSocket.OPEN)
          return message(JSON.parse(event.data));
      })
      .catch((error) => status(error.message));
  };
  socket.onclose = (event) => {
    if (socket !== ws) return;
    authenticated = false;
    window.dispatchEvent(new CustomEvent('signalmessage', { detail: { type: 'left' } }));
    stopMedia();
    $('start').disabled = true;
    status(event.reason || 'Signaling disconnected. Reconnecting...');
    if (!closed && ![4001, 4003, 4008].includes(event.code)) {
      retry = setTimeout(connect, signalRetryDelay(retryAttempt++));
    }
  };
  socket.onerror = () => {
    if (socket === ws && !closed)
      status('Cannot connect. Check HTTPS trust and use localhost for the computer studio.');
  };
}
$('title').textContent = phone ? 'Your phone camera' : 'Camera studio';
$('pairing').hidden = phone;
$('capture').hidden = !phone;
$('sound').hidden = phone;
$('pair').onclick = () => send({ type: 'pair', url: $('network').value });
$('network').onchange = () => send({ type: 'pair', url: $('network').value });
$('revoke').onclick = () => {
  resetPeer();
  send({ type: 'revoke' });
};
$('start').onclick = async () => {
  $('start').disabled = true;
  try {
    await capture();
  } catch (error) {
    status(`${error.name}: ${error.message}`);
  } finally {
    $('start').disabled = false;
  }
};
$('stop').onclick = () => {
  stopMedia();
  status('Camera stopped.');
};
$('sound').onclick = () => {
  $('video').muted = !$('video').muted;
  $('sound').textContent = $('video').muted ? 'Enable monitor audio' : 'Mute monitor audio';
};
window.addEventListener('pagehide', () => {
  closed = true;
  clearTimeout(retry);
  clearInterval(statsTimer);
  stopMedia();
  ws?.close();
});
if (!phone && location.hostname !== 'localhost')
  status('Open the studio using https://localhost on the computer.');
else if (phone && !token) status('Scan a fresh pairing QR code from the computer studio.');
else if (!window.isSecureContext) status('Trust the local CA before using the camera.');
else connect();
