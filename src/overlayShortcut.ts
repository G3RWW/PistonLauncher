import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { getHotkey, toTauriAccelerator } from './hotkeySettings';
import { getActiveSessionForPid } from './sessions';

const CONTEXT_KEY = 'launcher-overlay-context';
const ESCAPE_ACCEL = 'Escape';

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

// Reads the tracked app's current on-screen bounds and matches the
// overlay window to them. Called once on open, and repeatedly by
// overlay.ts's live-tracking loop while the overlay stays visible.
export async function matchOverlayToWindow(overlay: WebviewWindow, pid: number) {
  try {
    const rect = await invoke<[number, number, number, number] | null>('get_window_rect_for_pid', { pid });
    if (!rect) return;
    const [x, y, width, height] = rect;
    await overlay.setPosition(new PhysicalPosition(x, y));
    await overlay.setSize(new PhysicalSize(width, height));
  } catch (err) {
    console.error('Failed to match overlay to window:', err);
  }
}

// The overlay's own DOM keydown listener isn't reliable here, since the
// live position/size syncing means it can't be sure it holds OS keyboard
// focus. Registering Escape as a genuine global shortcut — only while the
// overlay is visible — makes closing it work regardless of focus.
async function registerEscapeToClose() {
  try {
    if (!(await isRegistered(ESCAPE_ACCEL))) {
      await register(ESCAPE_ACCEL, async (event) => {
        if (event.state === 'Pressed') {
          const overlay = await WebviewWindow.getByLabel('overlay');
          await overlay?.hide();
          await unregisterEscapeToClose();
        }
      });
    }
  } catch (err) {
    console.error('Failed to register Escape-to-close:', err);
  }
}

async function unregisterEscapeToClose() {
  try {
    if (await isRegistered(ESCAPE_ACCEL)) {
      await unregister(ESCAPE_ACCEL);
    }
  } catch {
    // ignore — nothing to clean up
  }
}

// bypassFocusCheck=true is used by the manual "Test Overlay" button, so it
// always works regardless of what's currently focused. Real shortcut
// presses go through the focus check.
// Hides the overlay if it's visible — unlike toggleOverlay, this can
// never accidentally SHOW it. Used by the auto-hide-on-switch-away check
// in overlay.ts, which must never open the overlay, only ever close it.
export async function hideOverlay() {
  try {
    const overlay = await WebviewWindow.getByLabel('overlay');
    if (!overlay) return;
    if (await overlay.isVisible()) {
      await overlay.hide();
      await unregisterEscapeToClose();
    }
  } catch (err) {
    console.error('Failed to hide overlay:', err);
  }
}

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
      await unregisterEscapeToClose();
      return;
    }

    let pid: number | undefined;
    if (!bypassFocusCheck) {
      const session = await getFocusedTrackedSession();
      if (!session) return; // silently do nothing — focused app isn't tracked
      pid = session.pid;
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ appId: session.appId, sessionId: session.id, pid: session.pid }));
    }

    await overlay.show();
    await overlay.setFocus();
    if (pid) {
      await matchOverlayToWindow(overlay, pid);
      // Some WebView2 versions only recompute transparency on an actual
      // pixel-value size change after the window is visible — force one.
      const size = await overlay.outerSize();
      await overlay.setSize(new PhysicalSize(size.width - 1, size.height));
      await overlay.setSize(new PhysicalSize(size.width, size.height));
    }
    await registerEscapeToClose();
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