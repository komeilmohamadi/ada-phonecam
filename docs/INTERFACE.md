# Interface and saved quality presets

Use the sun/moon button on the dashboard, desktop studio, or phone page to switch between dark and
light themes. The default is dark. Each browser origin remembers its own choice when local storage
is available. The clean feed remains black and does not include interface elements.

In the desktop studio, start the phone camera to reveal its supported controls. Choose quality
settings, select a preset slot (1 to 3), and press Save preset. Load preset fills the form without
sending any camera command. Press Apply quality targets separately to request the settings from the
phone. Unsupported codec preferences are rejected on load. Presets store only quality targets,
never pairing secrets, device identifiers, or microphone consent. Browser storage is local to that
origin; clearing site data removes the presets. Actual negotiated quality can differ from targets.
