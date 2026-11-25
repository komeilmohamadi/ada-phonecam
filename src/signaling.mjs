import { WebSocketServer } from 'ws';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { isLocalAddress, isLoopback } from './network.mjs';
const secret = () => randomBytes(32).toString('hex');
const equal = (a, b) =>
  typeof a === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function attachSignaling(server, getHosts, getUrls) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 128 * 1024,
    perMessageDeflate: false,
  });
  let controller,
    phone,
    ticket = '',
    expires = 0,
    resume = '';
  const send = (ws, data) => {
    if (ws?.bufferedAmount > 256 * 1024) {
      ws.terminate();
      return;
    }
    if (ws?.readyState === 1) ws.send(JSON.stringify(data));
  };
  const revoke = () => {
    ticket = '';
    resume = '';
    expires = 0;
    const old = phone;
    phone = null;
    old?.close(4001, 'Pairing revoked');
  };
  server.on('upgrade', (req, socket, head) => {
    if (
      req.url !== '/signal' ||
      !isLocalAddress(req.socket.remoteAddress) ||
      !getHosts().includes(req.headers.host) ||
      req.headers.origin !== `https://${req.headers.host}` ||
      wss.clients.size >= 16
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let role = null,
        count = 0,
        windowStart = Date.now();
      const authTimeout = setTimeout(() => {
        if (!role) ws.close(4003, 'Authentication timeout');
      }, 5000);
      ws.on('error', () => {});
      ws.alive = true;
      ws.on('pong', () => {
        ws.alive = true;
      });
      ws.on('message', async (raw) => {
        try {
          if (Date.now() - windowStart > 1000) {
            count = 0;
            windowStart = Date.now();
          }
          if (++count > 100) return ws.close(4008, 'Rate limit exceeded');
          const m = JSON.parse(raw);
          if (!m || typeof m.type !== 'string') throw new Error('Invalid message');
          if (!role) {
            if (m.type !== 'hello') return ws.close(4003, 'Authenticate first');
            if (
              m.role === 'controller' &&
              isLoopback(req.socket.remoteAddress) &&
              req.headers.host.startsWith('localhost:') &&
              !controller
            ) {
              role = 'controller';
              controller = ws;
              send(ws, { type: 'authenticated' });
            } else if (
              m.role === 'phone' &&
              controller &&
              !phone &&
              ((ticket && Date.now() < expires && equal(m.token, ticket)) ||
                (resume && equal(m.token, resume)))
            ) {
              role = 'phone';
              phone = ws;
              ticket = '';
              expires = 0;
              resume = secret();
              send(ws, { type: 'authenticated', resume });
              send(controller, { type: 'paired' });
            } else return ws.close(4003, 'Pairing rejected or device already connected');
            clearTimeout(authTimeout);
            return;
          }
          if (role === 'controller' && m.type === 'pair') {
            revoke();
            ticket = secret();
            expires = Date.now() + 120000;
            const currentTicket = ticket;
            const urls = getUrls();
            const url = urls.includes(m.url) ? m.url : urls[0];
            const link = url ? `${url}/phone#${ticket}` : null;
            const qr = link ? await QRCode.toDataURL(link, { width: 280, margin: 2 }) : null;
            if (ticket === currentTicket) send(ws, { type: 'pairing', link, qr, expires, urls });
            return;
          }
          if (role === 'controller' && m.type === 'revoke') {
            revoke();
            send(ws, { type: 'left' });
            return;
          }
          const allowed =
            role === 'phone'
              ? ['offer', 'candidate', 'stopped', 'error']
              : ['answer', 'candidate', 'stop'];
          if (!allowed.includes(m.type)) return;
          send(role === 'phone' ? controller : phone, m);
        } catch {
          send(ws, { type: 'error', message: 'Invalid signaling message.' });
        }
      });
      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (controller === ws) {
          controller = null;
          revoke();
        }
        if (phone === ws) {
          phone = null;
          send(controller, { type: 'left' });
        }
      });
    });
  });
  let previousUrls = JSON.stringify(getUrls());
  const heartbeat = setInterval(() => {
    const urls = JSON.stringify(getUrls());
    if (urls !== previousUrls) {
      previousUrls = urls;
      send(controller, { type: 'network-changed', paired: Boolean(phone) });
    }
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 15000);
  heartbeat.unref();
  return {
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
