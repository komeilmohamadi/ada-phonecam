import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { randomBytes, randomUUID } from 'node:crypto';
import { projectRoot } from './config.mjs';

export const dataDir = path.join(projectRoot, 'runtime');
export const stateFile = path.join(dataDir, 'server.json');

export async function readState() {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function acquireRuntime(port) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const state = {
    pid: process.pid,
    port,
    instanceId: randomUUID(),
    token: randomBytes(32).toString('hex'),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    let handle;
    try {
      handle = await open(stateFile, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readState();
      if (existing) {
        try {
          process.kill(existing.pid, 0);
        } catch (processError) {
          if (processError.code !== 'ESRCH') throw processError;
          await unlink(stateFile);
          continue;
        }
        throw new Error(
          'Ada PhoneCam is already running, or its saved process is still active. Run Stop.bat first.',
        );
      }
      continue;
    }
    try {
      await handle.writeFile(JSON.stringify(state));
    } finally {
      await handle.close();
    }
    return {
      ...state,
      async release() {
        const current = await readState();
        if (current?.instanceId === state.instanceId) await unlink(stateFile);
      },
    };
  }
  throw new Error('Unable to reserve the local server state.');
}

export async function localRequest(state, pathname, method = 'GET') {
  const ca = await readFile(path.join(dataDir, 'certs', 'ada-phonecam-ca.crt'));
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: '127.0.0.1',
        servername: 'localhost',
        port: state.port,
        path: pathname,
        method,
        ca,
        headers: {
          Host: `localhost:${state.port}`,
          ...(method === 'POST' ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        timeout: 2000,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            const value = JSON.parse(body);
            if (response.statusCode !== 200 || value.instanceId !== state.instanceId)
              throw new Error('Server identity or response did not match.');
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
        response.on('error', reject);
      },
    );
    request.on('timeout', () => request.destroy(new Error('Local server request timed out.')));
    request.on('error', reject);
    request.end();
  });
}
