import type { AppEntry } from './types';
import {
  apps,
  categories,
  libraryCollapsed,
  sidebarCollapsed,
  currentView,
  setCurrentView,
  resetTileIndex,
  formatPlaytime,
  initials,
} from './state';
import { totalPlaytimeFor, totalPlaytimeAll } from './sessions';
import { buildTile, syncGrid } from './tiles';
import { renameCategory, deleteCategory, launchAndTrack, editAppPath } from './actions';

// ============================================================
// Targeted (partial) DOM updates — only the thing that changed re-renders
// ============================================================

export function refreshCategorySection(category: string) {
  const section = document.querySelector<HTMLDivElement>(
    `.category-section[data-category="${CSS.escape(category)}"]`
  );
  if (!section) return; // doesn't exist yet (structural change) — caller should full-render instead
  if (libraryCollapsed.has(category)) return; // collapsed — nothing visible to update

  const catApps = apps.filter((a) => a.category === category);
  let grid = section.querySelector<HTMLDivElement>('.grid');
  if (!grid) {
    if (catApps.length === 0) return;
    grid = document.createElement('div');
    grid.className = 'grid';
    section.appendChild(grid);
  }
  syncGrid(grid, catApps);
}

export function refreshRecentSection() {
  const recentGrid = document.querySelector<HTMLDivElement>('#recent-grid')!;
  const recent = [...apps]
    .filter((a) => a.lastPlayed)
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
    .slice(0, 5);
  const recentSection = document.querySelector<HTMLElement>('#recent-section')!;
  recentSection.style.display = recent.length ? 'block' : 'none';
  syncGrid(recentGrid, recent);
}

export function refreshSidebarGroup(category: string) {
  const header = Array.from(document.querySelectorAll<HTMLElement>('.sidebar-group-header')).find(
    (h) => h.dataset.category === category
  );
  if (!header) return;
  const group = header.parentElement!;
  const catApps = apps.filter((a) => a.category === category);

  const countEl = header.querySelector('.sidebar-count');
  if (countEl) countEl.textContent = `(${catApps.length})`;

  let list = group.querySelector<HTMLDivElement>('.sidebar-app-list');
  if (sidebarCollapsed.has(category)) {
    list?.remove();
    return;
  }
  if (!list) {
    list = document.createElement('div');
    list.className = 'sidebar-app-list';
    group.appendChild(list);
  }
  list.innerHTML = '';
  for (const app of catApps) {
    const link = document.createElement('a');
    link.className = 'sidebar-app-link';
    if (currentView.type === 'app' && currentView.id === app.id) link.classList.add('active');
    link.textContent = app.name;
    link.addEventListener('click', () => {
      setCurrentView({ type: 'app', id: app.id });
      renderView();
    });
    list.appendChild(link);
  }
}

// Common "an app changed" refresh: updates just the affected category
// section(s), the recent shelf, the sidebar group(s), and the detail
// page if that app happens to be open — nothing else re-renders.
export function refreshAppEverywhere(app: AppEntry, previousCategory?: string) {
  if (previousCategory && previousCategory !== app.category) {
    refreshCategorySection(previousCategory);
    refreshSidebarGroup(previousCategory);
  }
  refreshCategorySection(app.category);
  refreshSidebarGroup(app.category);
  refreshRecentSection();
  if (currentView.type === 'app' && currentView.id === app.id) {
    renderAppDetail(app.id);
  }
}

// ============================================================
// Sidebar — Steam-style nested app list per category
// ============================================================

