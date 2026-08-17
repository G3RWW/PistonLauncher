import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { customPrompt, customConfirm } from './dialogs';
import {
  type CustomTheme,
  type ActiveThemeRef,
  loadCustomThemes,
  saveCustomThemes,
  loadActiveRef,
  saveActiveRef,
  applyActiveTheme,
} from './themeApply';

let customThemes: CustomTheme[] = loadCustomThemes();
let activeRef: ActiveThemeRef = loadActiveRef();

function refreshTheme() {
  saveActiveRef(activeRef);
  const name = applyActiveTheme();
  const label = document.querySelector<HTMLElement>('#active-theme-label');
  if (label && name) label.textContent = name;
  renderThemeModalLists();
}

function selectBuiltin(name: string) {
  activeRef = { kind: 'builtin', name };
  refreshTheme();
}

function selectCustom(id: string) {
  activeRef = { kind: 'custom', id };
  refreshTheme();
}

async function addCustomThemeFromFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'CSS Theme', extensions: ['css'] }],
    });
    if (!selected || typeof selected !== 'string') return; // user cancelled

    const css = await readTextFile(selected);
    const fileBase = (selected.split('\\').pop()?.split('/').pop() || 'Custom Theme').replace(/\.css$/i, '');
    const name = (await customPrompt('Name this theme', fileBase))?.trim() || fileBase;

    const theme: CustomTheme = { id: crypto.randomUUID(), name, css };
    customThemes.push(theme);
    saveCustomThemes(customThemes);

    activeRef = { kind: 'custom', id: theme.id };
    refreshTheme();
  } catch (err) {
    console.error('Failed to load theme file:', err);
  }
}

async function deleteCustomTheme(id: string) {
  const theme = customThemes.find((t) => t.id === id);
  if (!theme) return;
  const ok = await customConfirm('Delete theme?', `Remove "${theme.name}" from your custom themes?`, true);
  if (!ok) return;

  customThemes = customThemes.filter((t) => t.id !== id);
  saveCustomThemes(customThemes);

  if (activeRef.kind === 'custom' && activeRef.id === id) {
    activeRef = { kind: 'builtin', name: 'Blueprint' };
  }
  refreshTheme();
}

function renderThemeModalLists() {
  document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach((btn) => {
    const isActive = activeRef.kind === 'builtin' && activeRef.name === btn.dataset.themeName;
    btn.classList.toggle('active', isActive);
  });

  const container = document.querySelector<HTMLDivElement>('#custom-theme-list')!;
  container.innerHTML = '';

  if (customThemes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'custom-theme-empty';
    empty.textContent = 'No custom themes yet.';
    container.appendChild(empty);
    return;
  }

  for (const theme of customThemes) {
    const row = document.createElement('div');
    row.className = 'custom-theme-row';
    if (activeRef.kind === 'custom' && activeRef.id === theme.id) row.classList.add('active');

    const nameEl = document.createElement('span');
    nameEl.className = 'custom-theme-name';
    nameEl.textContent = theme.name;
    nameEl.addEventListener('click', () => selectCustom(theme.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'custom-theme-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete theme';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomTheme(theme.id);
    });

    row.append(nameEl, deleteBtn);
    container.appendChild(row);
  }
}

// Apply the saved theme (or default to Blueprint) on startup.
refreshTheme();

// ---- Theme modal wiring ----

document.querySelector<HTMLButtonElement>('#theme-btn')!.addEventListener('click', () => {
  renderThemeModalLists();
  document.querySelector('#theme-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#theme-close-btn')!.addEventListener('click', () => {
  document.querySelector('#theme-modal')!.classList.add('hidden');
});

document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectBuiltin(btn.dataset.themeName!);
  });
});

document.querySelector<HTMLButtonElement>('#load-theme-file-btn')!.addEventListener('click', addCustomThemeFromFile);