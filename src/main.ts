import './styles.css';

// Side-effect modules: each wires up its own event listeners on import.
import './theme';
import './header';
import './panels';
import './scan';
import './backup';
import './quickLaunch';
import './hotkeys';
import './runningStatus';
import './modalBehavior';

import { renderView } from './render';
import { reconcileOrphanedSessions } from './actions';
import { toggleOverlay, updateOverlayShortcut } from './overlayShortcut';
import { getHotkey } from './hotkeySettings';

renderView();
reconcileOrphanedSessions();

// Main-window-only setup — overlayShortcut.ts is now shared with the
// overlay window's own bundle, so anything main-window-specific (DOM
// lookups, and registering the global shortcut exactly once) belongs
// here rather than as a side effect inside that shared file.
updateOverlayShortcut(getHotkey('overlay')).catch((err) => {
  console.error('Failed to register overlay shortcut:', err);
});

document.querySelector<HTMLButtonElement>('#test-overlay-btn')!.addEventListener('click', () => {
  toggleOverlay(true);
});