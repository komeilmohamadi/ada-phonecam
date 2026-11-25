# Monitoring and recovery

The video statistics panel samples the existing peer's RTP report approximately once per second.
It displays FPS, bitrate, selected ICE candidate-pair RTT, RTP jitter, interval packet loss, dropped
frames and freeze count when the browser reports them. Missing or reset counters show N/A. RTT is
network round-trip time, not camera-to-display latency. The two graphs retain at most 60 samples;
background throttling may change the sample interval. Graph drawing never copies video frames.
The recent connection event list retains only 20 entries in memory and does not log credentials.
Outbound loss may use the latest remote RTCP fraction-lost report when packet counters are missing.

The phone requests Screen Wake Lock only during a live camera session while its page is visible.
The phone user can disable it. The browser may deny or release it, and Android background capture
is not guaranteed. Stop camera and page navigation release the lock.

A failed media peer is eligible for up to three automatic replacement attempts with fresh ICE
negotiation. Disconnected or connecting peers get at least ten seconds to recover first. The phone
must still have a live, user-authorized camera and an authenticated signaling socket. A successful
15-second connection resets the attempt budget. This is peer reconstruction, not an in-place ICE
restart. On signaling loss the existing privacy behavior stops capture; reconnect retries use bounded
exponential delay, but the user must press Start camera again. Pairing revocation never restarts media.

## Manual checks

- Run a 15-minute and a two-hour stream, record FPS/bitrate/packet loss, and watch for freezes.
- Interrupt Wi-Fi briefly with the studio still open; observe bounded media recovery or signaling
  reconnect and explicitly restart capture when required.
- Stop the camera, disconnect the phone, and close the studio; verify camera indicator and Wake Lock
  are released and Clean Feed returns to black.
- Check the chart resets between sessions and unsupported stats show N/A rather than fake zeros.
- Confirm actual latency separately using a visible timer and a camera recording of both displays.
