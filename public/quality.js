export const resolutions = Object.freeze({
  480: [854, 480],
  720: [1280, 720],
  1080: [1920, 1080],
  1440: [2560, 1440],
  2160: [3840, 2160],
});
export const profiles = Object.freeze({
  latency: {
    label: 'Ultra Low Latency',
    bitrate: 8,
    degradation: 'maintain-framerate',
    hint: 'motion',
  },
  balanced: { label: 'Balanced', bitrate: 12, degradation: 'balanced', hint: '' },
  quality: {
    label: 'Maximum Quality',
    bitrate: 25,
    degradation: 'maintain-resolution',
    hint: 'detail',
  },
});
export const defaultQuality = Object.freeze({
  resolution: 1080,
  fps: 60,
  bitrate: 12,
  codec: 'auto',
  profile: 'balanced',
});
const codecNames = ['H264', 'VP8', 'VP9', 'AV1'];
const mime = (codec) => codec?.mimeType?.toUpperCase();
export function availableCodecs(
  sender = globalThis.RTCRtpSender,
  receiver = globalThis.RTCRtpReceiver,
) {
  const send = sender?.getCapabilities?.('video')?.codecs ?? [];
  const receive = receiver?.getCapabilities?.('video')?.codecs ?? [];
  return codecNames.filter(
    (name) =>
      send.some((c) => mime(c) === `VIDEO/${name}`) &&
      receive.some((c) => mime(c) === `VIDEO/${name}`),
  );
}
export function validateQuality(value, codecs = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isInteger(value.resolution) ||
    !Object.hasOwn(resolutions, value.resolution) ||
    ![30, 60].includes(value.fps)
  )
    throw new Error('Choose a valid resolution and frame rate target.');
  if (
    typeof value.bitrate !== 'number' ||
    !Number.isFinite(value.bitrate) ||
    value.bitrate < 1 ||
    value.bitrate > 150
  )
    throw new Error('Bitrate target must be between 1 and 150 Mbps.');
  if (!Object.hasOwn(profiles, value.profile) || typeof value.profile !== 'string')
    throw new Error('Unknown performance profile.');
  if (
    value.codec !== 'auto' &&
    (!codecNames.includes(value.codec) || !codecs.includes(value.codec))
  )
    throw new Error('Requested codec is not exposed by this browser.');
  const { resolution, fps, bitrate, codec, profile } = value;
  return { resolution, fps, bitrate, codec, profile };
}
export function captureTargets(value) {
  const [width, height] = resolutions[value.resolution];
  return {
    width: { ideal: width, max: width },
    height: { ideal: height, max: height },
    frameRate: { ideal: value.fps, max: value.fps },
  };
}
export function preferCodec(transceiver, name, receiver = globalThis.RTCRtpReceiver) {
  if (name === 'auto') return;
  if (typeof transceiver?.setCodecPreferences !== 'function')
    throw new Error('Codec preferences are unavailable.');
  const codecs = receiver?.getCapabilities?.('video')?.codecs ?? [];
  const preferred = codecs.filter((c) => mime(c) === `VIDEO/${name}`);
  if (!preferred.length) throw new Error('Requested codec is unavailable.');
  // Keep alternate codecs and repair formats so negotiation can fall back safely.
  transceiver.setCodecPreferences([...preferred, ...codecs.filter((c) => !preferred.includes(c))]);
}
export function setHint(track, profile) {
  try {
    if ('contentHint' in track) track.contentHint = profiles[profile].hint;
  } catch {
    // Optional browser hint; never a guarantee of encoder behavior.
  }
}
export async function configureSender(sender, value) {
  if (!sender?.getParameters || !sender?.setParameters)
    throw new Error('Sender controls unavailable.');
  const p = sender.getParameters();
  if (!p.encodings?.length) throw new Error('Sender encoding is not negotiated yet.');
  const maxBitrate = Math.round(value.bitrate * 1e6);
  for (const encoding of p.encodings) encoding.maxBitrate = maxBitrate;
  await sender.setParameters(p);
  const confirmed = sender.getParameters().encodings?.every((e) => e.maxBitrate === maxBitrate);
  let policy = 'browser default';
  try {
    const next = sender.getParameters();
    next.degradationPreference = profiles[value.profile].degradation;
    await sender.setParameters(next);
    if (sender.getParameters().degradationPreference === next.degradationPreference)
      policy = next.degradationPreference;
  } catch {
    // The bitrate limit is independent of this optional preference.
  }
  return { confirmed: Boolean(confirmed), policy };
}
export function configureReceiver(receiver, profile) {
  if (!receiver || !('jitterBufferTarget' in receiver)) return false;
  try {
    receiver.jitterBufferTarget = profile === 'latency' ? 0 : null;
    return profile === 'latency' && receiver.jitterBufferTarget === 0;
  } catch {
    return false;
  }
}
export function videoStats(report, direction, previous = null) {
  const type = direction === 'outbound' ? 'outbound-rtp' : 'inbound-rtp';
  const bytesKey = direction === 'outbound' ? 'bytesSent' : 'bytesReceived';
  const framesKey = direction === 'outbound' ? 'framesEncoded' : 'framesDecoded';
  const candidates = [...report.values()].filter((r) => {
    const codec = mime(report.get(r.codecId));
    return (
      r.type === type &&
      (r.kind ?? r.mediaType) === 'video' &&
      !r.isRemote &&
      !['VIDEO/RTX', 'VIDEO/RED', 'VIDEO/ULPFEC', 'VIDEO/FLEXFEC-03'].includes(codec)
    );
  });
  const r = candidates.sort((a, b) => (b[bytesKey] ?? 0) - (a[bytesKey] ?? 0))[0];
  if (!r) return { sample: null, metrics: null };
  const number = (v) => (Number.isFinite(v) ? v : null);
  const sample = {
    id: r.id,
    timestamp: number(r.timestamp),
    bytes: number(r[bytesKey]),
    frames: number(r[framesKey]),
  };
  const dt =
    previous &&
    previous.id === sample.id &&
    sample.timestamp !== null &&
    previous.timestamp !== null
      ? (sample.timestamp - previous.timestamp) / 1000
      : 0;
  const rate = (key) =>
    dt > 0 && sample[key] !== null && previous[key] !== null && sample[key] >= previous[key]
      ? (sample[key] - previous[key]) / dt
      : null;
  const byteRate = rate('bytes');
  return {
    sample,
    metrics: {
      width: number(r.frameWidth),
      height: number(r.frameHeight),
      fps: number(r.framesPerSecond) ?? rate('frames'),
      mbps: byteRate === null ? null : (byteRate * 8) / 1e6,
      codec: report.get(r.codecId)?.mimeType ?? null,
      limitation: r.qualityLimitationReason ?? null,
      dropped: number(r.framesDropped),
    },
  };
}
