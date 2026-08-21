import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { toTauriAccelerator } from './hotkeySettings';
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

  // Defensively unregister the target accelerator itself too, in case a
  // previous registration for it is still active at the OS level but
  // this module's own tracking of that (currentRegistered) was reset —
  // e.g. by a window reload during dev. Without this, register() can
  // fail with "already registered" even though nothing in the current
  // session appears to own it.
  if (await isRegistered(accel).catch(() => false)) {
    await unregister(accel).catch(() => {});
  }

  await register(accel, (event) => {
    if (event.state === 'Pressed') {
      toggleOverlay();
    }
  });
  currentRegistered = accel;
}

// Windows can silently stop delivering a global hotkey's keypresses
// without ever un-registering it — this happens most often when another
// app's keyboard hook (game overlays, push-to-talk software, RGB/macro
// utilities) grabs the same key combination after it starts up or
// updates. That specific case can't be detected or fixed from here —
// Piston's own registration is still technically valid, the keypress
// just never reaches it. But if the registration itself silently drops,
// which does happen occasionally on its own, isRegistered() will report
// that accurately — so this periodically checks and quietly
// re-registers, rather than requiring the user to notice it's broken
// and manually re-set the same combo in Settings.
let healthCheckStarted = false;
export function startShortcutHealthCheck() {
  if (healthCheckStarted) return;
  healthCheckStarted = true;
  setInterval(async () => {
    if (!currentRegistered) return;
    try {
      const stillRegistered = await isRegistered(currentRegistered);
      if (!stillRegistered) {
        await register(currentRegistered, (event) => {
          if (event.state === 'Pressed') {
            toggleOverlay();
          }
        });
      }
    } catch (err) {
      console.error('Shortcut health check failed to re-register:', err);
    }
  }, 15000);
}