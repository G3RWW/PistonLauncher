import './styles.css';

// Side-effect modules: each wires up its own event listeners on import.
import './settings/theme';
import './header';
import './library/panels';
import './library/scan';
import './library/backup';
import './quickLaunch';
import './settings/hotkeys';
import './settings/settings';
import './courses';
import './about';
import './runningStatus';
import './modalBehavior';

import { renderView } from './library/render';
import { reconcileOrphanedSessions } from './core/actions';
import { updateOverlayShortcut, startShortcutHealthCheck } from './overlay/overlayShortcut';
import { getHotkey } from './settings/hotkeySettings';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { resetTimersOnAppClose } from './core/timerState';

renderView();
reconcileOrphanedSessions();

// Pomodoro/reminder timing is wall-clock based (an "endsAt" timestamp,
// a "lastFiredAt" timestamp) — if it just sat in storage untouched
// while the app was fully closed, reopening later would either
// silently auto-complete a session nobody was there for, or fire a
// pile of overdue reminders all at once. Reset it right as the app
// closes so the next launch always starts clean.
getCurrentWindow()
  .onCloseRequested(() => {
    resetTimersOnAppClose();
  })
  .catch((err) => {
    console.error('Failed to register timer-reset-on-close handler:', err);
  });

// Main-window-only setup — overlayShortcut.ts is now shared with the
// overlay window's own bundle, so anything main-window-specific (DOM
// lookups, and registering the global shortcut exactly once) belongs
// here rather than as a side effect inside that shared file.
updateOverlayShortcut(getHotkey('overlay'))
  .then(() => startShortcutHealthCheck())
  .catch((err) => {
    console.error('Failed to register overlay shortcut:', err);
  });