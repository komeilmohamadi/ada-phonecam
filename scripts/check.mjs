import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { projectRoot } from '../src/config.mjs';

let failures = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'runtime'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(file);
    else {
      if (/\.(mjs|js)$/.test(file)) {
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (result.status !== 0) {
          console.error(result.stderr);
          failures++;
        }
      }
      if (
        /\.(mjs|js|json|md|html|css|ps1|bat|yml)$/.test(file) &&
        /[\u0600-\u06ff]/u.test(await readFile(file, 'utf8'))
      ) {
        console.error(`Non-English project text found: ${file}`);
        failures++;
      }
    }
  }
}
await check(projectRoot);
if (failures) process.exitCode = 1;
else console.log('JavaScript syntax and English-only text checks passed.');
