import './styles.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';

type AppEntry = {
  id: string;
  name: string;
  path: string;
  category: string;
  lastPlayed?: number;
  icon?: string; // base64 image data
};

const APPS_KEY = 'launcher-apps';
const CATEGORIES_KEY = 'launcher-categories';
const PLAYTIME_KEY = 'launcher-playtime';

function loadApps(): AppEntry[] {
  const raw = localStorage.getItem(APPS_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveApps(data: AppEntry[]) {
  localStorage.setItem(APPS_KEY, JSON.stringify(data));
}

function loadCategories(): string[] {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  return raw ? JSON.parse(raw) : ['Uncategorized'];
}
function saveCategories(data: string[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(data));
}

function loadPlaytime(): Record<string, number> {
  const raw = localStorage.getItem(PLAYTIME_KEY);
  return raw ? JSON.parse(raw) : {};
}
function savePlaytime(data: Record<string, number>) {
  localStorage.setItem(PLAYTIME_KEY, JSON.stringify(data));
}

let apps: AppEntry[] = loadApps();
let categories: string[] = loadCategories();
let playtime: Record<string, number> = loadPlaytime();
const collapsed = new Set<string>();

function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

async function tryGetIcon(path: string): Promise<string | undefined> {
  try {
    const icon = await invoke<string>('get_app_icon', { path });
    return icon || undefined;
  } catch (err) {
    console.warn('Could not extract icon for', path, err);
    return undefined;
  }
}

// --- Add or update an app by path (dedupe) ---
function upsertApp(entry: { name: string; path: string; category: string; icon?: string }) {
  const existing = apps.find((a) => a.path === entry.path);
  if (existing) {
    existing.name = entry.name;
    if (entry.icon) existing.icon = entry.icon;
    // keep existing category — re-adding shouldn't move it
    saveApps(apps);
    render();
    return existing;
  }
  const newApp: AppEntry = { id: crypto.randomUUID(), ...entry };
  apps.push(newApp);
  saveApps(apps);
  render();
  return newApp;
}

function deleteApp(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  if (!confirm(`Remove "${app.name}" from launcher?`)) return;
  apps = apps.filter((a) => a.id !== id);
  delete playtime[id];
  saveApps(apps);
  savePlaytime(playtime);
  render();
}

function renameApp(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const newName = prompt('New name:', app.name);
  if (newName && newName.trim()) {
    app.name = newName.trim();
    saveApps(apps);
    render();
  }
}

async function refreshIcon(id: string) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  const icon = await tryGetIcon(app.path);
  if (icon) {
    app.icon = icon;
    saveApps(apps);
    render();
  }
}

function closeAllMenus() {
  document.querySelectorAll('.tile-menu.open').forEach((m) => m.classList.remove('open'));
}
document.addEventListener('click', closeAllMenus);

// --- Manual form toggle ---
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

  if (!categories.includes(category)) {
    categories.push(category);
    saveCategories(categories);
  }

  const icon = await tryGetIcon(path);
  upsertApp({ name, path, category, icon });

  form.reset();
  form.classList.add('hidden');
});

// --- New category button ---
document.querySelector<HTMLButtonElement>('#new-category-btn')!.addEventListener('click', () => {
  const name = prompt('New category name:');
  if (name && name.trim() && !categories.includes(name.trim())) {
    categories.push(name.trim());
    saveCategories(categories);
    render();
  }
});

// --- Drag and drop (OS files) ---
getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type === 'drop') {
    const filePath = event.payload.paths[0];
    if (filePath.toLowerCase().endsWith('.exe')) {
      const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'New App';
      const name = fileName.replace(/\.exe$/i, '');
      const icon = await tryGetIcon(filePath);
      upsertApp({ name, path: filePath, category: 'Uncategorized', icon });
    } else {
      console.warn('Not an .exe file, ignoring:', filePath);
    }
  }
});

type ScannedApp = { name: string; path: string };
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

  for (const scanned of list) {
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

  for (const path of selectedScanPaths) {
    const scanned = scannedApps.find((a) => a.path === path);
    if (!scanned) continue;
    const icon = await tryGetIcon(scanned.path);
    upsertApp({ name: scanned.name, path: scanned.path, category: 'Uncategorized', icon });
  }

  btn.disabled = false;
  btn.textContent = 'Add Selected';
  document.querySelector('#scan-modal')!.classList.add('hidden');
});

// --- Launch + track ---
async function launchAndTrack(app: AppEntry) {
  try {
    const pid = await invoke<number>('launch_app', { path: app.path });
    const startedAt = Date.now();

    app.lastPlayed = Date.now();
    saveApps(apps);
    render();

    const interval = setInterval(async () => {
      const running = await invoke<boolean>('is_running', { pid });
      if (!running) {
        clearInterval(interval);
        const durationSec = Math.round((Date.now() - startedAt) / 1000);
        playtime[app.id] = (playtime[app.id] || 0) + durationSec;
        savePlaytime(playtime);
        render();
      }
    }, 1500);
  } catch (err) {
    console.error(`Launch failed for ${app.name}:`, err);
  }
}

