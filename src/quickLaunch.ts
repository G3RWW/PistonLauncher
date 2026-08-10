import type { AppEntry } from './types';
import { apps } from './state';
import { launchAndTrack } from './actions';

let filtered: AppEntry[] = [];
let selectedIndex = 0;

function isOpen(): boolean {
  return !document.querySelector('#quick-launch-modal')!.classList.contains('hidden');
}

function openQuickLaunch() {
  document.querySelector('#quick-launch-modal')!.classList.remove('hidden');
  const input = document.querySelector<HTMLInputElement>('#quick-launch-input')!;
  input.value = '';
  input.focus();
  renderResults('');
}

function closeQuickLaunch() {
  document.querySelector('#quick-launch-modal')!.classList.add('hidden');
}

function renderResults(query: string) {
  filtered = apps.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  selectedIndex = 0;

  const container = document.querySelector<HTMLDivElement>('#quick-launch-results')!;
  container.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quick-launch-empty';
    empty.textContent = 'No matching apps';
    container.appendChild(empty);
    return;
  }

  filtered.forEach((app, i) => {
    const row = document.createElement('div');
    row.className = 'quick-launch-row' + (i === selectedIndex ? ' selected' : '');
    row.textContent = app.name;
    row.addEventListener('click', () => {
      launchAndTrack(app);
      closeQuickLaunch();
    });
    container.appendChild(row);
  });
}

function updateSelectionHighlight() {
  const rows = document.querySelectorAll<HTMLElement>('.quick-launch-row');
  rows.forEach((r, i) => r.classList.toggle('selected', i === selectedIndex));
  rows[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    isOpen() ? closeQuickLaunch() : openQuickLaunch();
  }
});

document.querySelector<HTMLInputElement>('#quick-launch-input')!.addEventListener('input', (e) => {
  renderResults((e.target as HTMLInputElement).value);
});

document.querySelector<HTMLInputElement>('#quick-launch-input')!.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeQuickLaunch();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
    updateSelectionHighlight();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelectionHighlight();
  }
  if (e.key === 'Enter') {
    const app = filtered[selectedIndex];
    if (app) {
      launchAndTrack(app);
      closeQuickLaunch();
    }
  }
});

// Click outside the search box (on the backdrop) closes it.
document.querySelector<HTMLDivElement>('#quick-launch-modal')!.addEventListener('click', (e) => {
  if (e.target === document.querySelector('#quick-launch-modal')) closeQuickLaunch();
});