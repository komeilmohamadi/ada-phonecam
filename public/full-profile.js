import { validateQuality } from './quality.js';
import { orientedTargets } from './camera-tuning.js';
import { applyCameraControl, controlSupported, numericControls, modeControls } from './camera-controls.js';

const key = 'ada-phonecam.full-profile.v1';
const codecs = ['H264', 'VP8', 'VP9', 'AV1'];
const dimensions = ['width', 'height', 'frameRate'];
const image = numericControls.filter((name) => !dimensions.includes(name));
const allowed = [...modeControls, ...image, 'torch'];
const modesFor = { focusDistance: 'focusMode', iso: 'exposureMode', exposureTime: 'exposureMode', colorTemperature: 'whiteBalanceMode' };

function normalize(value) {
  if (!value || value.version !== 1 || typeof value.deviceId !== 'string' || !value.deviceId || value.deviceId.length > 512) {
    throw new Error('Invalid camera profile.');
  }
  if (!['landscape', 'portrait'].includes(value.orientation)) throw new Error('Invalid profile orientation.');
  const controls = {};
  for (const name of allowed) {
    const v = value.controls?.[name];
    if (numericControls.includes(name) ? Number.isFinite(v) : name === 'torch' ? typeof v === 'boolean' : typeof v === 'string' && v.length <= 32) controls[name] = v;
  }
  const manual = {};
  for (const name of dimensions) {
    const v = value.manual?.[name];
    if (Number.isFinite(v) && v > 0 && v <= 16384) manual[name] = v;
  }
  return {
    version: 1,
    deviceId: value.deviceId,
    orientation: value.orientation,
    quality: validateQuality(value.quality, codecs),
    controls,
    manual,
    microphone: value.microphone === true,
  };
}

export function readFullProfile(storage) {
  try {
    return normalize(JSON.parse((storage ?? globalThis.localStorage).getItem(key)));
  } catch {
    return null;
  }
}

export function saveFullProfile(storage, track, quality, microphone) {
  if (track.readyState !== 'live') throw new Error('Start the phone camera first.');
  const settings = track.getSettings();
  const caps = track.getCapabilities();
  const controls = {};
  for (const name of allowed) {
    if (controlSupported(caps, name) && settings[name] !== undefined) controls[name] = settings[name];
  }
  const manual = {};
  const constraints = track.getConstraints();
  for (const name of dimensions) {
    if (Number.isFinite(constraints[name]?.exact)) manual[name] = constraints[name].exact;
  }
  const saved = normalize({
    version: 1,
    deviceId: settings.deviceId,
    orientation: settings.height > settings.width ? 'portrait' : 'landscape',
    quality,
    controls,
    manual,
    microphone,
  });
  storage.setItem(key, JSON.stringify(saved));
  if (!readFullProfile(storage)) throw new Error('Profile storage could not be verified.');
  return saved;
}

export function profileConstraints(saved) {
  const profile = normalize(saved);
  const target = orientedTargets(profile.quality, {}, profile.orientation);
  for (const [name, value] of Object.entries(profile.manual)) target[name] = { exact: value };
  return { ...target, deviceId: { exact: profile.deviceId } };
}

export async function restoreProfileControls(track, saved) {
  const profile = normalize(saved);
  const problems = [];
  for (const name of allowed) {
    if (!Object.hasOwn(profile.controls, name)) continue;
    if (track.readyState !== 'live') throw new Error('Camera stopped during profile restore.');
    const value = profile.controls[name];
    const mode = modesFor[name];
    // Preserve an automatic mode instead of accidentally switching it to manual.
    if (mode && profile.controls[mode] && profile.controls[mode] !== 'manual') continue;
    try {
      const result = await applyCameraControl(track, name, value);
      if (!result.verified) problems.push(name);
    } catch {
      problems.push(name);
    }
  }
  const settings = track.getSettings();
  if (profile.deviceId !== settings.deviceId) problems.push('deviceId');
  if (Number.isFinite(settings.width) && Number.isFinite(settings.height) && (settings.height > settings.width ? 'portrait' : 'landscape') !== profile.orientation) problems.push('orientation');
  return problems.length
    ? `Saved profile requested. Not confirmed: ${problems.join(', ')}. Check actual capture statistics.`
    : 'Saved profile requested. Check actual capture and negotiated quality.';
}
