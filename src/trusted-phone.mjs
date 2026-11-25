import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const valid = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function openTrustedPhone(file) {
  let hash = null;
  if (file) {
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'));
      if (record.version === 1 && valid(record.hash)) hash = record.hash;
    } catch {
      // A missing or invalid record never grants access.
    }
  }
  function persist(next) {
    if (file) {
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        writeFileSync(tmp, JSON.stringify({ version: 1, hash: next }) + '\n', {
          mode: 0o600,
          flag: 'wx',
        });
        renameSync(tmp, file);
      } finally {
        rmSync(tmp, { force: true });
      }
    }
    hash = next;
  }
  return {
    exists: () => hash !== null,
    matches(value) {
      return valid(value) && hash !== null && timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash));
    },
    remember() {
      const token = randomBytes(32).toString('hex');
      persist(digest(token));
      return token;
    },
    forget() {
      persist(null);
    },
  };
}
