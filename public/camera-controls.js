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
  'sharpness',
];
export const modeControls = ['focusMode', 'exposureMode', 'whiteBalanceMode'];
// Keep the reported sensor value separate from its readable representation.
const positiveStep = (cap) => (Number.isFinite(cap?.step) && cap.step > 0 ? cap.step : 0);

export function formatControlNumber(value, name = '') {
  if (!Number.isFinite(value)) return '';
  const digits = ['width', 'height', 'iso', 'colorTemperature'].includes(name)
    ? 0
    : name === 'focusDistance'
      ? 3
      : name === 'exposureTime'
        ? 6
        : 2;
  const rounded = Number(value.toFixed(digits));
  // Do not turn a genuinely small exposure or focus value into zero.
  return String(rounded === 0 && value !== 0 ? Number(value.toPrecision(5)) : rounded);
}

export function normalizeControlNumber(cap, value) {
  if (
    !Number.isFinite(cap?.min) ||
    !Number.isFinite(cap?.max) ||
    cap.max <= cap.min ||
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < cap.min ||
    value > cap.max
  ) {
    throw new Error('Value is outside the supported range.');
  }
  const step = positiveStep(cap);
  const count = (cap.max - cap.min) / step;
  if (!step || !Number.isFinite(count) || count > 1e9) return value;
  // Quantize relative to the device minimum, not zero. Account for the
  // floating-point error in a grid endpoint such as 0.3 / 0.1.
  const last = Math.floor(count + 1e-7);
  const index = Math.min(last, Math.max(0, Math.round((value - cap.min) / step)));
  return Math.min(cap.max, Math.max(cap.min, cap.min + index * step));
}

export function parseControlNumber(name, cap, text) {
  if (typeof text !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) {
    throw new Error('Enter a numeric value.');
  }
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error('Enter a finite numeric value.');
  // A rounded display endpoint must still select its exact hardware endpoint.
  const min = Number(formatControlNumber(cap.min, name));
  const max = Number(formatControlNumber(cap.max, name));
  const requested =
    value < cap.min && value === min ? cap.min : value > cap.max && value === max ? cap.max : value;
  return normalizeControlNumber(cap, requested);
}

export function incrementControlNumber(name, cap, actual, direction) {
  if (direction !== 1 && direction !== -1) throw new Error('Invalid step direction.');
  const preferred = ['width', 'height', 'frameRate', 'iso', 'colorTemperature'].includes(name)
    ? 1
    : name === 'focusDistance'
      ? 0.01
      : name === 'exposureTime'
        ? positiveStep(cap) || Math.max((cap.max - cap.min) / 100, Number.EPSILON)
        : 0.1;
  const step = Math.max(positiveStep(cap), preferred);
  const current = Number.isFinite(actual) ? actual : cap.min;
  const target = Math.max(cap.min, Math.min(cap.max, current + direction * step));
  return normalizeControlNumber(cap, target);
}

function confirmedNumber(cap, actual, expected) {
  if (!Number.isFinite(actual)) return false;
  const tolerance = Math.max(Math.abs(expected) * 1e-7, 1e-12);
  const step = positiveStep(cap);
  return Math.abs(actual - expected) <= (step ? Math.min(tolerance, step / 4) : tolerance);
}

export function controlSupported(capabilities, name) {
  const cap = capabilities[name];
  if (numericControls.includes(name))
    return cap && Number.isFinite(cap.min) && Number.isFinite(cap.max) && cap.max > cap.min;
  if (modeControls.includes(name)) return Array.isArray(cap) && cap.length > 0;
  if (name === 'torch') return cap === true || (Array.isArray(cap) && cap.includes(true));
  return false;
}
export async function applyCameraControl(track, name, value) {
  if (track.readyState !== 'live') throw new Error('Camera is not running.');
  const caps = track.getCapabilities();
  if (!controlSupported(caps, name)) throw new Error('This camera does not expose that control.');
  const cap = caps[name];
  if (numericControls.includes(name)) {
    value = normalizeControlNumber(cap, value);
  } else if (name === 'torch') {
    if (typeof value !== 'boolean' || (Array.isArray(cap) && !cap.includes(value)))
      throw new Error('This torch value is not supported.');
    return applyTorch(track, value);
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
    const torch = advanced.torch;
    delete advanced.torch;
    constraints.advanced = [advanced];
    if (typeof torch === 'boolean') constraints.advanced.push({ torch });
  }
  await track.applyConstraints(constraints);
  const actual = track.getSettings()[name];
  return {
    actual,
    verified:
      actual !== undefined &&
      (typeof value === 'number' ? confirmedNumber(cap, actual, value) : actual === value),
  };
}

async function applyTorch(track, value) {
  const constraints = structuredClone(track.getConstraints());
  delete constraints.torch;
  constraints.advanced = (constraints.advanced ?? [])
    .map(({ torch, ...rest }) => rest)
    .filter((entry) => Object.keys(entry).length > 0);
  const advanced = [...constraints.advanced, { torch: value }];
  try {
    await track.applyConstraints({ ...constraints, advanced });
    if (track.getSettings().torch === value) return { actual: value, verified: true };
  } catch {
    // Some browsers accept the direct form instead of an advanced constraint.
  }
  try {
    await track.applyConstraints({ ...constraints, torch: { exact: value } });
  } catch (error) {
    const actual = track.getSettings().torch;
    if (actual !== value) throw error;
  }
  const actual = track.getSettings().torch;
  return { actual, verified: actual === value };
}
