import path from 'node:path';
import { loadConfig, projectRoot } from '../src/config.mjs';
import { discoverNetwork } from '../src/network.mjs';
import { ensureCertificates } from '../src/certificates.mjs';
import { readState } from '../src/runtime.mjs';

try {
  if (await readState()) throw new Error('Stop the server before running certificate setup.');
  const config = await loadConfig();
  const network = discoverNetwork(config.preferredAddress);
  const certs = await ensureCertificates(
    path.join(projectRoot, 'runtime', 'certs'),
    network.adapters.map((adapter) => adapter.address),
  );
  console.log('Local HTTPS certificates are ready.');
  console.log(`CA SHA-256 fingerprint: ${certs.fingerprint}`);
  console.log(`Local dashboard: https://localhost:${config.port}`);
  console.log(
    network.primaryAddress
      ? `LAN dashboard: https://${network.primaryAddress}:${config.port}`
      : 'No private IPv4 network address was found.',
  );
  console.log('Next: follow docs/HTTPS.md to trust the public CA certificate, then run Start.bat.');
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
}
