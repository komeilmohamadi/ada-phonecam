# Stage 4 - Quality and latency

Open the computer studio, pair the phone, and start capture. The quality controls appear alongside the capability-driven camera settings. Press **Apply quality targets** to send the full request to the current camera session. Profiles and codec preferences are session settings; saved presets and reconnection improvements belong to later stages.

## Targets and profiles

| Profile | Suggested video bitrate limit | Adaptation preference | Optional hint |
| --- | --- | --- | --- |
| Ultra Low Latency | 8 Mbps | Maintain frame rate | Motion; request a zero receiver jitter-buffer target when exposed |
| Balanced (default) | 12 Mbps | Balanced | Browser default |
| Maximum Quality | 25 Mbps | Maintain resolution | Detail |

The default target is 1920 x 1080 at 60 FPS. Select 480p, 720p, 1080p, 1440p or 2160p at 30/60 FPS. Capture uses ideal constraints with upper bounds, preserving other camera constraints. An actual phone may return smaller dimensions or fewer frames; independent width/height/FPS limits do not establish support for every combination. Hold the phone in landscape for these landscape targets. Individual camera controls remain available for more specific adjustments.

The bitrate control accepts 1-150 Mbps as an encoder ceiling, not a guaranteed bitrate. Congestion control, available bandwidth, the camera, and the encoder still determine the delivered stream. The browser can reject or ignore optional parameters. The studio reports whether the sender's parameter readback matched the requested ceiling; this is not proof that the encoder is sending that bitrate. No external STUN/TURN server or transcoding is introduced.

Automatic codec selection is the default. H.264, VP8, VP9 and AV1 appear only when the phone exposes the codec in its RTP sender and receiver capabilities and supports codec preferences. The requested codec is preferred, not forced; fallback and repair codecs remain in the list. The receiving browser may not support the same profiles. Read the actual negotiated codec in RTP stats. Hardware encoding/decoding cannot be forced or reliably inferred from the codec name. Browser hints do not guarantee a particular encoder, buffer length or latency. Changing codec or performance profile recreates the peer connection, which can interrupt video briefly. If negotiation fails, use Automatic codec and restart capture.

## Actual measurements

The phone displays outgoing RTP resolution, FPS, measured video bitrate, codec and encoder limitation reason when available. The studio displays the corresponding incoming RTP measurements and dropped frames. Missing statistics display N/A. Bitrate is calculated from bytes per elapsed RTP stats timestamp interval; the first sample or a counter reset cannot yield a rate. The measurement describes the selected primary video stream, not all network traffic or the configured ceiling. The display does not estimate end-to-end delay from RTT. No artificial upscaling or frame interpolation is added.

## Manual validation on Windows and Android

1. Run `npm run check` and `npm test`; run `npm run format:check` if the formatter is installed. Start the server, trust the local CA, and open the studio on localhost.
2. Pair the phone, start with 1080p60 and Balanced, and check both the capture summary and received RTP statistics for at least 30 seconds. Record actual resolution, FPS, bitrate and negotiated codec. If unavailable, record N/A.
3. Test 720p30, 1080p60 and 4K only where supported; compare targets to actual sender and receiver measurements. Apply 5, 12 and 25 Mbps limits, verify sender acknowledgement and observe bitrate. Test Automatic and each available codec, including fallback if the desktop cannot negotiate one.
4. Test the three profiles on the same scene, Wi-Fi and phone orientation. Compare stability, actual FPS and codec; note any rejected constraints, camera heat, or connection interruptions. Do not assume a high bitrate or low buffer target reduces real latency.
5. Measure camera-to-display latency independently: place a millisecond timer or blinking light within the phone's field of view, show the received video next to the original, and record both using another high-frame-rate camera. For multiple transitions, compare event times or frame counts between source and received view. Report median and worst observed values, recording frame-rate uncertainty. Repeat after at least 30 minutes. This measures the browser preview; repeat through OBS in stage 5. Under 100 ms is a goal, not a verified result.
6. Check that phone stop, studio disconnect, camera switching and ordinary camera controls still work. Close and reopen both pages if needed after the update.

If a fresh Git clone already contains the tracked upgrader but lacks its local journal directory, create `.ada-upgrader/updates` before applying packages. Keep packages outside the repository and keep journals/backups out of Git. The upgrader's SHA-256 check validates package integrity; it is not a digital signature or publisher authentication.

The unit tests exercise the code paths with browser API doubles. They do not confirm real hardware acceleration, actual 4K60, sustained 150 Mbps, OBS compatibility, or measured sub-100-ms latency.
