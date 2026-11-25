import { luminanceSummary, recommendNetwork } from './camera-tuning.js';

export function installDiagnostics(video) {
  const section = document.createElement('section');
  const title = document.createElement('h2');
  title.textContent = 'Camera and LAN diagnostics';
  const network = document.createElement('p');
  network.textContent = 'LAN upload test starts once when the phone media connection opens.';
  const light = document.createElement('p');
  light.textContent = 'Waiting for video brightness samples.';
  section.append(title, network, light);
  video.after(section);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const result = (event) => {
    if (!event.detail) {
      network.textContent = 'LAN test did not complete. Pair again to retry.';
      return;
    }
    const { mbps, rtt } = event.detail;
    const suggestion = recommendNetwork(mbps);
    if (!suggestion) return;
    network.textContent = `LAN upload sample: ${mbps.toFixed(1)} Mbps | Probe RTT: ${Number.isFinite(rtt) ? rtt.toFixed(1) : 'N/A'} ms. Suggested starting targets: ${suggestion.resolution}p, ${suggestion.fps} FPS, ${suggestion.bitrate} Mbps. Short test, not a sustained guarantee.`;
  };
  const reset = () => {
    network.textContent = 'Waiting for a new phone connection and LAN upload test.';
  };
  window.addEventListener('ada-lan-result', result);
  window.addEventListener('ada-lan-reset', reset);
  const timer = setInterval(() => {
    if (!ctx || !video.srcObject || video.readyState < 2 || video.paused) {
      light.textContent = 'Waiting for live video brightness samples.';
      return;
    }
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const sample = luminanceSummary(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      light.textContent = `Brightness: ${Math.round(sample.mean)}/255 | Histogram (dark to bright): ${sample.bins.join(' / ')}. ${sample.lowLight ? 'Dark scene: add light, try 30 FPS or the Low Noise preset.' : 'No dark-scene warning.'} This is not a sensor noise measurement.`;
    } catch {
      light.textContent = 'Brightness sampling unavailable.';
    }
  }, 3000);
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      window.removeEventListener('ada-lan-result', result);
      window.removeEventListener('ada-lan-reset', reset);
    },
    { once: true },
  );
}
