import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { loadSessions, saveSessions } from '../core/storage';

// Session-mutating actions triggered from the overlay's Spotlight and
// Note panels. Kept separate from those panels themselves since these
// touch shared session storage rather than being panel-specific UI.

const CONTEXT_KEY = 'launcher-overlay-context';

export async function focusMain() {
  const main = await WebviewWindow.getByLabel('main');
  await main?.show();
  await main?.setFocus();
}

export function saveNote(sessionId: string, note: string) {
  const fresh = loadSessions();
  const s = fresh.find((x) => x.id === sessionId);
  if (s) {
    s.note = note;
    saveSessions(fresh);
  }
}

export function togglePause(sessionId: string) {
  const fresh = loadSessions();
  const s = fresh.find((x) => x.id === sessionId);
  if (!s || s.endedAt) return;
  if (s.pausedAt) {
    s.pausedMs = (s.pausedMs || 0) + (Date.now() - s.pausedAt);
    s.pausedAt = undefined;
  } else {
    s.pausedAt = Date.now();
  }
  saveSessions(fresh);
}

export function endSessionNow(sessionId: string) {
  const fresh = loadSessions();
  const s = fresh.find((x) => x.id === sessionId);
  if (s && !s.endedAt) {
    if (s.pausedAt) {
      s.pausedMs = (s.pausedMs || 0) + (Date.now() - s.pausedAt);
      s.pausedAt = undefined;
    }
    s.endedAt = Date.now();
    saveSessions(fresh);
  }
  localStorage.removeItem(CONTEXT_KEY);
}
