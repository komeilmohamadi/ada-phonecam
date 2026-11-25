import https from 'node:https';
import { attachSignaling } from './signaling.mjs';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureCertificates } from './certificates.mjs';
import { discoverNetwork, isLocalAddress, isLoopback } from './network.mjs';
import { projectRoot } from './config.mjs';

const assets = new Map([
  ['/studio', ['stream.html', 'text/html; charset=utf-8']],
  ['/phone', ['stream.html', 'text/html; charset=utf-8']],
  ['/stream.js', ['stream.js', 'text/javascript; charset=utf-8']],
  ['/stream.css', ['stream.css', 'text/css; charset=utf-8']],
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function sameSecret(received = '', expected) {
  const a = Buffer.from(received);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createApplication({
  config,
  dataDir,
  shutdownToken,
  instanceId,
  getNetwork = discoverNetwork,
  onShutdown = () => {},
  log = console.log,
}) {
  let network = getNetwork(config.preferredAddress);
  let certificates = await ensureCertificates(
    path.join(dataDir, 'certs'),
    network.adapters.map((adapter) => adapter.address),
  );
  let networkError = null;
  const startedAt = new Date();
  let closing = false;
  let refreshing = false;
  let poll;

  const server = https.createServer(
    { key: certificates.key, cert: certificates.cert, minVersion: 'TLSv1.2' },
    (request, response) => {
      handle(request, response).catch((error) => {
        log(`Request failed: ${error.message}`);
        if (!response.headersSent)
          send(response, 500, { error: 'The server could not complete the request.' });
        else response.destroy();
      });
    },
  );
  const signaling = attachSignaling(
    server,
    () =>
      ['localhost', '127.0.0.1', ...network.adapters.map((a) => a.address)].map(
        (a) => `${a}:${port()}`,
      ),
    () =>
      config.host === '127.0.0.1'
        ? []
        : network.adapters.map((a) => `https://${a.address}:${port()}`),
  );
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;

  function send(response, status, value, contentType = 'application/json; charset=utf-8') {
    response.writeHead(status, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    });
    const body =
      Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value);
    response.end(response.req.method === 'HEAD' ? undefined : body);
  }

  function port() {
    return server.address()?.port ?? config.port;
  }

  async function handle(request, response) {
    if (!isLocalAddress(request.socket.remoteAddress))
      return send(response, 403, { error: 'Only local network clients are allowed.' });
    const allowedHosts = new Set(
      ['localhost', '127.0.0.1', ...network.adapters.map((adapter) => adapter.address)].map(
        (address) => `${address}:${port()}`,
      ),
    );
    if (!allowedHosts.has(request.headers.host?.toLowerCase()))
      return send(response, 403, { error: 'Unknown server address.' });
    let url;
    try {
      url = new URL(request.url, 'https://localhost');
    } catch {
      return send(response, 400, { error: 'Invalid request URL.' });
    }

    if (url.pathname === '/api/shutdown') {
      if (request.method !== 'POST')
        return send(response, 405, { error: 'Use POST for this endpoint.' });
      if (
        !isLoopback(request.socket.remoteAddress) ||
        request.headers.origin ||
        !sameSecret(request.headers.authorization, shutdownToken)
      ) {
        return send(response, 403, { error: 'Local process authentication is required.' });
      }
      send(response, 200, { stopping: true, instanceId });
      setImmediate(onShutdown);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(response, 405, { error: 'Method not allowed.' });
    }
    if (url.pathname === '/api/health')
      return send(response, 200, {
        app: 'ada-phonecam',
        version: '0.2.0',
        instanceId,
        status: 'ok',
      });
    if (url.pathname === '/api/status') {
      const lanAvailable = config.host !== '127.0.0.1';
      return send(response, 200, {
        app: 'Ada PhoneCam',
        version: '0.2.0',
        stage: 2,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        server: {
          host: config.host,
          port: port(),
          localUrl: `https://localhost:${port()}`,
          lanAvailable,
        },
        network: {
          ...network,
          primaryUrl:
            lanAvailable && network.primaryAddress
              ? `https://${network.primaryAddress}:${port()}`
              : null,
          adapters: network.adapters.map((adapter) => ({
            ...adapter,
            url: lanAvailable ? `https://${adapter.address}:${port()}` : null,
          })),
          error: networkError,
        },
        tls: {
          enabled: true,
          caFingerprint: certificates.fingerprint,
          expiresAt: certificates.expiresAt,
        },
      });
    }
    if (url.pathname === '/cert/ca.crt') {
      response.setHeader('Content-Disposition', 'attachment; filename="ada-phonecam-ca.crt"');
      return send(response, 200, certificates.ca, 'application/x-x509-ca-cert');
    }
    const asset = assets.get(url.pathname);
    if (!asset) return send(response, 404, { error: 'Page not found.' });
    send(response, 200, await readFile(path.join(projectRoot, 'public', asset[0])), asset[1]);
  }

  async function refreshNetwork() {
    if (closing || refreshing) return;
    refreshing = true;
    try {
      const discovered = getNetwork(config.preferredAddress);
      const renewed = await ensureCertificates(
        path.join(dataDir, 'certs'),
        discovered.adapters.map((adapter) => adapter.address),
      );
      if (renewed.renewed) {
        server.setSecureContext({ key: renewed.key, cert: renewed.cert, minVersion: 'TLSv1.2' });
        log('HTTPS certificate updated for the current network addresses.');
      }
      network = discovered;
      certificates = renewed;
      networkError = null;
    } catch (error) {
      networkError = 'Network refresh failed. Check the server log and restart the server.';
      log(`Network refresh failed: ${error.message}`);
    } finally {
      refreshing = false;
    }
  }

  return {
    server,
    refreshNetwork,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      poll = setInterval(refreshNetwork, config.networkPollSeconds * 1000);
      poll.unref();
      return port();
    },
    async close() {
      closing = true;
      signaling.close();
      clearInterval(poll);
      const closed = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await closed;
      while (refreshing) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
