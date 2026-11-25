import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isIP } from 'node:net';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function loadConfig(root = projectRoot, env = process.env) {
  const defaults = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
  let local = {};
  try {
    local = JSON.parse(await readFile(path.join(root, 'config.local.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const config = { ...defaults, ...local };
  if (env.ADA_PORT !== undefined) config.port = Number(env.ADA_PORT);
  if (env.ADA_HOST !== undefined) config.host = env.ADA_HOST;
  if (env.ADA_NO_OPEN === '1') config.openBrowser = false;
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
    throw new Error('port must be an integer between 1024 and 65535.');
  }
  if (config.host !== '0.0.0.0' && config.host !== '127.0.0.1') {
    throw new Error('host must be 0.0.0.0 (LAN) or 127.0.0.1 (this computer only).');
  }
  if (config.preferredAddress !== null && isIP(config.preferredAddress) !== 4) {
    throw new Error('preferredAddress must be null or a local IPv4 address.');
  }
  if (typeof config.openBrowser !== 'boolean')
    throw new Error('openBrowser must be true or false.');
  if (
    !Number.isInteger(config.networkPollSeconds) ||
    config.networkPollSeconds < 5 ||
    config.networkPollSeconds > 300
  ) {
    throw new Error('networkPollSeconds must be between 5 and 300.');
  }
  return Object.freeze(config);
}
