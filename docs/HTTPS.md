# Local HTTPS setup

Android Chrome requires a secure context for camera access. A certificate warning bypass is not the supported setup for Ada PhoneCam. Install and trust this installation's public CA certificate first.

## Generated files

After `Install.bat` or `npm run setup`, the following files exist under `runtime/certs/`:

| File                  | Purpose                         | Share?                      |
| --------------------- | ------------------------------- | --------------------------- |
| `ada-phonecam-ca.crt` | Public local CA certificate     | Yes, with your own devices  |
| `ca.key`              | Private CA signing key          | Never                       |
| `server.crt`          | Public HTTPS server certificate | Not needed for device setup |
| `server.key`          | Private HTTPS server key        | Never                       |

The CA is unique to the installation and lasts about ten years. Server certificates last at most one year and renew with the same CA when a new IP needs coverage or fewer than 30 days remain. Certificates cover `localhost`, `127.0.0.1`, and the computer's discovered private IPv4 addresses. System clocks must be correct on both devices.

## Trust on Windows

Run from the repository folder in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Trust-Certificate.ps1"
```

This adds only the public CA to the current user's Windows trusted roots; it does not require an administrator. Windows may show its own trust confirmation. Restart Chrome if necessary, then open `https://localhost:8443`. Other browser trust stores or managed browser policies may require separate setup.

## Trust on Android

1. Copy `runtime/certs/ada-phonecam-ca.crt` from the computer to the phone over USB or another transfer method you trust. Alternatively, download it from an already trusted dashboard connection.
2. On the computer, compare its SHA-256 fingerprint with the dashboard, or run:

   ```powershell
   node --input-type=module -e "import {readFileSync} from 'node:fs'; import {X509Certificate} from 'node:crypto'; console.log(new X509Certificate(readFileSync('runtime/certs/ada-phonecam-ca.crt')).fingerprint256);"
   ```

3. On Android, open Settings and search for **Install a certificate** or **CA certificate**. Common paths include **Security & privacy > More security settings > Encryption & credentials > Install a certificate > CA certificate**. Names differ by Android version and manufacturer.
4. Choose the transferred `.crt` file and follow the system's CA installation prompts. A screen lock may be required. Some managed devices prohibit installing user CAs.
5. Verify that the installed certificate belongs to this installation. Compare the fingerprint if your Android certificate viewer exposes it.
6. Keep the devices on the same private network and open the LAN URL shown on the computer, for example `https://192.168.1.105:8443`. Chrome must trust the connection without a certificate warning. The dashboard should report **Secure browser context**. Do not infer trust from an encrypted connection alone; the CA must be trusted too.

An IP change within this computer's private interfaces keeps the same CA. Give the server up to the configured poll interval to add a newly assigned address. Browser caching or connections established before renewal can require a reload.

## Remove or replace trust

On Windows, use `certmgr.msc` under **Trusted Root Certification Authorities > Certificates** to remove the CA matching this installation's exact subject/fingerprint. On Android, remove the matching entry under user-installed trusted credentials.

For an intentional CA reset: stop Ada PhoneCam, remove the old CA trust from your devices, and move the old `runtime/certs/` directory to a secure backup location. Run `npm run setup`, then trust the new public CA on each device. Never delete or replace a shared certificate store. An incomplete or expiring CA produces a setup error rather than silently replacing device trust.

## Troubleshooting

- **Address unreachable:** check the chosen adapter, Wi-Fi client isolation, private network profile, and the scoped firewall rule. VPNs can change routing.
- **Wrong certificate address:** use the exact local IPv4 URL from the dashboard, not a custom hostname. Wait for discovery to refresh after an IP change.
- **Untrusted certificate:** check that the installed CA fingerprint matches this installation, restart Chrome, and verify both device clocks.
- **Port in use:** stop the other application, or set another port in `config.local.json` and update the firewall rule.
- **Permission denied:** use a project directory owned by your Windows account; do not run from a read-only installation directory.

The certificate trust store and firewall are not modified automatically by `Install.bat` or `Start.bat`.
