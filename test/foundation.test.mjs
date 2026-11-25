import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';
import { createApplication } from '../src/app.mjs';
import { discoverNetwork, isLocalAddress } from '../src/network.mjs';
import { loadConfig } from '../src/config.mjs';

const adapter = (address) => [{ family: 'IPv4', address, internal: false }];

test('network discovery prefers physical adapters and honors an explicit address', () => {
  const interfaces = {
    tun0: adapter('172.19.0.1'),
    'Wi-Fi': adapter('192.168.0.101'),
    Ethernet: adapter('192.168.0.102'),
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    Disconnected: adapter('169.254.1.2'),
    Public: adapter('203.0.113.2'),
  };
  assert.equal(discoverNetwork(null, interfaces).primaryAddress, '192.168.0.102');
  assert.equal(discoverNetwork('192.168.0.101', interfaces).primaryAddress, '192.168.0.101');
  assert.equal(discoverNetwork(null, interfaces).adapters.length, 3);
  assert.equal(discoverNetwork('10.1.1.1', interfaces).preferredAddressMissing, true);
  assert.equal(discoverNetwork(null, {}).primaryAddress, null);
});

test('the network boundary rejects public, malformed, and link-local addresses', () => {
  for (const address of [
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '127.0.0.1',
    '::1',
    '::ffff:192.168.1.1',
  ]) {
    assert.equal(isLocalAddress(address), true, address);
  }
  for (const address of [
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '169.254.1.1',
    '192.168.500.1',
    'fd00::1',
    'localhost',
  ]) {
    assert.equal(isLocalAddress(address), false, address);
  }
});

test('configuration rejects unsafe bindings and invalid port or poll values', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ada-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const defaults = {
    host: '0.0.0.0',
    port: 8443,
    preferredAddress: null,
    openBrowser: true,
    networkPollSeconds: 15,
  };
  await writeFile(path.join(root, 'config.json'), JSON.stringify(defaults));
  assert.equal((await loadConfig(root, {})).port, 8443);
  await writeFile(path.join(root, 'config.local.json'), JSON.stringify({ port: 9443 }));
  assert.equal((await loadConfig(root, {})).port, 9443);
  assert.equal(
    (await loadConfig(root, { ADA_PORT: '10443', ADA_NO_OPEN: '1' })).openBrowser,
    false,
  );
  for (const value of [
    { port: 0 },
    { port: '8443' },
    { host: '8.8.8.8' },
    { networkPollSeconds: 0 },
    { preferredAddress: 'not-an-ip' },
  ]) {
    await writeFile(path.join(root, 'config.local.json'), JSON.stringify(value));
    await assert.rejects(loadConfig(root, {}));
  }
});

