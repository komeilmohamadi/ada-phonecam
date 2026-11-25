import {
  isPhone,
  getMedia,
  capture,
  stopMedia,
  send,
  getQuality,
  changeQuality,
} from './stream.js';
import { profiles, resolutions } from './quality.js';
import {
  numericControls,
  modeControls,
  controlSupported,
  applyCameraControl,
} from './camera-controls.js';
const container = document.getElementById('controls');
let responseTimer;
let latest = null,
  commands = Promise.resolve(),
  busy = false;
const names = {
  width: 'Width',
  height: 'Height',
  frameRate: 'Frame rate',
  zoom: 'Zoom',
  focusDistance: 'Focus distance',
  focusMode: 'Focus mode',
  exposureMode: 'Exposure mode',
  exposureCompensation: 'Exposure compensation',
  exposureTime: 'Exposure time',
  iso: 'ISO',
  whiteBalanceMode: 'White balance',
  colorTemperature: 'Color temperature',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  torch: 'Torch',
};
async function report() {
  const media = getMedia(),
    track = media?.getVideoTracks()[0];
  if (!track) {
    send({ type: 'capabilities', camera: null });
    return;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  if (track !== getMedia()?.getVideoTracks()[0]) return;
  send({
    type: 'capabilities',
    camera: {
      id: track.id,
      capabilities: track.getCapabilities?.() ?? {},
      settings: track.getSettings(),
      quality: getQuality(),
      devices: devices
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ id: d.deviceId, label: d.label || 'Camera' })),
      audio: media.getAudioTracks().length > 0,
      microphone: media.getAudioTracks().some((t) => t.enabled),
    },
  });
}
async function execute(m) {
  const media = getMedia(),
    track = media?.getVideoTracks()[0];
  try {
    if (!track || track.id !== m.cameraId)
      throw new Error('Camera session changed. Wait for updated controls.');
    let message = 'Updated.';
    if (m.name === 'quality') {
      message = await changeQuality(m.value);
    } else if (m.name === 'deviceId') {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((d) => d.kind === 'videoinput' && d.deviceId === m.value))
        throw new Error('Camera is unavailable.');
      const s = track.getSettings();
      await capture(
        {
          deviceId: { exact: m.value },
          width: { ideal: s.width },
          height: { ideal: s.height },
          frameRate: { ideal: s.frameRate },
        },
        media.getAudioTracks().some((t) => t.enabled),
      );
      message = 'Camera switched. Check the actual capture settings.';
    } else if (m.name === 'microphone') {
      if (typeof m.value !== 'boolean' || !media.getAudioTracks().length)
        throw new Error('Enable microphone capture on the phone first.');
      media.getAudioTracks().forEach((t) => {
        t.enabled = m.value;
      });
    } else if (m.name === 'stop') {
      stopMedia();
      message = 'Camera stopped.';
    } else {
      const result = await applyCameraControl(track, m.name, m.value);
      message = result.verified
        ? 'Camera confirmed the requested value.'
        : `Requested value was not confirmed. Actual: ${result.actual ?? 'not reported'}.`;
    }
    send({ type: 'control-result', requestId: m.requestId, ok: true, message });
  } catch (error) {
    send({
      type: 'control-result',
      requestId: m.requestId,
      ok: false,
      message: `${error.name}: ${error.message}`,
    });
  }
  await report();
}
function command(name, value) {
  if (!latest || busy) return;
  busy = true;
  container.querySelectorAll('input,select,button').forEach((el) => {
    el.disabled = true;
  });
  send({ type: 'control', cameraId: latest.id, requestId: crypto.randomUUID(), name, value });
  clearTimeout(responseTimer);
  responseTimer = setTimeout(() => {
    render(latest);
    document.getElementById('status').textContent =
      'Camera did not acknowledge the change. Check the phone before retrying.';
  }, 12000);
}
function render(camera) {
  clearTimeout(responseTimer);
  latest = camera;
  busy = false;
  container.replaceChildren();
  const summary = document.createElement('p');
  if (!camera) {
    summary.textContent = 'Start the phone camera to see supported controls.';
    container.append(summary);
    return;
  }
  const s = camera.settings;
  summary.textContent = `Actual capture: ${s.width ?? '?'} × ${s.height ?? '?'} at ${s.frameRate ?? '?'} FPS. Receive quality may differ.`;
  container.append(summary);
  function field(title, input) {
    const label = document.createElement('label');
    label.append(document.createTextNode(title), input);
    container.append(label);
  }
  if (camera.quality?.target) {
    const q = camera.quality.target;
    const select = (entries, selected) => {
      const el = document.createElement('select');
      for (const [value, title] of entries) el.add(new Option(title, value));
      el.value = String(selected);
      return el;
    };
    const profile = select(
      Object.entries(profiles).map(([key, p]) => [key, p.label]),
      q.profile,
    );
    const resolution = select(
      Object.keys(resolutions).map((v) => [v, v === '2160' ? '4K UHD' : `${v}p`]),
      q.resolution,
    );
    const fps = select(
      [
        [30, '30 FPS'],
        [60, '60 FPS'],
      ],
      q.fps,
    );
    const bitrate = document.createElement('input');
    bitrate.type = 'number';
    bitrate.min = '1';
    bitrate.max = '150';
    bitrate.step = '0.5';
    bitrate.value = q.bitrate;
    const codec = select(
      [['auto', 'Automatic'], ...camera.quality.codecs.map((c) => [c, c])],
      q.codec,
    );
    codec.disabled = camera.quality.codecs.length === 0;
    profile.onchange = () => {
      bitrate.value = profiles[profile.value].bitrate;
    };
    field('Performance profile', profile);
    field('Resolution target', resolution);
    field('Frame rate target', fps);
    field('Video bitrate limit (Mbps)', bitrate);
    field('Preferred codec (negotiated)', codec);
    const apply = document.createElement('button');
    apply.textContent = 'Apply quality targets';
    apply.onclick = () => {
      if (!bitrate.checkValidity() || !bitrate.value) {
        bitrate.reportValidity();
        return;
      }
      command('quality', {
        profile: profile.value,
        resolution: Number(resolution.value),
        fps: Number(fps.value),
        bitrate: Number(bitrate.value),
        codec: codec.value,
      });
    };
    container.append(apply);
    const qualityNote = document.createElement('p');
    qualityNote.textContent = `Targets are not guaranteed. ${camera.quality.senderStatus} ${camera.quality.codecStatus}`;
    container.append(qualityNote);
  }
  const devices = document.createElement('select');
  for (const device of camera.devices) {
    const option = new Option(device.label, device.id);
    option.selected = device.id === s.deviceId;
    devices.add(option);
  }
  devices.disabled = camera.devices.length < 2;
  devices.onchange = () => command('deviceId', devices.value);
  field('Camera / lens', devices);
  for (const name of [...numericControls, ...modeControls, 'torch']) {
    const cap = camera.capabilities[name],
      supported = controlSupported(camera.capabilities, name);
    let input;
    if (modeControls.includes(name)) {
      input = document.createElement('select');
      for (const v of supported ? cap : ['Unavailable']) input.add(new Option(v, v));
      input.value = s[name] ?? input.value;
    } else {
      input = document.createElement('input');
      input.type = name === 'torch' ? 'checkbox' : 'number';
      if (name === 'torch') input.checked = Boolean(s[name]);
      else if (supported) {
        input.min = cap.min;
        input.max = cap.max;
        input.step = cap.step ?? 'any';
        input.value = s[name] ?? cap.min;
      }
    }
    input.disabled = !supported;
    input.title = supported
      ? `Actual: ${s[name] ?? 'not reported'}`
      : 'Not exposed by this camera/browser';
    input.onchange = () =>
      command(
        name,
        name === 'torch'
          ? input.checked
          : modeControls.includes(name)
            ? input.value
            : Number(input.value),
      );
    field(names[name], input);
  }
  const mic = document.createElement('input');
  mic.type = 'checkbox';
  mic.checked = camera.microphone;
  mic.disabled = !camera.audio;
  mic.onchange = () => command('microphone', mic.checked);
  field('Microphone (requires phone consent)', mic);
  const stop = document.createElement('button');
  stop.textContent = 'Stop phone camera';
  stop.onclick = () => command('stop', true);
  container.append(stop);
}
if (isPhone) {
  window.addEventListener('capturechange', () => {
    report().catch(() => {});
  });
  window.addEventListener('signalmessage', (event) => {
    if (event.detail.type === 'control')
      commands = commands
        .then(() => execute(event.detail))
        .catch((error) => send({ type: 'error', message: error.message }));
  });
} else {
  render(null);
  window.addEventListener('signalmessage', (event) => {
    const m = event.detail;
    if (m.type === 'capabilities') render(m.camera);
    if (m.type === 'control-result') {
      busy = false;
      document.getElementById('status').textContent = m.message;
    }
    if (['left', 'stopped', 'pairing'].includes(m.type)) render(null);
  });
}
