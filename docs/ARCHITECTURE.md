# Architecture

## Stage 1

The application uses Node.js 24+ ESM and the built-in HTTPS server. A small static dashboard polls a read-only status endpoint every five seconds while visible. It displays actual server uptime, bind configuration, discovered adapters, and certificate metadata. No frontend bundler or remote asset service is needed.

`@peculiar/x509` generates a local ECDSA P-256 CA and server certificate with Node.js WebCrypto. `reflect-metadata` is required by the certificate library. The CA signs HTTPS certificates only; it has no role in future WebRTC media encryption. A background refresh discovers private IPv4 addresses and updates the HTTPS secure context when SAN coverage changes.

The configured bind address is IPv4-only. Requests from public addresses and requests with an unknown Host header are rejected. The firewall helper narrows inbound access further to local subnets on private Windows profiles. Adapter names are ranked heuristically; users can override the preferred address.

The launcher starts one background Node.js process with a log file. An exclusive process-state file prevents multiple starts of the same installation. Shutdown is a loopback-only HTTPS POST with a per-run random control token and an instance identifier. It uses normal certificate verification and does not use process termination by a broad executable name. Trust and firewall configuration remain explicit operator actions.

## Intended media architecture, stage 2 onward

The computer will host the control panel, signaling service, and clean viewer. The Android browser will capture camera and optional microphone tracks. WebRTC will carry media directly between browsers; the Node.js server will not transcode or relay video. Signaling and pairing will use the local HTTPS/WebSocket service. No public STUN, TURN, CDN, or hosted backend will be required for same-LAN operation.

The implementation must check browser capabilities before exposing camera controls or codec choices. It must report capture and receive statistics separately, avoid promising hardware encoding, and distinguish network RTT from camera-to-display latency. Browser and Android background restrictions still apply. OBS integration and any virtual-camera path require real host/device validation.

These media components are design targets, not completed stage 1 features.
