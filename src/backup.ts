import { loadApps, saveApps, loadCategories, saveCategories, saveSessions, loadSessions } from './storage';
import { customConfirm, customAlert } from './dialogs';

function exportData() {
  const data = {
    apps: loadApps(),
    categories: loadCategories(),
    sessions: loadSessions(),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `piston-launcher-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importDataFromFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!Array.isArray(data.apps) || !Array.isArray(data.categories)) {
          throw new Error('Invalid backup file — missing apps/categories');
        }
        saveApps(data.apps);
        saveCategories(data.categories);
        saveSessions(Array.isArray(data.sessions) ? data.sessions : []);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

document.querySelector<HTMLButtonElement>('#export-data-btn')!.addEventListener('click', () => {
  exportData();
});

const importInput = document.querySelector<HTMLInputElement>('#import-file-input')!;
document.querySelector<HTMLButtonElement>('#import-data-btn')!.addEventListener('click', () => {
  importInput.click();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  const ok = await customConfirm(
    'Import data?',
    'This replaces all current apps, categories, and playtime history. The app will reload.',
    true
  );
  if (!ok) {
    importInput.value = '';
    return;
  }

  try {
    await importDataFromFile(file);
    window.location.reload(); // simplest reliable way to re-init every module's state from the new data
  } catch (err) {
    console.error('Import failed:', err);
    await customAlert('Import failed', "That file doesn't look like a valid backup.");
  }
  importInput.value = '';
});