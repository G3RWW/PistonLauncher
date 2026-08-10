import type { AppEntry } from './types';
import { setCurrentView, nextTileIndex, resetTileIndex, formatPlaytime, initials } from './state';
import { totalPlaytimeFor, hasActiveSession } from './sessions';
import { launchAndTrack, renameApp, editAppPath, refreshIcon, deleteApp, changeCategory } from './actions';
import { renderView } from './render';

export function closeAllMenus() {
  document.querySelectorAll('.tile-menu.open').forEach((m) => m.classList.remove('open'));
}
document.addEventListener('click', closeAllMenus);

export function buildTile(app: AppEntry): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.appId = app.id;
  tile.style.setProperty('--tile-index', String(nextTileIndex()));

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

  const viewBtn = document.createElement('button');
  viewBtn.textContent = 'View details';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setCurrentView({ type: 'app', id: app.id });
    renderView();
  });

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit name';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renameApp(app.id);
  });

  const editPathBtn = document.createElement('button');
  editPathBtn.textContent = 'Edit path';
  editPathBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    editAppPath(app.id);
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

  menu.append(viewBtn, editBtn, editPathBtn, refreshBtn, deleteBtn);
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
  title.addEventListener('click', () => {
    setCurrentView({ type: 'app', id: app.id });
    renderView();
  });

  const time = document.createElement('div');
  time.className = 'tile-time';
  time.textContent = formatPlaytime(totalPlaytimeFor(app.id));

  tile.append(menuContainer, cover, title, time);

  if (app.launchFailed) {
    tile.classList.add('tile-broken');
    const badge = document.createElement('div');
    badge.className = 'tile-broken-badge';
    badge.title = 'Last launch failed — path may be broken';
    badge.textContent = '⚠';
    tile.appendChild(badge);
  }

  if (hasActiveSession(app.id)) {
    tile.classList.add('tile-running');
    const dot = document.createElement('div');
    dot.className = 'running-dot-badge';
    dot.title = 'Currently running';
    tile.appendChild(dot);
  }

  return tile;
}

// Patch a tile's visible content in place — no removal/re-insertion,
// so it never replays its entrance animation for a change that isn't
// actually a membership/order change.
export function patchTileContent(tile: HTMLElement, app: AppEntry) {
  const titleEl = tile.querySelector<HTMLElement>('.tile-title');
  if (titleEl) titleEl.textContent = app.name;

  const timeEl = tile.querySelector<HTMLElement>('.tile-time');
  if (timeEl) timeEl.textContent = formatPlaytime(totalPlaytimeFor(app.id));

  const coverEl = tile.querySelector<HTMLElement>('.tile-cover');
  if (coverEl) {
    coverEl.innerHTML = '';
    if (app.icon) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${app.icon}`;
      img.className = 'tile-icon-img';
      coverEl.appendChild(img);
    } else {
      coverEl.textContent = initials(app.name);
    }
  }

  tile.classList.toggle('tile-broken', !!app.launchFailed);
  const existingBadge = tile.querySelector('.tile-broken-badge');
  if (app.launchFailed && !existingBadge) {
    const badge = document.createElement('div');
    badge.className = 'tile-broken-badge';
    badge.title = 'Last launch failed — path may be broken';
    badge.textContent = '⚠';
    tile.appendChild(badge);
  } else if (!app.launchFailed && existingBadge) {
    existingBadge.remove();
  }

  const isRunning = hasActiveSession(app.id);
  tile.classList.toggle('tile-running', isRunning);
  const existingDot = tile.querySelector('.running-dot-badge');
  if (isRunning && !existingDot) {
    const dot = document.createElement('div');
    dot.className = 'running-dot-badge';
    dot.title = 'Currently running';
    tile.appendChild(dot);
  } else if (!isRunning && existingDot) {
    existingDot.remove();
  }
}

// Sync a grid to a desired app list. If the set/order of apps shown is
// unchanged, patch each existing tile in place (no animation replay).
// Only rebuilds the grid when membership or order genuinely changed.
export function syncGrid(grid: HTMLDivElement, desiredApps: AppEntry[]) {
  const currentTiles = Array.from(grid.children) as HTMLElement[];
  const currentIds = currentTiles.map((t) => t.dataset.appId);
  const desiredIds = desiredApps.map((a) => a.id);

  if (JSON.stringify(currentIds) === JSON.stringify(desiredIds)) {
    desiredApps.forEach((app, i) => patchTileContent(currentTiles[i], app));
    return;
  }

  grid.innerHTML = '';
  resetTileIndex();
  for (const app of desiredApps) grid.appendChild(buildTile(app));
}

// ---- Manual mouse-based drag (bypasses WebView2's native DnD, which
// intercepts drag events at the OS level once dragDropEnabled is on) ----

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
      const targetCategory = section?.dataset.category;

      if (targetCategory && draggedApp && targetCategory !== draggedApp.category) {
        changeCategory(draggedApp.id, targetCategory);
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