// --- Change category (used by tile drag-and-drop) ---
function changeCategory(id: string, newCategory: string) {
  const app = apps.find((a) => a.id === id);
  if (app) {
    app.category = newCategory;
    saveApps(apps);
    render();
  }
}

// --- Manual mouse-based drag (bypasses WebView2 native DnD conflict) ---
let dragGhost: HTMLElement | null = null;
let draggedApp: AppEntry | null = null;

function startDrag(e: MouseEvent, app: AppEntry, tile: HTMLElement) {
  const startX = e.clientX;
  const startY = e.clientY;
  let isDragging = false;

  function onMouseMove(moveEvent: MouseEvent) {
    if (!isDragging) {
      if (Math.abs(moveEvent.clientX - startX) < 5 && Math.abs(moveEvent.clientY - startY) < 5) return;
      isDragging = true;
      draggedApp = app;
      tile.classList.add('dragging');
      document.body.classList.add('is-dragging');

      dragGhost = tile.cloneNode(true) as HTMLElement;
      dragGhost.classList.add('drag-ghost');
      document.body.appendChild(dragGhost);
    }

    if (dragGhost) {
      dragGhost.style.left = `${moveEvent.clientX + 12}px`;
      dragGhost.style.top = `${moveEvent.clientY + 12}px`;
    }

    document.querySelectorAll('.category-section').forEach((el) => el.classList.remove('drag-over'));
    const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
    const section = under?.closest('.category-section');
    if (section) section.classList.add('drag-over');
  }

  function onMouseUp(upEvent: MouseEvent) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (isDragging) {
      const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const section = under?.closest('.category-section') as HTMLElement | null;
      if (section && draggedApp) {
        const category = section.id.replace('cat-', '');
        changeCategory(draggedApp.id, category);
      }
    }

    tile.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('.category-section').forEach((el) => el.classList.remove('drag-over'));
    dragGhost?.remove();
    dragGhost = null;
    draggedApp = null;
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function buildTile(app: AppEntry): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = 'tile';

  tile.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.tile-menu-container')) return;
    startDrag(e, app, tile);
  });

  // --- "..." menu ---
  const menuContainer = document.createElement('div');
  menuContainer.className = 'tile-menu-container';

  const menuBtn = document.createElement('button');
  menuBtn.className = 'tile-menu-btn';
  menuBtn.textContent = '⋮';
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) menu.classList.add('open');
  });

  const menu = document.createElement('div');
  menu.className = 'tile-menu';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit name';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renameApp(app.id);
  });

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh icon';
  refreshBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await refreshIcon(app.id);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'tile-menu-delete';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteApp(app.id);
  });

  menu.append(editBtn, refreshBtn, deleteBtn);
  menuContainer.append(menuBtn, menu);

  // --- Cover / icon ---
  const cover = document.createElement('div');
  cover.className = 'tile-cover';
  if (app.icon) {
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${app.icon}`;
    img.className = 'tile-icon-img';
    cover.appendChild(img);
  } else {
    cover.textContent = initials(app.name);
  }
  cover.addEventListener('click', () => launchAndTrack(app));

  const title = document.createElement('div');
  title.className = 'tile-title';
  title.textContent = app.name;

  const time = document.createElement('div');
  time.className = 'tile-time';
  time.textContent = formatPlaytime(playtime[app.id] || 0);

  tile.append(menuContainer, cover, title, time);
  return tile;
}

function render() {
  // Sidebar nav
  const nav = document.querySelector<HTMLElement>('#category-nav')!;
  nav.innerHTML = '';
  for (const category of categories) {
    const link = document.createElement('a');
    link.href = `#cat-${category}`;
    link.textContent = `${category} (${apps.filter((a) => a.category === category).length})`;
    nav.appendChild(link);
  }

  // Recently played
  const recentGrid = document.querySelector<HTMLDivElement>('#recent-grid')!;
  recentGrid.innerHTML = '';
  const recent = [...apps]
    .filter((a) => a.lastPlayed)
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
    .slice(0, 5);
  const recentSection = document.querySelector<HTMLElement>('#recent-section')!;
  recentSection.style.display = recent.length ? 'block' : 'none';
  for (const app of recent) recentGrid.appendChild(buildTile(app));

  // Library by category
  const library = document.querySelector<HTMLDivElement>('#library')!;
  library.innerHTML = '';

  for (const category of categories) {
    const section = document.createElement('div');
    section.className = 'category-section';
    section.id = `cat-${category}`;

    const heading = document.createElement('h2');
    heading.textContent = category;
    heading.addEventListener('click', () => {
      collapsed.has(category) ? collapsed.delete(category) : collapsed.add(category);
      render();
    });
    section.appendChild(heading);

    if (!collapsed.has(category)) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const app of apps.filter((a) => a.category === category)) {
        grid.appendChild(buildTile(app));
      }
      section.appendChild(grid);
    }

    library.appendChild(section);
  }
}

render();