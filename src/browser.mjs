import { spawn } from 'node:child_process';

export function openBrowser(url) {
  // The URL is built from the validated local port, never from a request header.
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'powershell.exe';
    args = [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process '${url}' -WindowStyle Normal`,
    ];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (error) =>
    console.error(`Could not open the browser: ${error.message}. Open ${url} manually.`),
  );
  child.unref();
}
