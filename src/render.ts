import type { AppEntry } from './types';
import {
  apps,
  libraryCollapsed,
  sidebarCollapsed,
  currentView,
  setCurrentView,
  resetTileIndex,
  formatPlaytime,
  initials,
  visibleCategories,
} from './state';
import { totalPlaytimeFor, totalPlaytimeAll, sessions, effectiveDurationSec } from './sessions';
import { buildTile, syncGrid } from './tiles';
import { renameCategory, deleteCategory, launchAndTrack, editAppPath } from './actions';
import { buildHabitCard, renderHabitPage } from './habit';
import { groupSessionsByPeriod, colorForIndex, type PeriodGrouping } from './statsHelpers';

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
  const categoryChanged = !!previousCategory && previousCategory !== app.category;
  const uncategorizedInvolved = previousCategory === 'Uncategorized' || app.category === 'Uncategorized';

  if (categoryChanged && uncategorizedInvolved) {
    // "Uncategorized" may have just become empty (hide it) or non-empty
    // (show it) — that's a structural change to which sections exist, so
    // a full rebuild of the library + sidebar is the simplest safe path.
    renderLibrary();
    renderSidebarNav();
  } else {
    if (categoryChanged) {
      refreshCategorySection(previousCategory!);
      refreshSidebarGroup(previousCategory!);
    }
    refreshCategorySection(app.category);
    refreshSidebarGroup(app.category);
  }
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

  for (const category of visibleCategories()) {
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

  for (const category of visibleCategories()) {
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
// App detail view — habit tracking + session history
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

  const habitCard = buildHabitCard(app, () => renderAppDetail(app.id));

  const sessionsCard = document.createElement('div');
  sessionsCard.className = 'detail-sessions-card';

  const sessHeading = document.createElement('h2');
  sessHeading.textContent = 'Session History';

  const tabs = document.createElement('div');
  tabs.className = 'session-period-tabs';

  const historyBody = document.createElement('div');
  historyBody.className = 'session-history-body';

  (['week', 'month', 'year'] as PeriodGrouping[]).forEach((grouping) => {
    const tab = document.createElement('button');
    tab.className = 'session-period-tab' + (appDetailGrouping === grouping ? ' active' : '');
    tab.textContent = grouping[0].toUpperCase() + grouping.slice(1);
    tab.addEventListener('click', () => {
      if (appDetailGrouping === grouping) return;
      appDetailGrouping = grouping;
      tabs.querySelectorAll('.session-period-tab').forEach((el) => el.classList.remove('active'));
      tab.classList.add('active');
      renderSessionHistory(historyBody, app.id, grouping);
    });
    tabs.appendChild(tab);
  });

  sessHeading.appendChild(tabs);
  renderSessionHistory(historyBody, app.id, appDetailGrouping);
  sessionsCard.append(sessHeading, historyBody);

  container.append(backBtn, header, habitCard, sessionsCard);
}

// Which grouping the Session History tabs are on — kept at module scope
// so it stays put while switching between apps/pages within one run.
let appDetailGrouping: PeriodGrouping = 'week';

function renderSessionHistory(body: HTMLDivElement, appId: string, grouping: PeriodGrouping) {
  body.innerHTML = '';

  const appSessions = sessions.filter((s) => s.appId === appId).sort((a, b) => b.startedAt - a.startedAt);
  if (appSessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No sessions recorded yet — launch this app to start tracking.';
    body.appendChild(empty);
    return;
  }

  const groups = groupSessionsByPeriod(appSessions, grouping);
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'session-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'session-group-header';
    const groupLabel = document.createElement('span');
    groupLabel.textContent = group.label;
    const groupTotal = document.createElement('span');
    groupTotal.className = 'session-group-total';
    groupTotal.textContent = formatPlaytime(group.totalSec);
    groupHeader.append(groupLabel, groupTotal);
    groupEl.appendChild(groupHeader);

    const sortedSessions = [...group.sessions].sort((a, b) => b.startedAt - a.startedAt);
    for (const session of sortedSessions) {
      const row = document.createElement('div');
      row.className = 'session-row';

      const dateEl = document.createElement('div');
      dateEl.className = 'session-row-date';
      const start = new Date(session.startedAt);
      const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      dateEl.textContent = `${dateStr} · ${timeStr}`;
      if (!session.endedAt) {
        const liveTag = document.createElement('span');
        liveTag.className = 'session-row-live';
        liveTag.textContent = 'running';
        dateEl.appendChild(liveTag);
      }

      const durationEl = document.createElement('div');
      durationEl.className = 'session-row-duration';
      durationEl.textContent = formatPlaytime(effectiveDurationSec(session, session.endedAt ?? Date.now()));

      row.append(dateEl, durationEl);
      groupEl.appendChild(row);
    }

    body.appendChild(groupEl);
  }
}

