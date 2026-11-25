# Camera tuning and LAN diagnostics

This maintenance update preserves the active camera orientation on bitrate and codec changes. Resolution changes preserve the current reported orientation by default. Choose Landscape or Portrait explicitly to request the corresponding dimensions; Android Chrome may still rotate frames with the physical device or ignore an ideal constraint. The existing Clean Feed rotation is a separate output transform. The experimental native camera remains a fixed landscape 720p output.

The camera selector lists each distinct video input exposed by the browser after permission. Refresh the list or change the phone camera. Browser APIs cannot reveal every physical lens on all phones. A native Android camera implementation may be required for access to hidden lenses. Torch is attempted only when the current track reports support; the result is confirmed from actual track settings when available. A successful API call alone does not prove the light is on.

Low Noise loads a 30 FPS quality profile and a resolution-dependent bitrate target. It does not apply a denoising filter or modify exposure without consent. Additional light and a supported rear camera generally help. Sharpness and exposure controls depend on browser capabilities. Brightness and eight histogram bins are sampled from a small decoded preview every three seconds; a dark-scene warning is heuristic, not a noise or ISO measurement.

The phone sends one bounded 2 MiB data-channel probe on the first media connection after pairing. It times out after six seconds and never uses the Internet. The measured upload goodput and application-level RTT are approximate, and the probe briefly shares bandwidth with the live stream. Recommendations are starting targets only and are not automatically applied. A fresh pairing runs a new probe. Real sustained video bitrate and packet loss remain in the existing monitor.

## Device verification

- Apply a bitrate-only change while holding the phone horizontally, then vertically. Confirm that the source dimensions do not swap unexpectedly.
- Change resolution with Keep orientation selected, then request Portrait and Landscape separately. Compare reported settings and clean feed rotation.
- Refresh the lens list and test every exposed camera. Verify torch on and off physically on each supported rear camera.
- Pair once and check the measured LAN upload and RTT. Compare suggested targets to sustained WebRTC statistics.
- Compare the Low Noise preset at 1080p and 4K under the same light. Test the independent Windows camera separately.
