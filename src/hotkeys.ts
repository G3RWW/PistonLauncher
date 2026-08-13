import { loadHotkeys, setHotkey, comboFromEvent, type HotkeyId } from './hotkeySettings';
import { updateOverlayShortcut } from './overlayShortcut';
import { customAlert } from './dialogs';

type Entry = { id: HotkeyId | null; keys: string; description: string };

function buildEntries(): Entry[] {
  const current = loadHotkeys();
  return [
    { id: 'quickLaunch', keys: current.quickLaunch, description: 'Open quick launch — search and launch any app from anywhere' },
    {
      id: 'overlay',
      keys: current.overlay,
      description: "Toggle the floating overlay showing what's currently running (only over a tracked, running app)",
    },
    { id: null, keys: 'Esc', description: 'Close quick launch, a dialog, or an open menu' },
    { id: null, keys: '↑ / ↓', description: 'Move the selection in quick launch results' },
    { id: null, keys: 'Enter', description: 'Launch the selected quick-launch result, or confirm a dialog' },
  ];
}

function renderHotkeysList() {
  const container = document.querySelector<HTMLDivElement>('#hotkeys-list')!;
  container.innerHTML = '';

  for (const entry of buildEntries()) {
    const row = document.createElement('div');
    row.className = 'hotkey-row';

    const keysEl = document.createElement('div');
    keysEl.className = 'hotkey-keys';
    keysEl.textContent = entry.keys;

    const descEl = document.createElement('div');
    descEl.className = 'hotkey-description';
    descEl.textContent = entry.description;

    row.append(keysEl, descEl);

    if (entry.id) {
      const editBtn = document.createElement('button');
      editBtn.className = 'hotkey-edit-btn';
      editBtn.textContent = 'Change';
      editBtn.addEventListener('click', () => startCapture(entry.id as HotkeyId, keysEl, editBtn));
      row.appendChild(editBtn);
    }

    container.appendChild(row);
  }
}

function startCapture(id: HotkeyId, keysEl: HTMLElement, btn: HTMLButtonElement) {
  const originalText = keysEl.textContent;
  keysEl.textContent = 'Press keys...';
  btn.disabled = true;

  function handler(e: KeyboardEvent) {
    e.preventDefault();
    const combo = comboFromEvent(e);
    if (!combo) return; // only modifier keys pressed so far — keep listening

    document.removeEventListener('keydown', handler, true);
    void finishCapture(id, combo, keysEl, btn, originalText);
  }

  document.addEventListener('keydown', handler, true);
}

async function finishCapture(id: HotkeyId, combo: string, keysEl: HTMLElement, btn: HTMLButtonElement, originalText: string | null) {
  if (id === 'overlay') {
    try {
      await updateOverlayShortcut(combo);
    } catch (err) {
      console.error('Failed to apply new overlay shortcut:', err);
      keysEl.textContent = originalText;
      btn.disabled = false;
      await customAlert('Could not set shortcut', 'That combination may already be in use by another app.');
      return;
    }
  }

  setHotkey(id, combo);
  keysEl.textContent = combo;
  btn.disabled = false;
}

document.querySelector<HTMLButtonElement>('#hotkeys-btn')!.addEventListener('click', () => {
  renderHotkeysList();
  document.querySelector('#hotkeys-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#hotkeys-close-btn')!.addEventListener('click', () => {
  document.querySelector('#hotkeys-modal')!.classList.add('hidden');
});