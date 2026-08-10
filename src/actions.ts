import { invoke } from '@tauri-apps/api/core';
import type { AppEntry } from './types';
import { apps, setApps, categories, setCategories, currentView, setCurrentView } from './state';
import { saveApps, saveCategories } from './storage';
import { customPrompt, customConfirm, customAlert } from './dialogs';
import { tryGetIcon } from './icon';
import { hasActiveSession, startSession, endSession, removeSessionsForApp } from './sessions';
import { refreshCategorySection, refreshSidebarGroup, refreshRecentSection, refreshAppEverywhere, renderView } from './render';

export function upsertApp(entry: { name: string; path: string; category: string; icon?: string }) {
  const existing = apps.find((a) => a.path === entry.path);
  if (existing) {
    const previousCategory = existing.category;
    existing.name = entry.name;
    if (entry.icon) existing.icon = entry.icon;
    existing.category = entry.category;
    saveApps(apps);
    refreshAppEverywhere(existing, previousCategory);
    return existing;
  }
  const newApp: AppEntry = { id: crypto.randomUUID(), ...entry };
  apps.push(newApp);
  saveApps(apps);
  refreshAppEverywhere(newApp);
  return newApp;
}

export async function deleteApp(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const ok = await customConfirm('Delete app?', `Remove "${app.name}" from launcher?`, true);
  if (!ok) return;

  const category = app.category;
  setApps(apps.filter((a) => a.id !== id));
  removeSessionsForApp(id);
  saveApps(apps);

  if (currentView.type === 'app' && currentView.id === id) {
    setCurrentView({ type: 'library' });
    renderView(); // structural: switching away from a page that no longer exists
  } else {
    refreshCategorySection(category);
    refreshSidebarGroup(category);
    refreshRecentSection();
  }
}

export async function renameApp(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const newName = await customPrompt('Rename app', app.name);
  if (newName && newName.trim()) {
    app.name = newName.trim();
    saveApps(apps);
    refreshAppEverywhere(app);
  }
}

export async function editAppPath(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const newPath = await customPrompt('Update path to .exe', app.path);
  if (newPath && newPath.trim()) {
    app.path = newPath.trim();
    app.launchFailed = false;
    saveApps(apps);
    refreshAppEverywhere(app);
  }
}

export async function refreshIcon(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const icon = await tryGetIcon(app.path);
  if (icon) {
    app.icon = icon;
    saveApps(apps);
    refreshAppEverywhere(app);
  }
}

export function changeCategory(id: string, newCategory: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const previousCategory = app.category;
  app.category = newCategory;
  saveApps(apps);
  refreshAppEverywhere(app, previousCategory);
}

export async function renameCategory(oldName: string) {
  const newName = await customPrompt('Rename category', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmed = newName.trim();
  if (categories.includes(trimmed)) {
    await customAlert('Category exists', `"${trimmed}" already exists.`);
    return;
  }
  setCategories(categories.map((c) => (c === oldName ? trimmed : c)));
  apps.forEach((a) => {
    if (a.category === oldName) a.category = trimmed;
  });
  saveCategories(categories);
  saveApps(apps);
  renderView(); // structural: category set itself changed
}

export async function deleteCategory(name: string) {
  const count = apps.filter((a) => a.category === name).length;
  const message = count > 0 ? `${count} app(s) will move to "Uncategorized".` : undefined;
  const ok = await customConfirm('Delete category?', message, true);
  if (!ok) return;
  setCategories(categories.filter((c) => c !== name));
  apps.forEach((a) => {
    if (a.category === name) a.category = 'Uncategorized';
  });
  saveCategories(categories);
  saveApps(apps);
  renderView(); // structural: category set itself changed
}

export async function launchAndTrack(app: AppEntry) {
  // Duplicate-launch guard: an "active session" (no endedAt yet) means
  // our poller believes this app is still running.
  if (hasActiveSession(app.id)) {
    await customAlert('Already running', `${app.name} looks like it's already open.`);
    return;
  }

  try {
    const pid = await invoke<number>('launch_app', { path: app.path });
    const session = startSession(app.id);

    app.lastPlayed = Date.now();
    app.launchFailed = false;
    saveApps(apps);
    refreshAppEverywhere(app);

    const interval = setInterval(async () => {
      const running = await invoke<boolean>('is_running', { pid });
      if (!running) {
        clearInterval(interval);
        endSession(session.id);
        refreshAppEverywhere(app);
      }
    }, 1500);
  } catch (err) {
    console.error(`Launch failed for ${app.name}:`, err);
    app.launchFailed = true;
    saveApps(apps);
    refreshAppEverywhere(app);
    await customAlert(
      'Launch failed',
      `Couldn't start "${app.name}". The file may have been moved or uninstalled — use "Edit path" to fix it.`
    );
  }
}