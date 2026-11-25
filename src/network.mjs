import os from 'node:os';
import { isIP } from 'node:net';

export function normalizeAddress(address = '') {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

export function isLocalAddress(value) {
  const address = normalizeAddress(value);
  if (address === '::1') return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isLoopback(address) {
  const normalized = normalizeAddress(address);
  return normalized === '::1' || (isIP(normalized) === 4 && normalized.split('.')[0] === '127');
}

export function discoverNetwork(preferredAddress = null, interfaces = os.networkInterfaces()) {
  const adapters = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isLocalAddress(entry.address)) continue;
      const virtual =
        /virtual|vmware|vbox|hyper-v|vethernet|docker|wsl|tun\d*|tap|vpn|wiresock|tailscale|zerotier|local area connection\*/i.test(
          name,
        );
      const score =
        (virtual ? -100 : 0) + (/ethernet/i.test(name) ? 20 : /wi-?fi|wlan/i.test(name) ? 10 : 0);
      adapters.push({ name, address: entry.address, virtual, score });
    }
  }
  adapters.sort(
    (a, b) =>
      b.score - a.score || a.name.localeCompare(b.name) || a.address.localeCompare(b.address),
  );
  const selected = adapters.find((adapter) => adapter.address === preferredAddress) ?? adapters[0];
  return {
    primaryAddress: selected?.address ?? null,
    preferredAddressMissing: Boolean(
      preferredAddress && !adapters.some((adapter) => adapter.address === preferredAddress),
    ),
    adapters: adapters.map(({ score, ...adapter }) => adapter),
  };
}
