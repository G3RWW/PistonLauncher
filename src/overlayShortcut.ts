import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { getHotkey, toTauriAccelerator } from './hotkeySettings';
import { hasActiveSessionForPid } from './sessions';

let currentRegistered: string | null = null;

async function isTrackedAppFocused(): Promise<boolean> {
  try {
    const pid = await invoke<number | null>('get_foreground_pid');
    return pid != null && hasActiveSessionForPid(pid);
  } catch {
    return false;
  }
}

// bypassFocusCheck=true is used by the manual "Test Overlay" button, so it
// always works regardless of what's currently focused. Real shortcut
// presses go through the focus check.
export async function toggleOverlay(bypassFocusCheck = false) {
  try {
    const overlay = await WebviewWindow.getByLabel('overlay');
    if (!overlay) {
      console.warn('Overlay window not found — check the "overlay" window label in tauri.conf.json');
      return;
    }

    const visible = await overlay.isVisible();
    if (visible) {
      await overlay.hide();
      return;
    }

    if (!bypassFocusCheck && !(await isTrackedAppFocused())) {
      return; // silently do nothing — the focused app isn't one we're tracking
    }

    await overlay.show();
    await overlay.setFocus();
  } catch (err) {
    console.error('Failed to toggle overlay:', err);
  }
}

// Registers (or re-registers, if called again with a new combo) the
// overlay's global shortcut. Throws if the combo is unavailable, so
// callers (the hotkey settings UI) can show an error and roll back.
export async function updateOverlayShortcut(combo: string) {
  const accel = toTauriAccelerator(combo);

  if (currentRegistered) {
    await unregister(currentRegistered).catch(() => {});
    currentRegistered = null;
  }

  await register(accel, (event) => {
    if (event.state === 'Pressed') {
      toggleOverlay();
    }
  });
  currentRegistered = accel;
}

updateOverlayShortcut(getHotkey('overlay')).catch((err) => {
  console.error('Failed to register overlay shortcut:', err);
});

document.querySelector<HTMLButtonElement>('#test-overlay-btn')!.addEventListener('click', () => {
  toggleOverlay(true);
});