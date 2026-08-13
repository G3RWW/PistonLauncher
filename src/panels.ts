import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { categories, setCurrentView } from './state';
import { saveCategories } from './storage';
import { customPrompt } from './dialogs';
import { tryGetIcon } from './icon';
import { upsertApp } from './actions';
import { renderView } from './render';

// ---- Add-apps popout panel ----

document.querySelector<HTMLButtonElement>('#open-add-panel-btn')!.addEventListener('click', () => {
  document.querySelector('#add-panel-modal')!.classList.remove('hidden');
});
document.querySelector<HTMLButtonElement>('#add-panel-close-btn')!.addEventListener('click', () => {
  document.querySelector('#add-panel-modal')!.classList.add('hidden');
});

const toggleManualBtn = document.querySelector<HTMLButtonElement>('#toggle-manual-btn')!;
const form = document.querySelector<HTMLFormElement>('#add-form')!;
toggleManualBtn.addEventListener('click', () => {
  form.classList.toggle('hidden');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = (document.querySelector('#input-name') as HTMLInputElement).value.trim();
  const path = (document.querySelector('#input-path') as HTMLInputElement).value.trim();
  const category = (document.querySelector('#input-category') as HTMLInputElement).value.trim();
  if (!name || !path || !category) return;

  const isNewCategory = !categories.includes(category);
  if (isNewCategory) {
    categories.push(category);
    saveCategories(categories);
  }

  const icon = await tryGetIcon(path);
  upsertApp({ name, path, category, icon });

  if (isNewCategory) {
    renderView(); // structural: a brand-new category section needs to exist
  }

  form.reset();
  form.classList.add('hidden');
});

// ---- Home / Stats / New category ----

document.querySelector<HTMLAnchorElement>('#home-link')!.addEventListener('click', (e) => {
  e.preventDefault();
  setCurrentView({ type: 'library' });
  renderView();
});

document.querySelector<HTMLAnchorElement>('#stats-link')!.addEventListener('click', (e) => {
  e.preventDefault();
  setCurrentView({ type: 'stats' });
  renderView();
});

document.querySelector<HTMLButtonElement>('#new-category-btn')!.addEventListener('click', async () => {
  const name = await customPrompt('New category name');
  if (name && name.trim() && !categories.includes(name.trim())) {
    categories.push(name.trim());
    saveCategories(categories);
    renderView(); // structural: new section needs to be created
  }
});

// ---- Auto-categorization for dragged files: reads the exe's own
// embedded "Company Name" metadata (same field as File Properties ->
// Details), rather than guessing from the file path. ----

async function detectVendor(path: string): Promise<string> {
  try {
    const vendor = await invoke<string | null>('get_exe_vendor', { path });
    return vendor || 'Uncategorized';
  } catch (err) {
    console.warn('Could not read vendor metadata for', path, err);
    return 'Uncategorized';
  }
}

// ---- Drag and drop (OS files) — works app-wide regardless of panel visibility ----

getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type === 'drop') {
    const filePath = event.payload.paths[0];
    if (filePath.toLowerCase().endsWith('.exe')) {
      const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'New App';
      const name = fileName.replace(/\.exe$/i, '');
      const category = await detectVendor(filePath);

      const isNewCategory = !categories.includes(category);
      if (isNewCategory) {
        categories.push(category);
        saveCategories(categories);
      }

      const icon = await tryGetIcon(filePath);
      upsertApp({ name, path: filePath, category, icon });

      if (isNewCategory) {
        renderView();
      }
    } else {
      console.warn('Not an .exe file, ignoring:', filePath);
    }
  }
});