import { readTheme, saveTheme, themeKey } from './preferences.js';

const button = document.getElementById('theme-toggle');
if (button) {
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    // The theme still works for this page if storage is disabled.
  }
  let theme = readTheme(storage);
  function render() {
    document.documentElement.dataset.theme = theme;
    const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.textContent = theme === 'dark' ? '\u2600' : '\u263e';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(theme === 'light'));
  }
  button.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    saveTheme(storage, theme);
    render();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === themeKey || event.key === null) {
      theme = readTheme(storage);
      render();
    }
  });
  render();
}
