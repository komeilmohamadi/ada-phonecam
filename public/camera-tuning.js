import { captureTargets } from './quality.js';

export function orientedTargets(quality, settings = {}, mode = 'keep') {
  if (!['keep', 'landscape', 'portrait'].includes(mode)) throw new Error('Invalid orientation.');
  const target = captureTargets(quality);
  const portrait = mode === 'portrait' || (mode === 'keep' && settings.height > settings.width);
  if (portrait) [target.width, target.height] = [target.height, target.width];
  return { ...target, aspectRatio: { ideal: target.width.ideal / target.height.ideal } };
}

export function qualityConstraints(track, previous, next, mode = 'keep') {
  if (!['keep', 'landscape', 'portrait'].includes(mode)) throw new Error('Invalid orientation.');
  const settings = track.getSettings();
  const constraints = track.getConstraints();
  if (mode === 'keep' && previous.resolution === next.resolution) {
    if (previous.fps === next.fps) return null;
    return { ...constraints, frameRate: captureTargets(next).frameRate };
  }
  return { ...constraints, ...orientedTargets(next, settings, mode) };
}

export function listedCameras(devices, settings = {}, label = '') {
  const cameras = new Map();
  for (const device of devices) {
    if (device.kind !== 'videoinput' || !device.deviceId || cameras.has(device.deviceId)) continue;
    cameras.set(device.deviceId, {
      id: device.deviceId,
      label: device.label || `Camera ${cameras.size + 1}`,
    });
  }
  if (settings.deviceId && !cameras.has(settings.deviceId)) {
    cameras.set(settings.deviceId, { id: settings.deviceId, label: label || 'Current camera' });
  }
  return [...cameras.values()];
}

export function lowNoiseTarget(resolution) {
  const limits = { 480: 5, 720: 10, 1080: 20, 1440: 28, 2160: 40 };
  if (!Object.hasOwn(limits, resolution)) throw new Error('Invalid resolution.');
  return { profile: 'quality', fps: 30, bitrate: limits[resolution] };
}

export function recommendNetwork(mbps) {
  if (!Number.isFinite(mbps) || mbps <= 0) return null;
  if (mbps >= 100) return { resolution: 2160, fps: 30, bitrate: 35 };
  if (mbps >= 45) return { resolution: 1080, fps: 60, bitrate: 15 };
  if (mbps >= 20) return { resolution: 1080, fps: 30, bitrate: 8 };
  if (mbps >= 8) return { resolution: 720, fps: 30, bitrate: 3 };
  return { resolution: 480, fps: 30, bitrate: 1 };
}

export function luminanceSummary(rgba) {
  const bins = Array(8).fill(0);
  let sum = 0;
  const count = Math.floor(rgba.length / 4);
  if (!count) return null;
  for (let i = 0; i < count * 4; i += 4) {
    const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    sum += y;
    bins[Math.min(7, Math.floor(y / 32))]++;
  }
  return { mean: sum / count, bins, lowLight: sum / count < 70 && bins[0] + bins[1] > count * 0.5 };
}
