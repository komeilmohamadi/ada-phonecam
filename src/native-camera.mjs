import { isLoopback } from './network.mjs';

export const nativeWidth = 1280;
export const nativeHeight = 720;
export const frameBytes = nativeWidth * nativeHeight * 4;
const sessionMs = 5000;
const frameMs = 500;

export function createFrameStore(now = Date.now) {
  let owner = null;
  let deadline = 0;
  let frame = null;
  let frameTime = 0;
  let revision = 0;
  function clear() {
    frame = null;
    revision++;
  }
  function active() {
    if (owner && now() >= deadline) {
      owner = null;
      clear();
    }
    if (frame && now() - frameTime >= frameMs) frame = null;
    return owner !== null;
  }
  return {
    active,
    clear,
    register(token) {
      if (!/^[0-9a-f]{64}$/.test(token ?? '')) return false;
      if (active() && owner !== token) return false;
      if (owner !== token) clear();
      owner = token;
      deadline = now() + sessionMs;
      return true;
    },
    begin() {
      return active() ? revision : null;
    },
    publish(value, expected) {
      if (!active() || expected !== revision || value.length !== frameBytes) return false;
      frame = value;
      frameTime = now();
      return true;
    },
    read(token) {
      if (!active() || owner !== token) return { allowed: false, frame: null };
      deadline = now() + sessionMs;
      return { allowed: true, frame };
    },
  };
}

export function createNativeCameraHandler() {
  const store = createFrameStore();
  let upload = false;
  return async (request, response, pathname, port, send) => {
    const reply = (status, data = '') => send(response, status, data);
    const host = `localhost:${port}`;
    if (!isLoopback(request.socket.remoteAddress) || request.headers.host !== host) {
      request.resume();
      return reply(403);
    }
    const browser =
      request.headers.origin === `https://${host}` && request.headers['x-ada-frame'] === '1';
    const token = request.headers['x-ada-native'];
    const native = !request.headers.origin && typeof token === 'string';
    if (pathname === '/api/native-camera/session' && request.method === 'POST' && native) {
      request.resume();
      return reply(store.register(token) ? 204 : 409);
    }
    if (pathname === '/api/native-camera/frame' && request.method === 'GET' && native) {
      const result = store.read(token);
      if (!result.allowed) return reply(403);
      if (!result.frame) return reply(204);
      return send(response, 200, result.frame, 'application/octet-stream');
    }
    if (!browser) {
      request.resume();
      return reply(403);
    }
    if (pathname === '/api/native-camera/ready' && request.method === 'POST') {
      request.resume();
      return reply(store.active() ? 204 : 409);
    }
    if (pathname !== '/api/native-camera/frame') {
      request.resume();
      return reply(404);
    }
    if (request.method === 'DELETE') {
      store.clear();
      return reply(204);
    }
    if (request.method !== 'POST') return reply(405);
    const revision = store.begin();
    if (revision === null || upload) {
      request.resume();
      return reply(409);
    }
    if (
      request.headers['content-type'] !== 'application/octet-stream' ||
      Number(request.headers['content-length']) !== frameBytes
    ) {
      request.resume();
      return reply(400);
    }
    upload = true;
    try {
      const buffer = Buffer.allocUnsafe(frameBytes);
      let offset = 0;
      for await (const chunk of request) {
        if (offset + chunk.length > frameBytes) {
          request.destroy();
          return;
        }
        chunk.copy(buffer, offset);
        offset += chunk.length;
      }
      if (offset !== frameBytes) return reply(400);
      return reply(store.publish(buffer, revision) ? 204 : 409);
    } catch {
      if (!response.destroyed) reply(400);
    } finally {
      upload = false;
    }
  };
}
