export const rotations = [0, 90, 180, 270];

export function normalizeFeedSettings(value = {}) {
  const rotation = Number(value.rotation);
  return {
    rotation: rotations.includes(rotation) ? rotation : 0,
    mirrorX: value.mirrorX === true,
    mirrorY: value.mirrorY === true,
    audio: value.audio === true,
  };
}

export function isFeedWindow(expected, caller, origin) {
  if (!expected || expected !== caller) return false;
  try {
    return (
      !caller.closed && caller.location.origin === origin && caller.location.pathname === '/view'
    );
  } catch {
    return false;
  }
}

export function selectLiveStream(stream, connectionState) {
  if (connectionState !== 'connected' || !stream?.getVideoTracks) return null;
  return stream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted)
    ? stream
    : null;
}

export function feedAudioAllowed(settings, stream) {
  return (
    settings.audio === true &&
    Boolean(stream?.getAudioTracks().some((track) => track.readyState === 'live' && !track.muted))
  );
}