// ============================================================
// Stats view — overall breakdown chart + per-category playtime lists
// ============================================================

let statsChartMode: 'category' | 'app' = 'category';

type ChartSlice = { label: string; seconds: number; color: string; appId?: string };

function buildDonutChart(slices: ChartSlice[], totalSec: number): SVGSVGElement {
  const size = 180;
  const r = 70;
  const stroke = 26;
  const c = 2 * Math.PI * r;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.classList.add('stats-donut');

  const bg = document.createElementNS(svgNS, 'circle');
  bg.setAttribute('cx', String(size / 2));
  bg.setAttribute('cy', String(size / 2));
  bg.setAttribute('r', String(r));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', 'var(--line)');
  bg.setAttribute('stroke-width', String(stroke));
  svg.appendChild(bg);

  let offset = 0;
  for (const slice of slices) {
    const frac = totalSec > 0 ? slice.seconds / totalSec : 0;
    if (frac <= 0) continue;
    const len = frac * c;
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', String(size / 2));
    circle.setAttribute('cy', String(size / 2));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', slice.color);
    circle.setAttribute('stroke-width', String(stroke));
    circle.setAttribute('stroke-dasharray', `${Math.max(len - 1.5, 0)} ${c - len + 1.5}`);
    circle.setAttribute('stroke-dashoffset', String(-offset));
    circle.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
    circle.classList.add('stats-donut-slice');

    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${slice.label} — ${formatPlaytime(slice.seconds)} (${Math.round(frac * 100)}%)`;
    circle.appendChild(title);

    svg.appendChild(circle);
    offset += len;
  }

  const centerText = document.createElementNS(svgNS, 'text');
  centerText.setAttribute('x', String(size / 2));
  centerText.setAttribute('y', String(size / 2));
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('dominant-baseline', 'middle');
  centerText.classList.add('stats-donut-center');
  centerText.textContent = formatPlaytime(totalSec);
  svg.appendChild(centerText);

  return svg;
}

function buildChartSection(): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'stats-chart-section';

  const toggle = document.createElement('div');
  toggle.className = 'stats-chart-toggle';
  (['category', 'app'] as const).forEach((mode) => {
    const btn = document.createElement('button');
    btn.className = 'stats-chart-toggle-btn' + (statsChartMode === mode ? ' active' : '');
    btn.textContent = mode === 'category' ? 'By Category' : 'By App';
    btn.addEventListener('click', () => {
      if (statsChartMode === mode) return;
      statsChartMode = mode;
      renderStats();
    });
    toggle.appendChild(btn);
  });

  const totalAll = totalPlaytimeAll();
  let slices: ChartSlice[];
  if (statsChartMode === 'category') {
    slices = visibleCategories()
      .map((category, i) => ({
        label: category,
        seconds: apps.filter((a) => a.category === category).reduce((sum, a) => sum + totalPlaytimeFor(a.id), 0),
        color: colorForIndex(i),
      }))
      .filter((s) => s.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  } else {
    slices = apps
      .map((app, i) => ({ label: app.name, seconds: totalPlaytimeFor(app.id), color: colorForIndex(i), appId: app.id }))
      .filter((s) => s.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }

  const body = document.createElement('div');
  body.className = 'stats-chart-body';

  if (slices.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tracked playtime yet — launch something first.';
    body.appendChild(empty);
  } else {
    body.appendChild(buildDonutChart(slices, totalAll));

    const legend = document.createElement('div');
    legend.className = 'stats-chart-legend';
    for (const slice of slices) {
      const item = document.createElement('div');
      item.className = 'stats-legend-item';
      if (slice.appId) {
        item.classList.add('clickable');
        const appId = slice.appId;
        item.addEventListener('click', () => {
          setCurrentView({ type: 'app', id: appId });
          renderView();
        });
      }

      const swatch = document.createElement('span');
      swatch.className = 'stats-legend-swatch';
      swatch.style.background = slice.color;

      const label = document.createElement('span');
      label.className = 'stats-legend-label';
      label.textContent = slice.label;

      const value = document.createElement('span');
      value.className = 'stats-legend-value';
      const pct = totalAll > 0 ? Math.round((slice.seconds / totalAll) * 100) : 0;
      value.textContent = `${formatPlaytime(slice.seconds)} · ${pct}%`;

      item.append(swatch, label, value);
      legend.appendChild(item);
    }
    body.appendChild(legend);
  }

  section.append(toggle, body);
  return section;
}

function buildCategoryStatsList(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'stats-category-list';

  const cats = visibleCategories();
  const withTotals = cats
    .map((category) => ({
      category,
      apps: apps.filter((a) => a.category === category),
      total: apps.filter((a) => a.category === category).reduce((sum, a) => sum + totalPlaytimeFor(a.id), 0),
    }))
    .filter((c) => c.apps.length > 0)
    .sort((a, b) => b.total - a.total);

  if (withTotals.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No apps yet.';
    wrap.appendChild(empty);
    return wrap;
  }

  for (const { category, apps: catApps, total } of withTotals) {
    const section = document.createElement('div');
    section.className = 'stats-category-section';

    const heading = document.createElement('div');
    heading.className = 'stats-category-heading';
    const nameEl = document.createElement('span');
    nameEl.textContent = category;
    const totalEl = document.createElement('span');
    totalEl.className = 'stats-category-total';
    totalEl.textContent = formatPlaytime(total);
    heading.append(nameEl, totalEl);
    section.appendChild(heading);

    const sortedApps = [...catApps].sort((a, b) => totalPlaytimeFor(b.id) - totalPlaytimeFor(a.id));
    const max = Math.max(1, ...sortedApps.map((a) => totalPlaytimeFor(a.id)));

    const list = document.createElement('div');
    list.className = 'stats-list';
    for (const app of sortedApps) {
      const seconds = totalPlaytimeFor(app.id);
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
      bar.style.width = seconds > 0 ? `${Math.max(4, (seconds / max) * 100)}%` : '0%';
      barTrack.appendChild(bar);

      const value = document.createElement('div');
      value.className = 'stats-row-value';
      value.textContent = formatPlaytime(seconds);

      row.append(label, barTrack, value);
      list.appendChild(row);
    }

    section.appendChild(list);
    wrap.appendChild(section);
  }

  return wrap;
}

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

  container.append(header, buildChartSection(), buildCategoryStatsList());
}

// ============================================================
// Top-level view dispatcher — only used for structural changes
// (switching library <-> detail <-> stats, or when categories change)
// ============================================================

export function renderView() {
  renderSidebarNav();

  const isDetail = currentView.type === 'app';
  const isStats = currentView.type === 'stats';
  const isHabit = currentView.type === 'habit';
  const isLibrary = currentView.type === 'library';

  document.querySelector('#recent-section')!.classList.toggle('hidden', !isLibrary);
  document.querySelector('#library')!.classList.toggle('hidden', !isLibrary);
  document.querySelector('#app-detail')!.classList.toggle('hidden', !isDetail);
  document.querySelector('#app-stats')!.classList.toggle('hidden', !isStats);
  document.querySelector('#app-habit')!.classList.toggle('hidden', !isHabit);

  if (isDetail) {
    renderAppDetail((currentView as { type: 'app'; id: string }).id);
  } else if (isStats) {
    renderStats();
  } else if (isHabit) {
    renderHabitPage();
  } else {
    renderLibrary();
  }
}