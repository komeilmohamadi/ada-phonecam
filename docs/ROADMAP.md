# Eight-stage roadmap

Each stage should produce runnable code, relevant verification, an English commit, and a push to the GitHub repository. Device-dependent claims require actual device testing.

| Stage | Deliverable                                                                                                   | Completion evidence                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | Local Node.js HTTPS server, IP discovery, setup dashboard, Windows scripts, certificate and firewall guidance | TLS and security integration tests, network/config tests, start/stop smoke test |
| 2     | Secure temporary pairing, QR connection, WebSocket signaling, direct WebRTC phone video and optional audio    | Unauthorized pairing rejection and real phone-to-computer stream                |
| 3     | Camera selection and capability-driven remote controls                                                        | Actual supported constraints and visible capture changes on Android Chrome      |
| 4     | Resolution/FPS targets, bitrate and codec controls, performance profiles                                      | Real sender/receiver statistics and measured behavior under load                |
| 5     | Clean feed and OBS workflow, transforms, optional audio and sync guidance                                     | OBS Browser Source or documented capture fallback validated on the host         |
| 6     | Live statistics/charts, reconnection, Wake Lock, resource cleanup and stability work                          | Recovery tests and timed sessions with recorded observations                    |
| 7     | Final responsive dark interfaces and saved profiles                                                           | Desktop/phone interaction and persistence checks; English-only UI               |
| 8     | Final device testing, Windows distribution, documentation and first full release                              | Reproducible install, validation report, release assets where supported         |

Priorities: real video latency, actual image quality, long-session stability, sustained frame rate, OBS compatibility, hardware efficiency, easy pairing, then final visual refinement. Stage 1 includes a functional setup interface so local networking can be verified early. The final streaming interface belongs to later stages.

The default capture target will be 1080p60 where supported. Other targets include 480p through 4K, 30/60 FPS, and a 1-150 Mbps bitrate target range. Browser, device, codec, and network limits must remain visible. These values are targets, not guarantees. Portable packaging will be evaluated in stage 8; a standalone EXE is not yet committed as a supported distribution.