test('HTTPS serves real status, protects controls, and renews IP certificates without changing CA trust', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'ada-https-'));
  let interfaces = { Ethernet: adapter('192.168.50.10') };
  let shutdowns = 0;
  const app = await createApplication({
    config: { host: '127.0.0.1', port: 0, preferredAddress: null, networkPollSeconds: 60 },
    dataDir,
    shutdownToken: 'test-only-control-secret',
    instanceId: 'test-instance',
    getNetwork: (preferred) => discoverNetwork(preferred, interfaces),
    onShutdown: () => {
      shutdowns++;
    },
    log: () => {},
  });
  t.after(async () => {
    if (app.server.listening) await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const port = await app.listen();
  const ca = await readFile(path.join(dataDir, 'certs', 'ada-phonecam-ca.crt'));
  const request = (
    pathname,
    { method = 'GET', headers = {}, trust = ca, servername = 'localhost' } = {},
  ) =>
    new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          servername,
          port,
          path: pathname,
          method,
          ca: trust,
          agent: false,
          headers: { Host: `localhost:${port}`, ...headers },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body,
              peer: response.socket?.getPeerCertificate(),
            }),
          );
          response.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
  await t.test('validates the CA chain and both local DNS and IP SANs', async () => {
    assert.equal((await request('/api/health')).status, 200);
    assert.equal((await request('/api/health', { servername: '' })).status, 200);
    await assert.rejects(request('/api/health', { trust: [] }));
    const leaf = new X509Certificate(await readFile(path.join(dataDir, 'certs', 'server.crt')));
    assert.equal(leaf.checkIP('192.168.50.10'), '192.168.50.10');
    assert.equal(leaf.verify(new X509Certificate(ca).publicKey), true);
  });
  await t.test('serves the dashboard and status without credentials or private keys', async () => {
    const response = await request('/api/status');
    const status = JSON.parse(response.body);
    assert.equal(status.version, '0.7.2');
    assert.equal(status.stage, 7);
    assert.equal(status.network.primaryAddress, '192.168.50.10');
    assert.equal(status.server.lanAvailable, false);
    assert.equal(status.network.primaryUrl, null);
    assert.equal(status.tls.enabled, true);
    assert.ok(status.uptimeSeconds >= 0);
    assert.ok(!response.body.includes('test-only-control-secret'));
    assert.ok(!response.body.includes('PRIVATE KEY'));
    const dashboard = await request('/');
    assert.match(dashboard.body, /Ada PhoneCam/);
    assert.match(dashboard.headers['content-security-policy'], /default-src 'self'/);
    assert.equal(dashboard.headers['cache-control'], 'no-store');
    for (const asset of ['/app.js', '/styles.css', '/favicon.svg', '/quality.js'])
      assert.equal((await request(asset)).status, 200);
    assert.equal((await request('/cert/ca.crt')).body, ca.toString());
    for (const asset of ['/view', '/view.js', '/view.css', '/feed.js', '/studio-feed.js']) {
      assert.equal((await request(asset)).status, 200);
    }
    assert.equal((await request('/view', { headers: { Host: `127.0.0.1:${port}` } })).status, 403);
    for (const asset of ['/monitor.js', '/stability.js']) {
      assert.equal((await request(asset)).status, 200);
    }
    for (const asset of ['/theme.css', '/theme.js', '/preferences.js', '/native-output.js']) {
      assert.equal((await request(asset)).status, 200);
    }
    assert.equal((await request('/api/native-camera/frame')).status, 403);
    const head = await request('/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal((await request('/not-found', { method: 'HEAD' })).status, 404);
    for (const file of [
      '/runtime/server.json',
      '/runtime/certs/ca.key',
      '/../config.json',
      '/.git/config',
      '/not-found',
    ]) {
      assert.equal((await request(file)).status, 404, file);
    }
  });
  await t.test(
    'rejects rebinding hosts, writes, and unauthenticated or browser shutdown requests',
    async () => {
      assert.equal(
        (await request('/', { headers: { Host: `attacker.example:${port}` } })).status,
        403,
      );
      assert.equal((await request('/api/status', { method: 'POST' })).status, 405);
      assert.equal((await request('/api/shutdown')).status, 405);
      assert.equal((await request('/api/shutdown', { method: 'POST' })).status, 403);
      assert.equal(
        (
          await request('/api/shutdown', {
            method: 'POST',
            headers: { Authorization: 'Bearer wrong' },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request('/api/shutdown', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer test-only-control-secret',
              Origin: `https://localhost:${port}`,
            },
          })
        ).status,
        403,
      );
      assert.equal(shutdowns, 0);
      assert.equal(
        (
          await request('/api/shutdown', {
            method: 'POST',
            headers: { Authorization: 'Bearer test-only-control-secret' },
          })
        ).status,
        200,
      );
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(shutdowns, 1);
    },
  );
  await t.test(
    'keeps the CA and reuses the leaf until an additional address needs coverage',
    async () => {
      const before = await readFile(path.join(dataDir, 'certs', 'server.crt'), 'utf8');
      await app.refreshNetwork();
      assert.equal(await readFile(path.join(dataDir, 'certs', 'server.crt'), 'utf8'), before);
      interfaces = { 'Wi-Fi': adapter('192.168.60.20') };
      await app.refreshNetwork();
      const after = new X509Certificate(await readFile(path.join(dataDir, 'certs', 'server.crt')));
      assert.notEqual(after.toString(), before);
      assert.equal(after.checkIP('192.168.60.20'), '192.168.60.20');
      assert.deepEqual(await readFile(path.join(dataDir, 'certs', 'ada-phonecam-ca.crt')), ca);
      const refreshedResponse = await request('/api/health');
      assert.equal(refreshedResponse.status, 200);
      assert.match(refreshedResponse.peer.subjectaltname, /192\.168\.60\.20/);
      assert.equal(
        JSON.parse((await request('/api/status')).body).network.primaryAddress,
        '192.168.60.20',
      );
    },
  );
});