export function renderSidebarNav() {
  const nav = document.querySelector<HTMLElement>('#category-nav')!;
  nav.innerHTML = '';

  for (const category of categories) {
    const catApps = apps.filter((a) => a.category === category);

    const group = document.createElement('div');
    group.className = 'sidebar-group';

    const header = document.createElement('div');
    header.className = 'sidebar-group-header';
    header.dataset.category = category;

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = sidebarCollapsed.has(category) ? '▸' : '▾';

    const label = document.createElement('span');
    label.textContent = ` ${category} `;

    const count = document.createElement('span');
    count.className = 'sidebar-count';
    count.textContent = `(${catApps.length})`;

    header.append(chevron, label, count);
    header.addEventListener('click', () => {
      sidebarCollapsed.has(category) ? sidebarCollapsed.delete(category) : sidebarCollapsed.add(category);
      renderSidebarNav(); // sidebar-only rebuild — never touches the main library
    });
    group.appendChild(header);

    if (!sidebarCollapsed.has(category)) {
      const list = document.createElement('div');
      list.className = 'sidebar-app-list';
      for (const app of catApps) {
        const link = document.createElement('a');
        link.className = 'sidebar-app-link';
        if (currentView.type === 'app' && currentView.id === app.id) link.classList.add('active');
        link.textContent = app.name;
        link.addEventListener('click', () => {
          setCurrentView({ type: 'app', id: app.id });
          renderView();
        });
        list.appendChild(link);
      }
      group.appendChild(list);
    }

    nav.appendChild(group);
  }
}

// ============================================================
// Library view (recent + categories)
// ============================================================

export function renderLibrary() {
  resetTileIndex();

  const recentGrid = document.querySelector<HTMLDivElement>('#recent-grid')!;
  recentGrid.innerHTML = '';
  const recent = [...apps]
    .filter((a) => a.lastPlayed)
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
    .slice(0, 5);
  const recentSection = document.querySelector<HTMLElement>('#recent-section')!;
  recentSection.style.display = recent.length ? 'block' : 'none';
  for (const app of recent) recentGrid.appendChild(buildTile(app));

  const library = document.querySelector<HTMLDivElement>('#library')!;
  library.innerHTML = '';

  for (const category of categories) {
    const section = document.createElement('div');
    section.className = 'category-section';
    section.id = `cat-${category}`;
    section.dataset.category = category;

    const heading = document.createElement('h2');

    const headingLabel = document.createElement('span');
    headingLabel.className = 'heading-label';
    headingLabel.innerHTML = `<span class="chevron">${libraryCollapsed.has(category) ? '▸' : '▾'}</span> ${category}`;
    headingLabel.addEventListener('click', () => toggleLibraryCollapse(category));
    heading.appendChild(headingLabel);

    if (category !== 'Uncategorized') {
      const actions = document.createElement('span');
      actions.className = 'heading-actions';

      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✎';
      renameBtn.title = 'Rename category';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renameCategory(category);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Delete category';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCategory(category);
      });

      actions.append(renameBtn, deleteBtn);
      heading.appendChild(actions);
    }

    section.appendChild(heading);

    if (!libraryCollapsed.has(category)) {
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

// Toggle one category's collapse state in the main library WITHOUT
// rebuilding any other section — only its own grid mounts/unmounts.
export function toggleLibraryCollapse(category: string) {
  const section = document.querySelector<HTMLDivElement>(
    `.category-section[data-category="${CSS.escape(category)}"]`
  );
  if (!section) return;

  if (libraryCollapsed.has(category)) {
    libraryCollapsed.delete(category);
  } else {
    libraryCollapsed.add(category);
  }

  const chevron = section.querySelector('.chevron');
  const existingGrid = section.querySelector('.grid');

  if (libraryCollapsed.has(category)) {
    existingGrid?.remove();
    if (chevron) chevron.textContent = '▸';
  } else {
    if (chevron) chevron.textContent = '▾';
    if (!existingGrid) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      resetTileIndex();
      for (const app of apps.filter((a) => a.category === category)) {
        grid.appendChild(buildTile(app));
      }
      section.appendChild(grid);
    }
  }
}

// ============================================================
// App detail view — foundation for achievements
// ============================================================

