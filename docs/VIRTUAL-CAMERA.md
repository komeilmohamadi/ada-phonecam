# Windows virtual camera (experimental OBS bridge)

Windows 10 supports DirectShow video capture filters. The optional installer registers an additional
DirectShow device moniker named **Ada PhoneCam**, using the already installed OBS Virtual Camera
filter. It is not a new kernel driver, independent camera engine, or Media Foundation camera. It
requires OBS Studio and its registered virtual camera. Applications that use DirectShow may list
Ada PhoneCam; applications that deduplicate CLSIDs or require Media Foundation may not list it.
Device enumeration and video delivery must be verified on the actual Windows host.

## Installation and use

1. Install OBS Studio from <https://obsproject.com/> if needed. Verify its normal OBS Virtual Camera
   is available first. Use a supported OBS release for the installed Windows version.
2. In the project directory, run `Virtual-Camera.cmd Status` to detect its registered backend.
3. Open Administrator PowerShell, change to the project directory, and run
   `.\Virtual-Camera.cmd Install`.
4. Start Ada PhoneCam, pair the phone, open the clean feed from the studio, and add that window to
   OBS with Window Capture. Start Virtual Camera in OBS.
5. Restart the target application and select **Ada PhoneCam** if it appears. If not, select
   **OBS Virtual Camera** instead. Test with actual video, not merely the device name.

The virtual camera carries video only. Use a separate microphone or audio route. OBS still performs
its normal compositing and output conversion; no extra WebRTC stream is opened by this bridge.

## Removal and limitations

Run `.\Virtual-Camera.cmd Remove` from Administrator PowerShell. Only the Ada-owned DirectShow
instance is removed. The original OBS registration, DLL, and settings are not changed. The script
checks 32-bit and 64-bit registry views and refuses to overwrite a foreign instance. If OBS is
uninstalled or its backend changes, remove the Ada entry and reinstall it after OBS is ready.

This is an opt-in machine-wide registration. The upgrader does not change the registry or request
elevation. A Git rollback does not undo OS registration; run Remove before rolling back the update.
A standalone branded virtual camera without OBS requires a separately implemented, built and tested
native capture filter or virtual camera service. This release does not supply that binary.

Reference: [Microsoft DirectShow registry layout](https://learn.microsoft.com/en-us/windows/win32/directshow/layout-of-the-registry-keys).
