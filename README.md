# Ada PhoneCam

Turn an Android phone into a high-quality webcam for OBS over a local network.

**Current release: stage 6 of 8.** Includes the HTTPS foundation, temporary QR pairing, a phone capture page, direct WebRTC video with optional microphone audio, capability-driven remote camera controls, and configurable video quality targets. Open `/studio` through localhost on the computer. See [streaming setup and validation limits](docs/STREAMING.md) and [camera controls](docs/CAMERA-CONTROLS.md). Real Android playback and physical camera changes remain required device tests. See [quality and latency](docs/QUALITY.md). Open the clean feed from the studio for OBS Window Capture; see [OBS setup](docs/OBS.md). Direct OBS Browser Source is not supported by this shared-stream path. See [monitoring and recovery](docs/STABILITY.md) and the [experimental named Windows camera bridge](docs/VIRTUAL-CAMERA.md), which requires OBS.

## Requirements

- Windows 10 x64 or newer; Node.js 24 or newer and npm.
- Chrome or another current browser on the computer.
- A private LAN connection for accessing the dashboard from other devices.
- Internet access for the initial Node.js and npm dependency installation. The installed application runs without Internet access and uses no CDN, cloud service, analytics, or external fonts.

## Quick start on Windows

1. Download or clone this repository into a directory you own.
2. Run `Install.bat`. It installs the locked npm dependencies and creates a CA unique to this installation. If Node.js is missing, it attempts to install Node.js LTS with `winget`; Windows may request elevation. If `winget` is unavailable, install [Node.js](https://nodejs.org/en/download) manually and run the installer again.
3. In PowerShell, trust the public CA certificate for your Windows account:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Trust-Certificate.ps1"
   ```

4. Run `Start.bat`. The server starts in the background and opens `https://localhost:8443`. Restart the browser if it does not yet recognize the trusted certificate.
5. Use the dashboard to see the LAN addresses and download the public CA certificate. Follow [HTTPS setup](docs/HTTPS.md) before connecting an Android phone.
6. Run `Stop.bat` to stop only this installation's server.

The setup dashboard contains live server data. It does not request camera or microphone access in stage 1. Certificate trust and firewall rules are explicit setup steps, not changes made silently by the installer.

## Allow LAN access through Windows Firewall

If another device cannot connect, verify that the Windows network profile is **Private**. In an elevated PowerShell window, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\Configure-Firewall.ps1"
```

This creates an inbound TCP rule for the configured HTTPS port and Node.js executable, scoped to the local subnet on private profiles. To remove it, run the same command with `-Remove`. No router port forwarding is needed. Future WebRTC media traffic may require additional browser firewall permissions; this rule covers stage 1 HTTPS only.

## Configuration

Defaults live in `config.json`. Create an ignored `config.local.json` to override any value:

```json
{
  "port": 8443,
  "preferredAddress": "192.168.1.105",
  "openBrowser": true
}
```

Use an address actually assigned to this computer. The example address above must be replaced with your own. Restart after changing configuration; update the firewall rule if the port changed.

| Setting              | Default   | Meaning                                                                    |
| -------------------- | --------- | -------------------------------------------------------------------------- |
| `host`               | `0.0.0.0` | Listen on IPv4 interfaces. Use `127.0.0.1` for computer-only access.       |
| `port`               | `8443`    | HTTPS port, from 1024 to 65535.                                            |
| `preferredAddress`   | `null`    | Override automatic selection with an assigned private IPv4 address.        |
| `openBrowser`        | `true`    | Open the dashboard after a successful start.                               |
| `networkPollSeconds` | `15`      | Refresh network discovery and certificate coverage every 5 to 300 seconds. |

`ADA_PORT`, `ADA_HOST`, and `ADA_NO_OPEN=1` override their respective settings for command-line use. Adapter selection favors named Ethernet and Wi-Fi interfaces over common virtual/tunnel names. This is a heuristic, not a route or Internet connectivity probe. All private IPv4 adapters are listed so you can choose an address that your phone can reach. A missing preferred address falls back to an available adapter and raises a notice.

When a new local address appears, the server reissues its certificate with the existing CA and reloads the TLS context. New connections use the updated certificate. Move to the new URL if your network address changed; no new CA installation is required.

## Development

```powershell
npm ci --ignore-scripts
npm run setup
npm run dev
```

`npm run dev` runs in the foreground without opening a browser. Use Ctrl+C to stop. `npm start` and `npm stop` use the same background lifecycle as the batch files.

```powershell
npm run check
npm run format:check
npm test
npm audit
```

Tests cover real TLS requests, certificate trust and renewal, configuration validation, IP selection, host checks, and authenticated local shutdown. See [validation notes](docs/VALIDATION.md) for completed checks and remaining device verification.

## Project structure

```text
src/          HTTPS server, network discovery, certificates, and lifecycle
public/       Local setup dashboard; no build step or remote assets
scripts/      Installation, launch, certificate trust, and firewall tools
test/         Node.js test runner integration tests
docs/         HTTPS setup, architecture, roadmap, and validation notes
runtime/      Generated certificates, process state, and server log (ignored)
```

`runtime/server.log` records startup and server errors. `runtime/server.json` holds the current server's PID and a random local control secret. Stopping uses a TLS-verified, authenticated loopback request and never kills arbitrary Node.js processes. A stale state file from a dead process is recovered on the next start. If the file is damaged or its PID has been reused, confirm this installation is stopped before removing only `runtime/server.json`.

## Security boundary

The server accepts loopback and RFC 1918 private IPv4 clients, validates the HTTP Host header, serves only explicitly listed assets, and does not provide general filesystem access. These address checks do not prove that a device is authorized or physically on your LAN. Use a trusted private network and the scoped firewall rule. The setup dashboard and public CA download are readable by allowed local clients. Private keys and the shutdown secret are never served. The shutdown endpoint also requires loopback access and rejects browser-origin requests. The studio requires a localhost connection; phones need a valid one-use pairing token before exchanging signaling messages.

Keep the project in your own Windows user directory or another directory with equivalent access controls. Do not share `runtime/`, `ca.key`, `server.key`, or backups of these private keys. Only `ada-phonecam-ca.crt` is intended for transfer. Generated keys, local configuration, dependencies, and logs are excluded from Git.

## Scope and next stages

See the [eight-stage roadmap](docs/ROADMAP.md) and [architecture](docs/ARCHITECTURE.md). All application text, source comments, documentation, and commit messages are in English. No camera quality, frame rate, end-to-end latency, OBS compatibility, or long-session stability claim has been verified in stage 1.

This repository currently has no open-source license grant (`UNLICENSED`). Public visibility alone does not grant reuse rights.
