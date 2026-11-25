# Phone streaming

Open `https://localhost:8443/studio` on the computer. Only one local studio controller can be connected. Trust the local CA on the phone first (see HTTPS.md), then select the LAN adapter shared with the phone and create a pairing QR code. Scan it or copy the complete link into Android Chrome. The link is a one-use bearer credential, expires after two minutes, and is removed from the phone address bar after loading. Anyone holding an unused link can pair; keep it private.

Press **Start camera** on the phone and accept the browser permission prompt. Optional microphone capture must be selected on the phone before starting. The initial target is 1080p60 with the rear camera, using ideal constraints; actual capture can be lower. Computer playback starts muted to prevent feedback. Enable monitor audio explicitly if needed.

WebRTC uses local ICE candidates with no external STUN/TURN server. Media goes directly between browsers. Signaling uses local WSS, with matching Origin/Host checks, a message size limit, authentication timeout, heartbeat, and rate limit. The studio is limited to localhost on the computer. Closing the studio or generating a new pairing code revokes the phone session. Restarting the server invalidates all credentials.

If signaling drops, camera tracks are stopped and signaling reconnects with an in-memory resume credential while the same studio remains available. Press Start camera again after reconnection. Reloading the phone requires a fresh pairing code. A failed media connection can be retried with Stop and Start. Keep the phone page visible and unlocked. VPN routing, client isolation, browser UDP firewall rules, and Android background restrictions can prevent streaming even when HTTPS works.

## Validation boundary

The automated tests validate TLS, WebSocket origin rejection, single-use pairing, bad-token rejection, signaling forwarding, and revocation. Real Android camera capture, WebRTC playback, audio, and latency require the user's phone and trusted browser setup and are not claimed as verified by these tests. Stage 3 adds capability-driven remote camera controls. Performance tuning and OBS clean feed belong to later stages.
