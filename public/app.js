const element = (id) => document.getElementById(id);
let currentUrl = null;
let timer;
let adapterKey;

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

function renderAdapters(adapters) {
  const key = JSON.stringify(adapters);
  if (key === adapterKey) return;
  adapterKey = key;
  const nodes = adapters.map((adapter) => {
    const row = document.createElement('li');
    row.className = 'adapter';
    const label = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'adapter-name';
    name.textContent = adapter.name;
    label.append(name);
    if (adapter.virtual) {
      const hint = document.createElement('span');
      hint.className = 'adapter-hint';
      hint.textContent = 'Virtual or tunnel adapter';
      label.append(hint);
    }
    const address = document.createElement(adapter.url ? 'a' : 'span');
    address.textContent = adapter.address;
    if (adapter.url) address.href = adapter.url;
    row.append(label, address);
    return row;
  });
  if (!nodes.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent =
      'No private IPv4 adapters found. Connect to your local network and check again.';
    nodes.push(empty);
  }
  element('adapters').replaceChildren(...nodes);
}

function disconnected(message) {
  currentUrl = null;
  element('copy-url').disabled = true;
  element('server-badge').className = 'badge offline';
  element('server-badge').textContent = 'Server unavailable';
  element('server-state').textContent = 'Offline';
  element('server-detail').textContent = 'Waiting to reconnect';
  element('connection-error').hidden = false;
  element('connection-error').textContent = message;
  element('last-update').textContent = 'Connection lost. Retrying automatically.';
}

async function refresh() {
  clearTimeout(timer);
  if (document.hidden) return;
  try {
    const response = await fetch('/api/status', {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const status = await response.json();
    element('connection-error').hidden = true;
    element('server-badge').className = 'badge online';
    element('server-badge').textContent = 'Server online';
    element('server-state').textContent = 'Running';
    element('server-detail').textContent = `Listening on port ${status.server.port}`;
    element('transport').textContent = status.tls.enabled ? 'HTTPS' : 'HTTP';
    element('secure-context').textContent = window.isSecureContext
      ? 'Secure browser context'
      : 'Certificate trust required';
    element('primary-ip').textContent = status.network.primaryAddress ?? 'No LAN address';
    element('adapter-name').textContent =
      status.network.adapters.find((adapter) => adapter.address === status.network.primaryAddress)
        ?.name ?? 'Connect to a local network';
    element('uptime').textContent = formatUptime(status.uptimeSeconds);
    currentUrl = status.network.primaryUrl;
    element('primary-url').textContent = currentUrl ?? 'LAN access is unavailable';
    element('copy-url').disabled = !currentUrl;
    const warning =
      status.network.error ??
      (!status.server.lanAvailable
        ? 'The server is configured for this computer only. Set host to 0.0.0.0 to enable LAN access.'
        : status.network.preferredAddressMissing
          ? 'Your preferred IP address is unavailable. An available adapter has been selected.'
          : null);
    element('network-warning').hidden = !warning;
    element('network-warning').textContent = warning ?? '';
    element('fingerprint').textContent = status.tls.caFingerprint;
    element('expiry').textContent = new Date(status.tls.expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    element('expiry').dateTime = status.tls.expiresAt;
    renderAdapters(status.network.adapters);
    element('last-update').textContent = `Updated ${new Date().toLocaleTimeString('en-GB')}`;
  } catch {
    disconnected(
      'The local server could not be reached. Check that Start.bat is running and that this page uses a trusted HTTPS connection.',
    );
  } finally {
    if (!document.hidden) timer = setTimeout(refresh, 5000);
  }
}

element('copy-url').addEventListener('click', async () => {
  if (!currentUrl) return;
  try {
    await navigator.clipboard.writeText(currentUrl);
    element('copy-url').textContent = 'Copied';
    setTimeout(() => {
      element('copy-url').textContent = 'Copy address';
    }, 1600);
  } catch {
    element('copy-url').textContent = 'Select and copy';
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element('primary-url'));
    selection.removeAllRanges();
    selection.addRange(range);
  }
});
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (!document.hidden) refresh();
});
refresh();
