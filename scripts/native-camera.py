"""Optional OBS-independent Windows virtual camera sender."""
import http.client
import json
from pathlib import Path
import secrets
import ssl
import sys

WIDTH, HEIGHT, FPS = 1280, 720, 30
SIZE = WIDTH * HEIGHT * 4
DEVICE = "Ada PhoneCam"
ROOT = Path(__file__).resolve().parents[1]


def main():
    import numpy as np
    import pyvirtualcam

    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8-sig"))
    context = ssl.create_default_context(
        cafile=str(ROOT / "runtime" / "certs" / "ada-phonecam-ca.crt")
    )
    token = secrets.token_hex(32)
    headers = {"X-Ada-Native": token}
    connection = None
    black = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    black[:, :, 3] = 255

    def request(method, endpoint):
        nonlocal connection
        if connection is None:
            connection = http.client.HTTPSConnection(
                "localhost", config["port"], context=context, timeout=1.0
            )
        connection.request(method, "/api/native-camera/" + endpoint, headers=headers)
        response = connection.getresponse()
        data = response.read(SIZE + 1)
        if len(data) > SIZE:
            raise ValueError("Unexpected frame length")
        return response.status, data

    try:
        with pyvirtualcam.Camera(
            width=WIDTH, height=HEIGHT, fps=FPS, fmt=pyvirtualcam.PixelFormat.RGBA,
            backend="unitycapture", device=DEVICE
        ) as camera:
            print(f"Using {camera.device}. Enable Windows camera output in Ada Studio.", flush=True)
            print("Press Ctrl+C to stop. Video only; no OBS required.", flush=True)
            registered = False
            while True:
                frame = black
                try:
                    if not registered:
                        code, _ = request("POST", "session")
                        registered = code == 204
                    if registered:
                        code, data = request("GET", "frame")
                        if code == 200 and len(data) == SIZE:
                            frame = np.frombuffer(data, dtype=np.uint8).reshape(HEIGHT, WIDTH, 4)
                        elif code != 204:
                            registered = False
                except (OSError, http.client.HTTPException, ValueError):
                    if connection is not None:
                        connection.close()
                    connection = None
                    registered = False
                camera.send(frame)
                camera.sleep_until_next_frame()
    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Native camera stopped.")
    except Exception as exc:
        print(f"Native camera error: {exc}", file=sys.stderr)
        sys.exit(1)
