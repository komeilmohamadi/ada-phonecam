# Validation record

## Stage 1

The automated suite uses a real HTTPS socket and a temporary local CA. It checks:

- Private IPv4 detection, virtual-adapter ranking, explicit selection, missing selection, and no-network behavior.
- Public, malformed, and link-local address rejection.
- Configuration merge, environment override, and invalid configuration rejection.
- Certificate chain validation, localhost/IP SANs, failure without the CA, and leaf renewal after a simulated IP change while preserving the root CA.
- Real dashboard/status/asset responses, restrictive response headers, and no access to private key, process-state, repository, or arbitrary paths.
- Host validation, method restrictions, and the authenticated loopback shutdown endpoint, including rejection of browser-origin requests.

Local verification on Windows 10 Enterprise x64 (10.0.19045), Node.js 24.21.0:

| Check                                                | Outcome                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `scripts/Install.ps1` with Node.js already installed | Locked dependencies installed and certificates generated/reused successfully        |
| `npm run check`                                      | JavaScript syntax and project language checks passed                                |
| `npm test`                                           | 8 tests passed, including the four HTTPS subtests                                   |
| `npm audit`                                          | No known dependency vulnerabilities reported at verification time                   |
| PowerShell parser check                              | All three PowerShell scripts parsed successfully                                    |
| `Start.bat` and a repeated `Start.bat`               | Background startup succeeded; second start reused the existing instance             |
| TLS-verified health request                          | Correct application identity returned                                               |
| `Stop.bat` and a repeated `Stop.bat`                 | Graceful stop succeeded; second stop reported no running instance                   |
| Browser preview                                      | Reached the expected untrusted-CA warning; did not bypass it or change trust stores |

Additional smoke checks passed: TLS-verified requests through the actual Ethernet LAN address returned a healthy server response and rejected LAN shutdown. A deliberate port collision produced a clear startup error and cleaned up the process-state file.

Browser layout and interactions remain visually unverified until the local CA is trusted. This does not replace Android browser testing.

## Device verification still required

- Trust installation in Windows and Android certificate stores and warning-free Android Chrome access.
- Phone reachability through the actual private Wi-Fi/LAN and Windows Firewall setup.
- A real IP reassignment while a browser is open; automated coverage simulates adapter changes and exercises TLS context renewal.
- A clean installation with missing Node.js/winget and an offline launch after installation.
- A clean installation on a second Windows 10 machine.

Phone capture, QR pairing, WebRTC media, OBS, image quality, frame rate, thermal behavior, and video latency are outside stage 1 and have not been tested.

## Stage 2

Nine automated tests passed, including TLS-backed WebSocket pairing, origin rejection, bad-token rejection, one-use token replay rejection, offer forwarding, and revocation. npm audit reported zero known vulnerabilities. Real phone media and browser playback remain unverified; see STREAMING.md.

## Stage 3

Twelve automated tests passed. New tests check rejection of unsupported/out-of-range camera requests, preservation of existing constraints, manual-focus mode selection, exact FPS constraints, and detection of silently ignored settings. WebSocket tests also exercise control, acknowledgement, and capability forwarding. Camera tests use track doubles to test application logic; they do not validate physical Android hardware. Browser layout, real video/audio playback, camera switching, and actual camera settings still require a trusted phone session.

## Stage 4

Quality helper tests cover target validation, codec preference ordering, sender parameter acknowledgement, receiver hint fallback, and RTP statistics deltas. Android capture, real codec negotiation, actual bitrate and FPS, hardware acceleration, long-session stability, and camera-to-display latency still require device verification. See QUALITY.md for the manual test procedure.

## Stage 5

The clean feed uses the existing incoming MediaStream in a same-origin window. Unit tests cover settings validation, window authorization, live-stream selection, and audio policy. Real browser window capture, OBS audio routing, fullscreen, visual transforms, and end-to-end latency must still be checked on the host. See OBS.md.

## Stage 6

Monitoring helper tests exercise selected candidate-pair RTT, jitter and packet loss, missing counters, bounded history, recovery delays, and Wake Lock eligibility. Device recovery, Android power behavior, long sessions, and virtual camera registration and enumeration on Windows require host validation. See STABILITY.md and VIRTUAL-CAMERA.md.

## Stage 7

Tests cover theme storage fallback, quality preset validation, and native frame session ownership and expiration. Verify desktop and Android layouts, theme persistence, and actual video in Windows camera clients before release. See INTERFACE.md and NATIVE-CAMERA.md.
