import { validateQuality } from './quality.js';

export const themeKey = 'ada-phonecam.theme.v1';
const presetKey = 'ada-phonecam.quality.v1';
export const presetSlots = ['1', '2', '3'];
const codecs = ['H264', 'VP8', 'VP9', 'AV1'];

export function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark';
}

export function readTheme(storage) {
  try {
    return normalizeTheme(storage.getItem(themeKey));
  } catch {
    return 'dark';
  }
}

export function saveTheme(storage, value) {
  try {
    storage.setItem(themeKey, normalizeTheme(value));
    return true;
  } catch {
    return false;
  }
}

function presets(storage) {
  try {
    const raw = JSON.parse(storage.getItem(presetKey) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    const result = {};
    for (const slot of presetSlots) {
      try {
        result[slot] = validateQuality(raw[slot], codecs);
      } catch {
        // Invalid or obsolete slots are ignored.
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function loadPreset(storage, slot, available) {
  if (!presetSlots.includes(slot)) throw new Error('Invalid preset slot.');
  const value = presets(storage)[slot];
  if (!value) throw new Error('This preset slot is empty.');
  return validateQuality(value, available);
}

export function savePreset(storage, slot, value, available) {
  if (!presetSlots.includes(slot)) throw new Error('Invalid preset slot.');
  const next = validateQuality(value, available);
  storage.setItem(presetKey, JSON.stringify({ ...presets(storage), [slot]: next }));
  return next;
}
