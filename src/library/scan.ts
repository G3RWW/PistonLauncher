import { invoke } from '@tauri-apps/api/core';
import type { ScannedApp } from '../core/types';
import { apps, categories } from '../core/state';
import { saveCategories } from '../core/storage';
import { tryGetIcon } from '../core/icon';
import { upsertApp } from '../core/actions';
import { renderView } from './render';

let scannedApps: ScannedApp[] = [];
const selectedScanPaths = new Set<string>();

document.querySelector<HTMLButtonElement>('#scan-btn')!.addEventListener('click', async () => {
  const btn = document.querySelector<HTMLButtonElement>('#scan-btn')!;
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  try {
    scannedApps = await invoke<ScannedApp[]>('scan_start_menu');
    selectedScanPaths.clear();
    renderScanModal(scannedApps);
    document.querySelector('#scan-modal')!.classList.remove('hidden');
  } catch (err) {
    console.error('Scan failed:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan Installed Apps';
  }
});

function renderScanModal(list: ScannedApp[]) {
  const container = document.querySelector<HTMLDivElement>('#scan-list')!;
  container.innerHTML = '';
  const existingPaths = new Set(apps.map((a) => a.path));

  const groups = new Map<string, ScannedApp[]>();
  for (const scanned of list) {
    const key = scanned.category || 'Uncategorized';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(scanned);
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

  if (sortedKeys.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'scan-empty';
    empty.textContent = 'No matches.';
    container.appendChild(empty);
    return;
  }

  for (const key of sortedKeys) {
    const groupApps = groups.get(key)!;

    const heading = document.createElement('div');
    heading.className = 'scan-group-heading';
    heading.textContent = `${key} (${groupApps.length})`;
    container.appendChild(heading);

    for (const scanned of groupApps) {
      const row = document.createElement('label');
      row.className = 'scan-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedScanPaths.has(scanned.path);
      checkbox.disabled = existingPaths.has(scanned.path);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedScanPaths.add(scanned.path);
        else selectedScanPaths.delete(scanned.path);
      });

      const label = document.createElement('span');
      label.textContent = existingPaths.has(scanned.path) ? `${scanned.name} (already added)` : scanned.name;

      row.append(checkbox, label);
      container.appendChild(row);
    }
  }
}

document.querySelector<HTMLInputElement>('#scan-filter')!.addEventListener('input', (e) => {
  const query = (e.target as HTMLInputElement).value.toLowerCase();
  renderScanModal(scannedApps.filter((a) => a.name.toLowerCase().includes(query)));
});

document.querySelector<HTMLButtonElement>('#scan-cancel-btn')!.addEventListener('click', () => {
  document.querySelector('#scan-modal')!.classList.add('hidden');
});

document.querySelector<HTMLButtonElement>('#scan-add-btn')!.addEventListener('click', async () => {
  const btn = document.querySelector<HTMLButtonElement>('#scan-add-btn')!;
  btn.disabled = true;
  btn.textContent = 'Adding...';

  let addedNewCategory = false;

  for (const path of selectedScanPaths) {
    const scanned = scannedApps.find((a) => a.path === path);
    if (!scanned) continue;

    if (!categories.includes(scanned.category)) {
      categories.push(scanned.category);
      saveCategories(categories);
      addedNewCategory = true;
    }

    const icon = await tryGetIcon(scanned.path);
    upsertApp({ name: scanned.name, path: scanned.path, category: scanned.category, icon });
  }

  if (addedNewCategory) {
    renderView();
  }

  btn.disabled = false;
  btn.textContent = 'Add Selected';
  document.querySelector('#scan-modal')!.classList.add('hidden');
});