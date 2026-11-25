// Bounded one-shot transfer over the already authenticated WebRTC peer.
const chunkSize = 16 * 1024;
const totalBytes = 2 * 1024 * 1024;
const maxBuffered = 128 * 1024;
let probed = false;
export function resetLanProbe() {
  probed = false;
}
export function addLanProbe(peer) {
  if (probed || typeof peer.createDataChannel !== 'function') return;
  const channel = peer.createDataChannel('ada-lan-probe-v1', { ordered: true });
  channel.bufferedAmountLowThreshold = maxBuffered / 2;
  let sent = 0;
  let start;
  let timer;
  const close = () => {
    clearTimeout(timer);
    channel.close();
  };
  const pump = () => {
    if (channel.readyState !== 'open') return;
    try {
      while (sent < totalBytes && channel.bufferedAmount < maxBuffered) {
        const bytes = new Uint8Array(chunkSize);
        crypto.getRandomValues(bytes);
        channel.send(bytes);
        sent += bytes.byteLength;
      }
      if (sent === totalBytes && channel.onbufferedamountlow) {
        channel.onbufferedamountlow = null;
        channel.send('end');
      }
    } catch {
      close();
    }
  };
  channel.onopen = () => {
    if (probed) return close();
    probed = true;
    timer = setTimeout(close, 6000);
    start = performance.now();
    channel.send('ping');
  };
  channel.onmessage = (event) => {
    if (event.data === 'pong' && sent === 0) {
      channel.send(`start:${Math.round(performance.now() - start)}`);
      channel.onbufferedamountlow = pump;
      pump();
    } else if (event.data === 'done') close();
  };
  channel.onclose = () => clearTimeout(timer);
  channel.onerror = close;
}

export function receiveLanProbe(channel, onResult) {
  if (channel.label !== 'ada-lan-probe-v1') return channel.close();
  channel.binaryType = 'arraybuffer';
  let bytes = 0;
  let start = null;
  let rtt = null;
  let completed = false;
  const timer = setTimeout(() => channel.close(), 8000);
  channel.onclose = () => {
    clearTimeout(timer);
    if (!completed) onResult(null);
  };
  channel.onmessage = ({ data }) => {
    if (data === 'ping' && start === null) channel.send('pong');
    else if (typeof data === 'string' && /^start:\d{1,5}$/.test(data) && start === null) {
      rtt = Number(data.slice(6));
      start = performance.now();
    } else if (data instanceof ArrayBuffer && start !== null) {
      bytes += data.byteLength;
      if (data.byteLength !== chunkSize || bytes > totalBytes) channel.close();
    } else if (data === 'end' && bytes === totalBytes && start !== null) {
      const ms = Math.max(1, performance.now() - start);
      completed = true;
      onResult({ mbps: (bytes * 8) / (ms * 1000), rtt, bytes });
      channel.send('done');
      clearTimeout(timer);
      channel.onmessage = null;
    } else channel.close();
  };
}
