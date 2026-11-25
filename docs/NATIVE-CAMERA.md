# OBS-independent Windows camera (experimental)

This optional path uses the upstream UnityCapture DirectShow filter and pyvirtualcam sender. No OBS
process is required. It is not an Ada-owned native DLL, signed kernel driver, or physical PnP device.
Windows 10 desktop applications that accept DirectShow cameras may list the named device. Windows
Camera, some Media Foundation applications, and Windows device settings may not list it. The modern
MFCreateVirtualCamera API requires Windows build 22000 (Windows 11). Universal enumeration on Windows
10 requires a different native driver strategy and device testing.

## Setup

1. If the Stage 6 OBS alias was installed, remove it with `Virtual-Camera.cmd Remove` in Administrator
   PowerShell to avoid two devices named Ada PhoneCam. This does not remove OBS Virtual Camera.
2. Obtain UnityCapture from its upstream repository: <https://github.com/schellingb/UnityCapture>.
   Review the download and keep its Install directory in a permanent location. This update does not
   download, redistribute, or verify the external DLLs. If UnityCapture is already in use, do not
   overwrite that installation: the custom-name installer changes its existing registration.
3. Run the upstream `InstallCustomName.bat` as Administrator and enter `Ada PhoneCam` as the name.
   Use the upstream uninstall script to remove it when no other workflow depends on it. Run
   `Native-Camera.cmd Status` to inspect the named DirectShow entries and separate PnP enumeration.
4. Install 64-bit Python 3.12 from <https://www.python.org/downloads/> with its Windows launcher.
   In normal, non-elevated PowerShell run `Native-Camera.cmd Setup`. This creates an isolated virtual
   environment under runtime and installs pinned external packages; it requires internet only for setup.
5. Start Ada PhoneCam with Start.bat, pair a phone, and start its camera. Run
   `Native-Camera.cmd Start` in another normal PowerShell window. Enable Windows camera output in
   the desktop studio. Restart the target program and select Ada PhoneCam.
6. Disable the output in the studio and press Ctrl+C in the helper when finished. Closing the studio
   or loss of fresh frames produces black output after the frame timeout. The helper must stay open.

## Technical limits

The optional sender copies decoded RGBA frames at a target of 1280 x 720 and up to 30 FPS, then uses
local HTTPS with the existing CA, a short-lived native reader session, and an in-memory latest frame.
Only the local studio origin can publish frames. No frame files, additional phone peer connection,
network relay, or video re-encoding is used. CPU, memory bandwidth, latency and achieved FPS need
measurement on Windows. The native output currently uses aspect-fit video without the OBS-specific
rotation/mirror settings, and carries video only. The existing clean feed is unchanged. Camera output
is off by default and is never restored automatically from browser storage.

References: [UnityCapture](https://github.com/schellingb/UnityCapture),
[pyvirtualcam](https://github.com/letmaik/pyvirtualcam),
[Microsoft MFCreateVirtualCamera](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera).
External components retain their own licenses and distribution terms. No external binaries are bundled.
