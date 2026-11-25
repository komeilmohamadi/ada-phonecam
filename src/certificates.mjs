import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { X509Certificate, createPrivateKey, randomBytes, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const algorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const day = 86_400_000;

async function optionalRead(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function save(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, file);
}

function encodePrivateKey(key) {
  return createPrivateKey({ key: Buffer.from(key), type: 'pkcs8', format: 'der' }).export({
    type: 'pkcs8',
    format: 'pem',
  });
}

async function importPrivateKey(pem) {
  const der = createPrivateKey(pem).export({ type: 'pkcs8', format: 'der' });
  return webcrypto.subtle.importKey('pkcs8', der, algorithm, true, ['sign']);
}

export async function ensureCertificates(directory, addresses) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const caPath = path.join(directory, 'ada-phonecam-ca.crt');
  const caKeyPath = path.join(directory, 'ca.key');
  let caPem = await optionalRead(caPath);
  let caKey = await optionalRead(caKeyPath);
  if (Boolean(caPem) !== Boolean(caKey)) {
    throw new Error(
      'The local CA is incomplete. Restore both CA files from backup, or follow docs/HTTPS.md to reset trust.',
    );
  }
  if (!caPem) {
    const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    const ca = await x509.X509CertificateGenerator.createSelfSigned({
      name: `CN=Ada PhoneCam Local CA ${randomBytes(6).toString('hex')}`,
      serialNumber: randomBytes(16).toString('hex'),
      keys,
      signingAlgorithm: algorithm,
      notBefore: new Date(Date.now() - day),
      notAfter: new Date(Date.now() + 3650 * day),
      extensions: [
        new x509.BasicConstraintsExtension(true, 0, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
          true,
        ),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      ],
    });
    caPem = ca.toString('pem');
    caKey = encodePrivateKey(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey));
    await save(caKeyPath, caKey);
    await save(caPath, caPem);
  }
  const nativeCa = new X509Certificate(caPem);
  if (
    !nativeCa.ca ||
    !nativeCa.verify(nativeCa.publicKey) ||
    !nativeCa.checkPrivateKey(createPrivateKey(caKey))
  ) {
    throw new Error('The local CA certificate and private key are invalid or do not match.');
  }
  if (Date.parse(nativeCa.validTo) < Date.now() + 30 * day) {
    throw new Error('The local CA is expiring. Follow docs/HTTPS.md to reset trust.');
  }
  const keyPath = path.join(directory, 'server.key');
  const certPath = path.join(directory, 'server.crt');
  let key = await optionalRead(keyPath);
  let cert = await optionalRead(certPath);
  const uniqueAddresses = [...new Set(['127.0.0.1', ...addresses])].sort();
  let reusable = false;
  try {
    const existing = new X509Certificate(cert);
    reusable = Boolean(
      key &&
      existing.verify(nativeCa.publicKey) &&
      existing.checkPrivateKey(createPrivateKey(key)) &&
      Date.parse(existing.validTo) > Date.now() + 30 * day &&
      existing.checkHost('localhost') &&
      uniqueAddresses.every((address) => existing.checkIP(address)),
    );
  } catch {
    /* A missing or invalid leaf certificate can be replaced using the existing CA. */
  }
  if (!reusable) {
    const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    const ca = new x509.X509Certificate(caPem);
    const leaf = await x509.X509CertificateGenerator.create({
      serialNumber: randomBytes(16).toString('hex'),
      subject: 'CN=localhost',
      issuer: ca.subject,
      publicKey: keys.publicKey,
      signingKey: await importPrivateKey(caKey),
      signingAlgorithm: algorithm,
      notBefore: new Date(Date.now() - day),
      notAfter: new Date(Math.min(Date.now() + 365 * day, Date.parse(nativeCa.validTo))),
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
        new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1']),
        new x509.SubjectAlternativeNameExtension([
          { type: 'dns', value: 'localhost' },
          ...uniqueAddresses.map((address) => ({ type: 'ip', value: address })),
        ]),
        await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
        await x509.AuthorityKeyIdentifierExtension.create(ca),
      ],
    });
    key = encodePrivateKey(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey));
    cert = leaf.toString('pem');
    await save(keyPath, key);
    await save(certPath, cert);
  }
  return {
    key,
    cert,
    ca: caPem,
    fingerprint: nativeCa.fingerprint256,
    expiresAt: new Date(new X509Certificate(cert).validTo).toISOString(),
    renewed: !reusable,
  };
}
