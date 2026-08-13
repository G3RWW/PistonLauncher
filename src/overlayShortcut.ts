import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { getHotkey, toTauriAccelerator } from './hotkeySettings';
import { getActiveSessionForPid } from './sessions';

const CONTEXT_KEY = 'launcher-overlay-context';

let currentRegistered: string | null = null;

async function getFocusedTrackedSession() {
  try {
    const pid = await invoke<number | null>('get_foreground_pid');
    if (pid == null) return null;
    return getActiveSessionForPid(pid) ?? null;
  } catch {
    return null;
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

    if (!bypassFocusCheck) {
      const session = await getFocusedTrackedSession();
      if (!session) return; // silently do nothing — focused app isn't tracked
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ appId: session.appId, sessionId: session.id, pid: session.pid }));
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