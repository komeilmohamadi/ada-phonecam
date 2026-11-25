const finite = (value) => (Number.isFinite(value) ? value : null);
const ms = (value) => (finite(value) === null ? null : value * 1000);

export function networkStats(report, direction, streamId, previous = null) {
  const local = report.get(streamId);
  const remote = direction === 'outbound' ? report.get(local?.remoteId) : local;
  const transport = report.get(local?.transportId);
  const pair = report.get(transport?.selectedCandidatePairId);
  const received = finite(remote?.packetsReceived);
  const lost = finite(remote?.packetsLost);
  const sample = { id: remote?.id ?? null, received, lost };
  let loss = null;
  if (
    sample.id &&
    previous?.id === sample.id &&
    received !== null &&
    lost !== null &&
    previous.received !== null &&
    previous.lost !== null
  ) {
    const dr = received - previous.received;
    const dl = lost - previous.lost;
    if (dr >= 0 && dl >= 0 && dr + dl > 0) loss = (100 * dl) / (dr + dl);
  }
  if (direction === 'outbound' && loss === null) {
    const fraction = finite(remote?.fractionLost);
    if (fraction !== null && fraction >= 0 && fraction <= 1) loss = fraction * 100;
  }
  return {
    sample,
    metrics: {
      loss,
      jitter: ms(remote?.jitter),
      rtt: ms(pair?.currentRoundTripTime ?? remote?.roundTripTime),
      dropped: finite(local?.framesDropped),
      freezes: finite(local?.freezeCount),
    },
  };
}

export function appendSample(history, sample, limit = 60) {
  return [...history, sample].slice(-limit);
}

export function recoveryDelay(attempt) {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < 3 ? 2000 * 2 ** attempt : null;
}

export function shouldRecover(state, elapsed, attempt) {
  const delay = recoveryDelay(attempt);
  return (
    delay !== null &&
    (state === 'failed' || state === 'disconnected' || state === 'connecting' || state === 'new') &&
    elapsed >= Math.max(state === 'failed' ? 0 : 10000, delay)
  );
}

export function signalRetryDelay(attempt) {
  return Math.min(30000, 1000 * 2 ** Math.max(0, Math.min(attempt, 5)));
}

export function shouldHoldScreen({ active, visible, enabled }) {
  return active === true && visible === true && enabled === true;
}
