import { loadConfig } from './config.mjs';
import { createApplication } from './app.mjs';
import { acquireRuntime, dataDir } from './runtime.mjs';
import { openBrowser } from './browser.mjs';

let runtime;
let app;
let stopping = false;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    if (app?.server.listening) await app.close();
    await runtime?.release();
    console.log('Ada PhoneCam stopped.');
  } catch (error) {
    console.error(`Shutdown failed: ${error.message}`);
    process.exitCode = 1;
  }
}

try {
  const config = await loadConfig();
  runtime = await acquireRuntime(config.port);
  app = await createApplication({
    config,
    dataDir,
    shutdownToken: runtime.token,
    instanceId: runtime.instanceId,
    onShutdown: shutdown,
  });
  await app.listen();
  app.server.on('error', (error) => {
    console.error(`Server error: ${error.message}`);
    shutdown();
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`Ada PhoneCam 0.7.3 is listening at https://localhost:${config.port}`);
  console.log('Stage 7: themes, saved quality presets, and optional native camera output.');
  console.log(
    'Install the local CA certificate before using HTTPS from a phone. See docs/HTTPS.md.',
  );
  if (config.openBrowser && !process.argv.includes('--no-open'))
    openBrowser(`https://localhost:${config.port}`);
} catch (error) {
  console.error(
    `Startup failed: ${error.code === 'EADDRINUSE' ? 'The configured port is already in use. Stop the other server or change the port in config.local.json.' : error.message}`,
  );
  await shutdown();
  process.exitCode = 1;
}
