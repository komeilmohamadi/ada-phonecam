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
  closed = false;
const status = (text) => {
  $('status').textContent = text;
};
export const send = (data) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
};
export const getMedia = () => media;
export const getPeer = () => pc;
export const isPhone = phone;
function resetPeer() {
  if (pc) {
    pc.onconnectionstatechange = null;
    pc.close();
  }
  pc = null;
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
    $('video').srcObject = event.streams[0];
    $('video')
      .play()
      .catch(() => status('Press Play on the video to start playback.'));
  };
  current.onconnectionstatechange = () => {
    status(`Media: ${current.connectionState}`);
    if (current.connectionState === 'failed')
      status('Media connection failed. Stop and start the camera to retry.');
  };
  return current;
}
export async function offer() {
  if (!media) return;
  const current = peer(crypto.randomUUID());
  media.getTracks().forEach((track) => current.addTrack(track, media));
  await current.setLocalDescription(await current.createOffer());
  send({ type: 'offer', description: current.localDescription.toJSON(), epoch });
  current.descriptionSent = true;
  current.pendingCandidates.splice(0).forEach(send);
}
export async function capture(
  videoConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60 },
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
  await offer();
  window.dispatchEvent(new Event('capturechange'));
}
async function message(m) {
  if (m.type === 'network-changed' && !phone && !m.paired) send({ type: 'pair' });
  if (m.type === 'authenticated') {
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
    await current.setLocalDescription(await current.createAnswer());
    send({ type: 'answer', description: current.localDescription.toJSON(), epoch });
    current.descriptionSent = true;
    current.pendingCandidates.splice(0).forEach(send);
  } else if (m.type === 'answer' && phone && m.epoch === epoch && pc) {
    await pc.setRemoteDescription(m.description);
    for (const candidate of queue) await pc.addIceCandidate(candidate);
    queue = [];
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
  ws = new WebSocket(`wss://${location.host}/signal`);
  ws.onopen = () => send({ type: 'hello', role: phone ? 'phone' : 'controller', token });
  ws.onmessage = (event) => {
    chain = chain
      .then(() => message(JSON.parse(event.data)))
      .catch((error) => status(error.message));
  };
  ws.onclose = (event) => {
    window.dispatchEvent(new CustomEvent('signalmessage', { detail: { type: 'left' } }));
    stopMedia();
    $('start').disabled = true;
    status(event.reason || 'Signaling disconnected. Reconnecting...');
    if (!closed && ![4001, 4003, 4008].includes(event.code)) retry = setTimeout(connect, 2000);
  };
  ws.onerror = () =>
    status('Cannot connect. Check HTTPS trust and use localhost for the computer studio.');
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
  stopMedia();
  ws?.close();
});
if (!phone && location.hostname !== 'localhost')
  status('Open the studio using https://localhost on the computer.');
else if (phone && !token) status('Scan a fresh pairing QR code from the computer studio.');
else if (!window.isSecureContext) status('Trust the local CA before using the camera.');
else connect();
