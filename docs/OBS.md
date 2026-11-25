# OBS clean feed

Stage 5 adds a separate local clean feed window. It shares the already received MediaStream in the desktop browser, with no second WebRTC connection, canvas frame processing, or additional video encoding in Ada PhoneCam. The browser still has to render the second video element, and OBS may encode its final output. CPU/GPU usage and latency must be measured on the actual host.

## Window Capture (recommended)

1. Start Ada PhoneCam and open `https://localhost:8443/studio` (use your configured port).
2. Pair the phone, start its camera, and verify that the studio shows incoming video.
3. Click **Open clean feed**. Allow the popup for localhost if Chrome blocks it. The popup is at `/view` and shows only the video on a black background.
4. Add a **Window Capture** source in OBS and select the window titled **Ada PhoneCam | Clean Feed**. Choose the available Windows capture method that works on your computer. Disable cursor capture if available. Crop any browser chrome using OBS source crop controls. Double-click the feed or press F to enter or exit fullscreen if desired.
5. Set the OBS base canvas and output resolution and FPS to match your production requirements. Fit the source to the canvas. Keep the clean feed visible and avoid minimizing it; browser and capture behavior can vary.

The studio controls rotation (0, 90, 180, 270 degrees), horizontal and vertical mirror, and feed audio. Rotation and mirroring affect only the display, not the capture or encoding settings. The video retains its aspect ratio with black letterboxing when necessary. For matching source geometry, use a window and OBS canvas with the same aspect ratio as the camera output after rotation.

The feed is tied to the exact popup opened by the studio; opening `/view` independently produces a black page. Keep the studio open. A stopped camera or disconnected peer clears the feed, and a new connected video stream appears automatically. Closing the studio closes the authorized popup. The route is available only through localhost on the computer, not from another LAN device.

## Browser Source and Virtual Camera

OBS Browser Source runs in a separate browser context and cannot share a MediaStream object from the external Chrome studio. Do not paste `/view` into Browser Source expecting video. Stage 5 deliberately does not create a secondary encoded relay to support it. Use Window Capture instead. Direct Browser Source would require a separate authenticated media receiver or another delivery architecture; it remains unimplemented in this release.

After adding the window source to an OBS scene, use OBS **Start Virtual Camera** if you need the composed video in another application. Ada PhoneCam does not install a Windows virtual camera driver. OBS Virtual Camera is not the phone microphone audio output.

## Audio and synchronization

Phone microphone capture is optional and must be enabled on the phone before capture. The studio and clean feed start muted. Enable **clean feed audio** in the studio only when you want it; this mutes studio monitoring. Enabling studio monitor audio disables feed audio. If browser autoplay blocks audio, click the clean feed window to retry playback.

Window Capture may not include audio. In a compatible OBS version, use application audio capture or the source's audio-capture option if available. Otherwise use a suitable desktop audio capture route. Do not capture the same browser audio twice. Avoid capturing the phone microphone and your monitoring speakers together; use headphones to prevent feedback.

Use OBS **Advanced Audio Properties > Sync Offset** for the captured audio source. A positive offset delays audio; if video needs delaying, use an appropriate OBS video delay filter. Keep offset at zero initially, then measure a visible clap with its sound in a test recording and adjust. This is OBS-side synchronization, not an Ada PhoneCam browser audio buffer or an automatic latency measurement.

## Manual acceptance checks

- Verify the feed opens from the studio and shows a live phone image without text, logos, controls, or a second phone connection.
- Verify `/view` opened independently is black and a LAN address cannot open the route.
- Test every rotation and both mirror switches using asymmetric camera content; check portrait and landscape letterboxing.
- Enter and exit fullscreen, close and reopen the feed, change camera quality, and stop and restart the phone. Confirm that the feed clears on disconnect and returns when connected.
- Verify both audio routes are silent by default, the audio switch does not duplicate playback, and OBS receives audio only through the intended source.
- Record a short OBS clip and test Virtual Camera in the target application. Measure real video latency using the procedure in QUALITY.md. Compare CPU/GPU usage and latency with the feed closed and open, using the same camera settings.

These device checks are not replaced by the automated unit tests.
