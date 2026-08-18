export type PanelId = 'spotlight' | 'note' | 'achievements' | 'quickLaunch' | 'weeklyTrend' | 'dailyGoal' | 'pomodoro' | 'reminders';

export type PanelLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
};

type PanelLayouts = Record<PanelId, PanelLayout>;

const LAYOUT_KEY = 'overlay-panel-layout';

const DEFAULT_LAYOUTS: PanelLayouts = {
  spotlight: { x: 40, y: 40, width: 260, height: 320, minimized: false, closed: false },
  note: { x: 320, y: 40, width: 340, height: 400, minimized: false, closed: false },
  achievements: { x: 680, y: 40, width: 260, height: 320, minimized: false, closed: false },
  quickLaunch: { x: 40, y: 380, width: 260, height: 220, minimized: false, closed: true },
  weeklyTrend: { x: 320, y: 460, width: 340, height: 210, minimized: false, closed: true },
  dailyGoal: { x: 680, y: 380, width: 260, height: 140, minimized: false, closed: true },
  pomodoro: { x: 960, y: 40, width: 220, height: 280, minimized: false, closed: true },
  reminders: { x: 960, y: 340, width: 220, height: 260, minimized: false, closed: true },
};

export const PANEL_TITLES: Record<PanelId, string> = {
  spotlight: 'Now Tracking',
  note: 'Note',
  achievements: 'Achievements',
  quickLaunch: 'Quick Launch',
  weeklyTrend: 'Weekly Trend',
  dailyGoal: 'Daily Goal',
  pomodoro: 'Focus Timer',
  reminders: 'Reminders',
};

// Short label shown on each dock box until real icons are added.
export const PANEL_DOCK_LABELS: Record<PanelId, string> = {
  spotlight: 'NT',
  note: 'NO',
  achievements: 'AC',
  quickLaunch: 'QL',
  weeklyTrend: 'WT',
  dailyGoal: 'DG',
  pomodoro: 'PM',
  reminders: 'RM',
};

export function loadPanelLayouts(): PanelLayouts {
  const raw = localStorage.getItem(LAYOUT_KEY);
  if (!raw) return structuredClone(DEFAULT_LAYOUTS);
  try {
    const parsed = JSON.parse(raw);
    // Merge over defaults so a newly-added panel id always has a sane layout.
    return { ...structuredClone(DEFAULT_LAYOUTS), ...parsed };
  } catch {
    return structuredClone(DEFAULT_LAYOUTS);
  }
}

export function savePanelLayouts(layouts: PanelLayouts) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));
}

function makeDraggable(el: HTMLElement, handle: HTMLElement, layout: PanelLayout, persist: () => void) {
  handle.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.overlay-widget-btn')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = layout.x;
    const startTop = layout.y;

    function onMove(moveEvent: MouseEvent) {
      layout.x = Math.max(0, startLeft + (moveEvent.clientX - startX));
      layout.y = Math.max(0, startTop + (moveEvent.clientY - startY));
      el.style.left = `${layout.x}px`;
      el.style.top = `${layout.y}px`;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persist();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeResizable(el: HTMLElement, handle: HTMLElement, layout: PanelLayout, persist: () => void) {
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = layout.width;
    const startH = layout.height;

    function onMove(moveEvent: MouseEvent) {
      if (layout.minimized) return;
      layout.width = Math.max(160, startW + (moveEvent.clientX - startX));
      layout.height = Math.max(80, startH + (moveEvent.clientY - startY));
      el.style.width = `${layout.width}px`;
      el.style.height = `${layout.height}px`;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persist();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Builds a panel's chrome (title bar, minimize/close buttons, resize
// handle) and wires up drag/resize/minimize/close. Returns the panel
// element plus its empty content area for the caller to fill in, or null
// if this panel is currently closed.
export function createPanel(
  id: PanelId,
  layouts: PanelLayouts,
  onClosed: () => void
): { el: HTMLDivElement; content: HTMLDivElement } | null {
  const layout = layouts[id];
  if (layout.closed) return null;

  const el = document.createElement('div');
  el.className = 'overlay-widget' + (layout.minimized ? ' minimized' : '');
  el.dataset.panelId = id;
  el.style.left = `${layout.x}px`;
  el.style.top = `${layout.y}px`;
  el.style.width = `${layout.width}px`;
  el.style.height = `${layout.height}px`;

  const titlebar = document.createElement('div');
  titlebar.className = 'overlay-widget-titlebar';

  const titleText = document.createElement('span');
  titleText.className = 'overlay-widget-title';
  titleText.textContent = PANEL_TITLES[id];

  const btnRow = document.createElement('div');
  btnRow.className = 'overlay-widget-btns';

  const minBtn = document.createElement('button');
  minBtn.className = 'overlay-widget-btn';
  minBtn.textContent = layout.minimized ? '▢' : '—';
  minBtn.title = layout.minimized ? 'Restore' : 'Minimize';
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layout.minimized = !layout.minimized;
    el.classList.toggle('minimized', layout.minimized);
    minBtn.textContent = layout.minimized ? '▢' : '—';
    minBtn.title = layout.minimized ? 'Restore' : 'Minimize';
    savePanelLayouts(layouts);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'overlay-widget-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layout.closed = true;
    savePanelLayouts(layouts);
    onClosed();
  });

  btnRow.append(minBtn, closeBtn);
  titlebar.append(titleText, btnRow);

  const content = document.createElement('div');
  content.className = 'overlay-widget-content';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'overlay-widget-resize';

  el.append(titlebar, content, resizeHandle);

  makeDraggable(el, titlebar, layout, () => savePanelLayouts(layouts));
  makeResizable(el, resizeHandle, layout, () => savePanelLayouts(layouts));

  return { el, content };
}

// Builds the persistent dock row — one box per panel, toggling that
// panel open/closed on click. Boxes are plain placeholders (a two-letter
// label) until real per-module icons are added later.
export function renderDock(layouts: PanelLayouts, onToggle: (id: PanelId) => void) {
  const dock = document.querySelector<HTMLDivElement>('#overlay-dock')!;
  dock.innerHTML = '';

  (Object.keys(layouts) as PanelId[]).forEach((id) => {
    const box = document.createElement('button');
    box.className = 'overlay-dock-box' + (layouts[id].closed ? '' : ' active');
    box.title = PANEL_TITLES[id];
    box.dataset.panelId = id;
    box.textContent = PANEL_DOCK_LABELS[id];
    box.addEventListener('click', () => {
      layouts[id].closed = !layouts[id].closed;
      savePanelLayouts(layouts);
      onToggle(id);
    });
    dock.appendChild(box);
  });
}