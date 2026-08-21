import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { loadApps, saveApps, loadCategories, saveCategories, saveSessions, loadSessions } from '../core/storage';
import { customConfirm, customAlert } from '../core/dialogs';

async function exportData() {
  const ok = await customConfirm('Export data?', 'Save a backup of all apps, categories, and playtime history.');
  if (!ok) return;

  const path = await save({
    defaultPath: `piston-launcher-backup-${Date.now()}.json`,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  });
  if (!path) return; // user cancelled the save dialog

  const data = {
    apps: loadApps(),
    categories: loadCategories(),
    sessions: loadSessions(),
    exportedAt: new Date().toISOString(),
  };

  try {
    await writeTextFile(path, JSON.stringify(data, null, 2));
    await customAlert('Export complete', `Backup saved to:\n${path}`);
  } catch (err) {
    console.error('Export failed:', err);
    await customAlert('Export failed', 'Could not write the backup file.');
  }
}

async function importData() {
  const ok = await customConfirm(
    'Import data?',
    'This replaces all current apps, categories, and playtime history. The app will reload.',
    true
  );
  if (!ok) return;

  const path = await open({
    multiple: false,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  });
  if (!path || typeof path !== 'string') return; // user cancelled

  try {
    const raw = await readTextFile(path);
    const data = JSON.parse(raw);
    if (!Array.isArray(data.apps) || !Array.isArray(data.categories)) {
      throw new Error('Invalid backup file — missing apps/categories');
    }
    saveApps(data.apps);
    saveCategories(data.categories);
    saveSessions(Array.isArray(data.sessions) ? data.sessions : []);
    window.location.reload(); // simplest reliable way to re-init every module's state from the new data
  } catch (err) {
    console.error('Import failed:', err);
    await customAlert('Import failed', "That file doesn't look like a valid backup.");
  }
}

document.querySelector<HTMLButtonElement>('#export-data-btn')!.addEventListener('click', exportData);
document.querySelector<HTMLButtonElement>('#import-data-btn')!.addEventListener('click', importData);
