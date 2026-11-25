import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFrameStore, createNativeCameraHandler, frameBytes } from '../src/native-camera.mjs';

const token = 'a'.repeat(64);
const other = 'b'.repeat(64);

test('only the registered native reader can access the current frame', () => {
  const store = createFrameStore();
  assert.equal(store.register('bad'), false);
  assert.equal(store.begin(), null);
  assert.equal(store.register(token), true);
  assert.equal(store.register(other), false);
  const frame = Buffer.alloc(frameBytes, 2);
  assert.equal(store.publish(frame, store.begin()), true);
  assert.deepEqual(store.read(other), { allowed: false, frame: null });
  assert.equal(store.read(token).frame, frame);
});

test('frame expiry, session expiry, and clear invalidate stale or in-flight frames', () => {
  let now = 0;
  const store = createFrameStore(() => now);
  const frame = Buffer.alloc(frameBytes);
  store.register(token);
  const rev = store.begin();
  assert.equal(store.publish(Buffer.alloc(2), rev), false);
  assert.equal(store.publish(frame, rev), true);
  now = 500;
  assert.equal(store.read(token).frame, null);
  const pending = store.begin();
  store.clear();
  assert.equal(store.publish(frame, pending), false);
  now = 5500;
  assert.equal(store.read(token).allowed, false);
  assert.equal(store.register(other), true);
  assert.equal(store.read(other).frame, null);
});

test('native frame HTTP boundary rejects foreign origins, hosts and invalid sizes', async (t) => {
  const handle = createNativeCameraHandler();
  const server = http.createServer((req, res) => {
    handle(req, res, req.url, server.address().port, (response, status, value, type) => {
      response.writeHead(status, { 'Content-Type': type ?? 'text/plain' });
      response.end(value);
    }).catch(() => res.destroy());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const local = `localhost:${port}`;
  const native = { 'X-Ada-Native': token };
  const browser = { Origin: `https://${local}`, 'X-Ada-Frame': '1' };
  function request(path, method, headers = {}, body = undefined) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: `/api/native-camera/${path}`, method,
          headers: { Host: local, ...headers, ...(body ? { 'Content-Length': body.length } : {}) } },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }
  assert.equal((await request('frame', 'GET')).status, 403);
  assert.equal((await request('session', 'POST', { ...native, Origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('session', 'POST', { ...native, Host: `127.0.0.1:${port}` })).status, 403);
  assert.equal((await request('ready', 'POST', browser)).status, 409);
  assert.equal((await request('session', 'POST', native)).status, 204);
  assert.equal((await request('session', 'POST', { 'X-Ada-Native': other })).status, 409);
  assert.equal((await request('ready', 'POST', browser)).status, 204);
  const upload = { ...browser, 'Content-Type': 'application/octet-stream' };
  assert.equal((await request('frame', 'POST', upload, Buffer.alloc(2))).status, 400);
  const frame = Buffer.alloc(frameBytes, 42);
  assert.equal((await request('frame', 'POST', upload, frame)).status, 204);
  assert.equal((await request('frame', 'GET', { 'X-Ada-Native': other })).status, 403);
  const result = await request('frame', 'GET', native);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, frame);
  assert.equal((await request('frame', 'DELETE', browser)).status, 204);
  assert.equal((await request('frame', 'GET', native)).status, 204);
});
