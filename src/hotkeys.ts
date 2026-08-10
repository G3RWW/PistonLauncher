const shortcuts: { keys: string; description: string }[] = [
  { keys: 'Ctrl + Space', description: 'Open quick launch — search and launch any app from anywhere' },
  { keys: 'Esc', description: 'Close quick launch, a dialog, or an open menu' },
  { keys: '↑ / ↓', description: 'Move the selection in quick launch results' },
  { keys: 'Enter', description: 'Launch the selected quick-launch result, or confirm a dialog' },
];

function renderHotkeysList() {
  const container = document.querySelector<HTMLDivElement>('#hotkeys-list')!;
  container.innerHTML = '';
  for (const { keys, description } of shortcuts) {
    const row = document.createElement('div');
    row.className = 'hotkey-row';

    const keysEl = document.createElement('div');
    keysEl.className = 'hotkey-keys';
    keysEl.textContent = keys;

    const descEl = document.createElement('div');
    descEl.className = 'hotkey-description';
    descEl.textContent = description;

    row.append(keysEl, descEl);
    container.appendChild(row);
  }
}

document.querySelector<HTMLButtonElement>('#hotkeys-btn')!.addEventListener('click', () => {
  renderHotkeysList();
  document.querySelector('#hotkeys-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#hotkeys-close-btn')!.addEventListener('click', () => {
  document.querySelector('#hotkeys-modal')!.classList.add('hidden');
});