export function renderAppDetail(id: string) {
  const app = apps.find((a) => a.id === id);
  const container = document.querySelector<HTMLDivElement>('#app-detail')!;
  container.innerHTML = '';

  if (!app) {
    setCurrentView({ type: 'library' });
    renderView();
    return;
  }

  const backBtn = document.createElement('button');
  backBtn.className = 'back-btn';
  backBtn.textContent = '← Back to Library';
  backBtn.addEventListener('click', () => {
    setCurrentView({ type: 'library' });
    renderView();
  });

  const header = document.createElement('div');
  header.className = 'detail-header';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'detail-icon';
  if (app.icon) {
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${app.icon}`;
    iconWrap.appendChild(img);
  } else {
    iconWrap.textContent = initials(app.name);
  }

  const info = document.createElement('div');
  info.className = 'detail-info';

  const nameEl = document.createElement('h1');
  nameEl.textContent = app.name;

  const meta = document.createElement('div');
  meta.className = 'detail-meta';
  const lastPlayedStr = app.lastPlayed ? new Date(app.lastPlayed).toLocaleDateString() : 'never';
  meta.textContent = `${app.category} · ${formatPlaytime(totalPlaytimeFor(app.id))} total · last played ${lastPlayedStr}`;

  const launchBtn = document.createElement('button');
  launchBtn.className = 'detail-launch-btn';
  launchBtn.textContent = 'Launch';
  launchBtn.addEventListener('click', () => launchAndTrack(app));

  info.append(nameEl, meta, launchBtn);

  if (app.launchFailed) {
    const warning = document.createElement('div');
    warning.className = 'detail-broken-warning';
    warning.textContent = "⚠ Last launch failed — this app's path may be broken.";

    const fixBtn = document.createElement('button');
    fixBtn.className = 'detail-fix-path-btn';
    fixBtn.textContent = 'Edit path';
    fixBtn.addEventListener('click', () => editAppPath(app.id));

    warning.appendChild(fixBtn);
    info.appendChild(warning);
  }

  header.append(iconWrap, info);

  const achievementsSection = document.createElement('div');
  achievementsSection.className = 'detail-achievements';

  const achHeading = document.createElement('h2');
  achHeading.textContent = 'Achievements';

  const achEmpty = document.createElement('div');
  achEmpty.className = 'achievements-empty';
  achEmpty.textContent = 'No achievement set assigned to this app yet.';

  achievementsSection.append(achHeading, achEmpty);

  container.append(backBtn, header, achievementsSection);
}

// ============================================================
// Stats view — total + per-app playtime breakdown
// ============================================================

export function renderStats() {
  const container = document.querySelector<HTMLDivElement>('#app-stats')!;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'stats-header';

  const heading = document.createElement('h1');
  heading.textContent = 'Stats';

  const totalEl = document.createElement('div');
  totalEl.className = 'stats-total';
  totalEl.textContent = `Total tracked time: ${formatPlaytime(totalPlaytimeAll())}`;

  header.append(heading, totalEl);

  const listSection = document.createElement('div');
  listSection.className = 'stats-list';

  const sorted = apps
    .map((app) => ({ app, seconds: totalPlaytimeFor(app.id) }))
    .filter((x) => x.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'achievements-empty';
    empty.textContent = 'No tracked playtime yet — launch something first.';
    listSection.appendChild(empty);
  } else {
    const max = sorted[0].seconds;
    for (const { app, seconds } of sorted) {
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.addEventListener('click', () => {
        setCurrentView({ type: 'app', id: app.id });
        renderView();
      });

      const label = document.createElement('div');
      label.className = 'stats-row-label';
      label.textContent = app.name;

      const barTrack = document.createElement('div');
      barTrack.className = 'stats-bar-track';
      const bar = document.createElement('div');
      bar.className = 'stats-bar';
      bar.style.width = `${Math.max(4, (seconds / max) * 100)}%`;
      barTrack.appendChild(bar);

      const value = document.createElement('div');
      value.className = 'stats-row-value';
      value.textContent = formatPlaytime(seconds);

      row.append(label, barTrack, value);
      listSection.appendChild(row);
    }
  }

  container.append(header, listSection);
}

// ============================================================
// Top-level view dispatcher — only used for structural changes
// (switching library <-> detail <-> stats, or when categories change)
// ============================================================

export function renderView() {
  renderSidebarNav();

  const isDetail = currentView.type === 'app';
  const isStats = currentView.type === 'stats';
  const isLibrary = currentView.type === 'library';

  document.querySelector('#recent-section')!.classList.toggle('hidden', !isLibrary);
  document.querySelector('#library')!.classList.toggle('hidden', !isLibrary);
  document.querySelector('#app-detail')!.classList.toggle('hidden', !isDetail);
  document.querySelector('#app-stats')!.classList.toggle('hidden', !isStats);

  if (isDetail) {
    renderAppDetail((currentView as { type: 'app'; id: string }).id);
  } else if (isStats) {
    renderStats();
  } else {
    renderLibrary();
  }
}