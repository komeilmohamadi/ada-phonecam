import { spawn } from 'node:child_process';
import { open, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, projectRoot } from '../src/config.mjs';
import { readState, localRequest, dataDir } from '../src/runtime.mjs';
import { openBrowser } from '../src/browser.mjs';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function start() {
  const config = await loadConfig();
  const existing = await readState();
  if (existing) {
    try {
      await localRequest(existing, '/api/health');
      console.log(`Ada PhoneCam is already running at https://localhost:${existing.port}`);
      if (config.openBrowser) openBrowser(`https://localhost:${existing.port}`);
      return;
    } catch {
      /* The server validates and recovers stale process state during startup. */
    }
  }
  await mkdir(dataDir, { recursive: true });
  const logPath = path.join(dataDir, 'server.log');
  const handle = await open(logPath, 'w');
  const child = spawn(
    process.execPath,
    [path.join(projectRoot, 'src', 'server.mjs'), '--no-open'],
    {
      cwd: projectRoot,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', handle.fd, handle.fd],
    },
  );
  let launchError;
  let childExited = false;
  child.on('error', (error) => {
    launchError = error;
  });
  child.on('exit', () => {
    childExited = true;
  });
  child.unref();
  await handle.close();
  for (let attempt = 0; attempt < 80; attempt++) {
    if (launchError) throw launchError;
    try {
      const current = await readState();
      if (current?.pid === child.pid) {
        await localRequest(current, '/api/health');
        console.log(`Ada PhoneCam started at https://localhost:${current.port}`);
        console.log(`Server log: ${logPath}`);
        if (config.openBrowser) openBrowser(`https://localhost:${current.port}`);
        return;
      }
    } catch {
      /* Certificate generation and socket startup can take a moment. */
    }
    if (childExited) break;
    await delay(250);
  }
  const log = await readFile(logPath, 'utf8');
  throw new Error(`The server did not become ready. Check ${logPath}.\n${log.slice(-3000)}`);
}

async function stop() {
  const state = await readState();
  if (!state) {
    console.log('Ada PhoneCam is not running.');
    return;
  }
  await localRequest(state, '/api/shutdown', 'POST');
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await readState())?.instanceId !== state.instanceId) {
      console.log('Ada PhoneCam stopped.');
      return;
    }
    await delay(100);
  }
  throw new Error('The server is still shutting down. Check runtime/server.log.');
}

try {
  const action = process.argv[2];
  if (action === 'start') await start();
  else if (action === 'stop') await stop();
  else throw new Error('Usage: node scripts/launch.mjs start|stop');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
