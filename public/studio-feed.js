import { getPeer, isPhone } from './stream.js';
import { isFeedWindow, normalizeFeedSettings, selectLiveStream } from './feed.js';

if (!isPhone && location.hostname === 'localhost' && location.pathname === '/studio') {
  const $ = (id) => document.getElementById(id);
  const preview = $('video');
  const audio = $('feed-audio');
  const status = $('feed-status');
  let viewer = null;
  $('clean-feed').hidden = false;

  function settings() {
    return normalizeFeedSettings({
      rotation: $('feed-rotation').value,
      mirrorX: $('feed-mirror-x').checked,
      mirrorY: $('feed-mirror-y').checked,
      audio: audio.checked && preview.muted,
    });
  }

  function authorized(caller) {
    return isFeedWindow(viewer, caller, location.origin);
  }

  // Only the exact popup opened by this studio can read the current stream.
  // No new WebRTC sender, media serialization, canvas, or server relay is used.
  window.adaReadCleanFeed = (caller) => {
    if (!authorized(caller)) return null;
    return {
      stream: selectLiveStream(preview.srcObject, getPeer()?.connectionState),
      settings: settings(),
    };
  };

  window.adaReportCleanFeed = (caller, state) => {
    if (!authorized(caller)) return;
    const messages = {
      waiting: 'Clean feed open. Waiting for a connected phone video.',
      playing: 'Clean feed playing. Select its window in OBS.',
      blocked: 'Feed audio blocked by browser autoplay. Click the feed window to enable audio.',
      paused: 'Clean feed playback paused. Click its window to retry.',
    };
    if (Object.hasOwn(messages, state)) status.textContent = messages[state];
  };

  $('open-feed').onclick = () => {
    if (authorized(viewer)) {
      viewer.focus();
      return;
    }
    viewer = window.open('/view', '_blank', 'popup,width=960,height=540');
    status.textContent = viewer
      ? 'Opening clean feed...'
      : 'Popup blocked. Allow popups for localhost and try again.';
    if (!viewer) audio.checked = false;
  };

  audio.onchange = () => {
    if (audio.checked) {
      if (!authorized(viewer)) {
        audio.checked = false;
        status.textContent = 'Open the clean feed before enabling its audio.';
        return;
      }
      preview.muted = true;
      $('sound').textContent = 'Enable monitor audio';
    }
  };

  // Switching monitor audio on makes the feed silent to avoid duplicate playback.
  preview.addEventListener('volumechange', () => {
    if (!preview.muted) audio.checked = false;
  });

  const watcher = setInterval(() => {
    if (viewer?.closed) {
      viewer = null;
      audio.checked = false;
      status.textContent = 'Clean feed closed. Open it again when needed.';
    }
  }, 500);

  window.addEventListener('pagehide', () => {
    clearInterval(watcher);
    if (authorized(viewer)) viewer.close();
    viewer = null;
    delete window.adaReadCleanFeed;
    delete window.adaReportCleanFeed;
  });
}
