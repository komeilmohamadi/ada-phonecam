# Remote camera controls

After the phone starts capturing, the studio receives capabilities, actual track settings, and camera labels from that phone. The browser only exposes cameras/lenses allowed by Android and its permissions; not every physical lens appears as a separate device.

Numeric controls include width, height, frame rate, zoom, focus distance, exposure compensation/time, ISO, color temperature, brightness, contrast, and saturation. Focus, exposure, and white-balance modes are populated from the reported enum values. Torch is enabled only when reported as supported. Missing and fixed-range controls are disabled. Units are browser-defined; this interface does not invent normalized ranges or conversions.

Changes are serialized and scoped to the current track ID, so an old command cannot target a replacement camera session. Width, height, and FPS use exact constraints and may fail even within reported independent ranges: the selected combination must also be supported. Image controls preserve other constraints. Manual focus, exposure, or white balance is requested for the corresponding manual values when available. The reported actual setting is compared with the request; ignored advanced constraints are not described as confirmed changes.

Switching cameras stops the old capture and opens the selected device with the previous dimensions/FPS as ideal targets. This can cause a short interruption. If opening fails, the error is shown and the user can start again on the phone. No old camera tracks are retained. The phone must consent to microphone capture before the computer can mute/unmute it. Remote Stop releases camera and microphone tracks; restarting is initiated on the phone.

Mirror/rotation and output transforms are part of the planned clean-feed work in stage 5. Codec and bitrate controls belong to stage 4. Actual exposure/ISO/manual-focus availability depends on Android Chrome and the device. Automated constraint tests cannot verify physical lens behavior; a real phone session is required for acceptance.
