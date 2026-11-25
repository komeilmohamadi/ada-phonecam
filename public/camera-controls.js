export const numericControls = [
  'width',
  'height',
  'frameRate',
  'zoom',
  'focusDistance',
  'exposureCompensation',
  'exposureTime',
  'iso',
  'colorTemperature',
  'brightness',
  'contrast',
  'saturation',
];
export const modeControls = ['focusMode', 'exposureMode', 'whiteBalanceMode'];
export function controlSupported(capabilities, name) {
  const cap = capabilities[name];
  if (numericControls.includes(name))
    return cap && Number.isFinite(cap.min) && Number.isFinite(cap.max) && cap.max > cap.min;
  if (modeControls.includes(name)) return Array.isArray(cap) && cap.length > 0;
  if (name === 'torch') return Array.isArray(cap) && cap.includes(true);
  return false;
}
export async function applyCameraControl(track, name, value) {
  if (track.readyState !== 'live') throw new Error('Camera is not running.');
  const caps = track.getCapabilities();
  if (!controlSupported(caps, name)) throw new Error('This camera does not expose that control.');
  const cap = caps[name];
  if (numericControls.includes(name)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < cap.min || value > cap.max)
      throw new Error('Value is outside the supported range.');
  } else if (!cap.includes(value)) throw new Error('This control value is not supported.');
  const constraints = structuredClone(track.getConstraints());
  if (['width', 'height', 'frameRate'].includes(name)) constraints[name] = { exact: value };
  else {
    const advanced = Object.assign({}, ...(constraints.advanced ?? []), { [name]: value });
    const manualMode =
      name === 'focusDistance'
        ? 'focusMode'
        : ['iso', 'exposureTime'].includes(name)
          ? 'exposureMode'
          : name === 'colorTemperature'
            ? 'whiteBalanceMode'
            : null;
    if (manualMode && caps[manualMode]?.includes('manual')) advanced[manualMode] = 'manual';
    constraints.advanced = [advanced];
  }
  await track.applyConstraints(constraints);
  const actual = track.getSettings()[name];
  return {
    actual,
    verified:
      actual !== undefined &&
      (typeof value === 'number' ? Math.abs(actual - value) < 0.01 : actual === value),
  };
}
