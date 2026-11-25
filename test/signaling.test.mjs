import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { ensureCertificates } from '../src/certificates.mjs';
import { attachSignaling } from '../src/signaling.mjs';

test('pairing is single-use, role-limited, revocable, and origin checked', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ada-signal-'));
  const cert = await ensureCertificates(dir, []);
  const server = https.createServer({ key: cert.key, cert: cert.cert });
  let port;
  const signaling = attachSignaling(
    server,
    () => [`localhost:${port}`],
    () => [`https://localhost:${port}`],
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.terminate());
    signaling.close();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  async function connect(origin = `https://localhost:${port}`) {
    const ws = new WebSocket(`wss://127.0.0.1:${port}/signal`, {
      ca: cert.ca,
      servername: 'localhost',
      headers: { Host: `localhost:${port}`, Origin: origin },
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
  async function receive(ws, type) {
    for (let i = 0; i < 100; i++) {
      const index = ws.messages.findIndex((m) => m.type === type);
      if (index >= 0) return ws.messages.splice(index, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Missing ${type}`);
  }
  const send = (ws, m) => ws.send(JSON.stringify(m));
  await assert.rejects(connect('https://attacker.example'), /403/);
  const admin = await connect();
  send(admin, { type: 'hello', role: 'controller' });
  await receive(admin, 'authenticated');
  send(admin, { type: 'pair' });
  const pairing = await receive(admin, 'pairing');
  assert.match(pairing.qr, /^data:image\/png;base64,/);
  assert.ok(pairing.expires > Date.now());
  const token = new URL(pairing.link).hash.slice(1);
  const bad = await connect();
  const rejected = new Promise((r) => bad.once('close', r));
  send(bad, { type: 'hello', role: 'phone', token: 'wrong' });
  assert.equal(await rejected, 4003);
  const phone = await connect();
  send(phone, { type: 'hello', role: 'phone', token });
  const auth = await receive(phone, 'authenticated');
  assert.equal(auth.resume.length, 64);
  await receive(admin, 'paired');
  send(phone, {
    type: 'offer',
    epoch: 'session',
    description: { type: 'offer', sdp: 'test payload' },
  });
  assert.equal((await receive(admin, 'offer')).epoch, 'session');
  const replay = await connect();
  const replayClosed = new Promise((r) => replay.once('close', r));
  send(replay, { type: 'hello', role: 'phone', token });
  assert.equal(await replayClosed, 4003);
  send(admin, { type: 'revoke' });
  await receive(admin, 'left');
  const old = await connect();
  const oldClosed = new Promise((r) => old.once('close', r));
  send(old, { type: 'hello', role: 'phone', token: auth.resume });
  assert.equal(await oldClosed, 4003);
});
