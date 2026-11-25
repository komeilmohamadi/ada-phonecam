import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { ensureCertificates } from '../src/certificates.mjs';
import { attachSignaling } from '../src/signaling.mjs';

test('remembered phone reconnects after studio refresh and cannot reconnect after forget', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ada-trusted-signal-'));
  const cert = await ensureCertificates(dir, []);
  const server = https.createServer({ key: cert.key, cert: cert.cert });
  let port;
  const signaling = attachSignaling(
    server,
    () => [`localhost:${port}`],
    () => [`https://localhost:${port}`],
    path.join(dir, 'trusted.json'),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.terminate());
    signaling.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  async function connect() {
    const ws = new WebSocket(`wss://127.0.0.1:${port}/signal`, {
      ca: cert.ca,
      servername: 'localhost',
      headers: { Host: `localhost:${port}`, Origin: `https://localhost:${port}` },
    });
    clients.push(ws);
    ws.messages = [];
    ws.on('message', (raw) => ws.messages.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return ws;
  }
  function send(ws, value) {
    ws.send(JSON.stringify(value));
  }
  async function receive(ws, type) {
    for (let i = 0; i < 150; i++) {
      const index = ws.messages.findIndex((m) => m.type === type);
      if (index >= 0) return ws.messages.splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error(`Missing ${type}`);
  }
  const closed = (ws) => new Promise((resolve) => ws.once('close', resolve));
  const admin = await connect();
  send(admin, { type: 'hello', role: 'controller' });
  assert.equal((await receive(admin, 'authenticated')).saved, false);
  send(admin, { type: 'pair', remember: true });
  const pairing = await receive(admin, 'pairing');
  const phone = await connect();
  send(phone, { type: 'hello', role: 'phone', token: new URL(pairing.link).hash.slice(1) });
  const remembered = (await receive(phone, 'authenticated')).remembered;
  assert.match(remembered, /^[0-9a-f]{64}$/);
  assert.equal((await receive(admin, 'trust-status')).saved, true);
  await receive(admin, 'paired');
  const phoneClose = closed(phone);
  admin.close();
  assert.equal(await phoneClose, 4010);
  const admin2 = await connect();
  send(admin2, { type: 'hello', role: 'controller' });
  assert.equal((await receive(admin2, 'authenticated')).saved, true);
  const phone2 = await connect();
  send(phone2, { type: 'hello', role: 'phone', remembered });
  assert.equal((await receive(phone2, 'authenticated')).remembered, remembered);
  await receive(admin2, 'paired');
  const phone2Close = closed(phone2);
  send(admin2, { type: 'revoke' });
  assert.equal(await phone2Close, 4001);
  const rejected = await connect();
  const rejectedClose = closed(rejected);
  send(rejected, { type: 'hello', role: 'phone', remembered });
  assert.equal(await rejectedClose, 4003);
});
