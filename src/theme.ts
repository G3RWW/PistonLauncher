import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { customPrompt, customConfirm } from './dialogs';

import blueprintCss from './themes/blueprint.css?raw';
import steamCss from './themes/steam.css?raw';
import midnightCss from './themes/midnight.css?raw';

type CustomTheme = { id: string; name: string; css: string };
type ActiveThemeRef = { kind: 'builtin'; name: string } | { kind: 'custom'; id: string };

const ACTIVE_THEME_REF_KEY = 'launcher-active-theme-ref';
const CUSTOM_THEMES_KEY = 'launcher-custom-themes';

const BUILTIN_THEMES: Record<string, string> = {
  Blueprint: blueprintCss,
  Steam: steamCss,
  Midnight: midnightCss,
};

function loadCustomThemes(): CustomTheme[] {
  const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveCustomThemes(list: CustomTheme[]) {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(list));
}

let customThemes: CustomTheme[] = loadCustomThemes();

function loadActiveRef(): ActiveThemeRef {
  const raw = localStorage.getItem(ACTIVE_THEME_REF_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through to default */
    }
  }
  return { kind: 'builtin', name: 'Blueprint' };
}
function saveActiveRef(ref: ActiveThemeRef) {
  localStorage.setItem(ACTIVE_THEME_REF_KEY, JSON.stringify(ref));
}

let activeRef: ActiveThemeRef = loadActiveRef();

function getThemeStyleTag(): HTMLStyleElement {
  let tag = document.querySelector<HTMLStyleElement>('#active-theme-css');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'active-theme-css';
    document.head.appendChild(tag); // appended last -> wins ties with the base stylesheet
  }
  return tag;
}

function resolveTheme(ref: ActiveThemeRef): { css: string; name: string } | null {
  if (ref.kind === 'builtin') {
    const css = BUILTIN_THEMES[ref.name];
    return css ? { css, name: ref.name } : null;
  }
  const custom = customThemes.find((t) => t.id === ref.id);
  return custom ? { css: custom.css, name: custom.name } : null;
}

function applyActiveTheme() {
  let resolved = resolveTheme(activeRef);
  if (!resolved) {
    // Referenced theme no longer exists (e.g. it was deleted) — fall back safely.
    activeRef = { kind: 'builtin', name: 'Blueprint' };
    resolved = resolveTheme(activeRef)!;
  }

  getThemeStyleTag().textContent = resolved.css;
  saveActiveRef(activeRef);

  const label = document.querySelector<HTMLElement>('#active-theme-label');
  if (label) label.textContent = resolved.name;

  renderThemeModalLists();
}

function selectBuiltin(name: string) {
  activeRef = { kind: 'builtin', name };
  applyActiveTheme();
}

function selectCustom(id: string) {
  activeRef = { kind: 'custom', id };
  applyActiveTheme();
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
    applyActiveTheme();
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
  applyActiveTheme();
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
applyActiveTheme();

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