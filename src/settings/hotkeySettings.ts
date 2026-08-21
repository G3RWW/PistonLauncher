export type HotkeyId = 'quickLaunch' | 'overlay';

const DEFAULTS: Record<HotkeyId, string> = {
  quickLaunch: 'Ctrl+Space',
  overlay: 'Ctrl+Alt+Shift+O',
};

const STORAGE_KEY = 'launcher-hotkeys';

export function loadHotkeys(): Record<HotkeyId, string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveHotkeys(data: Record<HotkeyId, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getHotkey(id: HotkeyId): string {
  return loadHotkeys()[id];
}

export function setHotkey(id: HotkeyId, combo: string) {
  const data = loadHotkeys();
  data[id] = combo;
  saveHotkeys(data);
}

const MODIFIER_CODES = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'];

// Builds a combo string like "Ctrl+Alt+Shift+O" from a captured keydown
// event. Returns null while only modifier keys have been pressed so far
// (the caller should keep listening until a real key completes the combo).
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.includes(e.code)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  const keyLabel = e.code.replace(/^Key/, '').replace(/^Digit/, '');
  parts.push(keyLabel);

  if (parts.length < 2) return null; // require at least one modifier
  return parts.join('+');
}

// Checks a plain in-app keydown event against a stored combo string —
// used for shortcuts that only need to work while the window has focus
// (e.g. Quick Launch), as opposed to true OS-level global shortcuts.
export function matchesHotkey(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+').map((p) => p.trim().toLowerCase());
  const wantCtrl = parts.includes('ctrl');
  const wantAlt = parts.includes('alt');
  const wantShift = parts.includes('shift');
  const wantMeta = parts.includes('meta');
  const keyPart = parts.find((p) => !['ctrl', 'alt', 'shift', 'meta'].includes(p));
  if (!keyPart) return false;

  const eventKey = e.code.replace(/^Key/, '').replace(/^Digit/, '').toLowerCase();

  return e.ctrlKey === wantCtrl && e.altKey === wantAlt && e.shiftKey === wantShift && e.metaKey === wantMeta && eventKey === keyPart;
}

// Converts our display format ("Ctrl+Alt+Shift+O") into the accelerator
// string Tauri's global-shortcut plugin actually expects.
export function toTauriAccelerator(combo: string): string {
  return combo.replace(/\bCtrl\b/, 'CommandOrControl');
}
