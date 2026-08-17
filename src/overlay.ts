import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { loadApps, loadSessions, saveSessions } from './storage';
import { formatPlaytime, initials } from './state';
import type { AppEntry, Session } from './types';
import { type PanelId, loadPanelLayouts, createPanel, renderPanelsMenu } from './overlayPanels';
import { matchOverlayToWindow, toggleOverlay } from './overlayShortcut';
import { applyActiveTheme } from './themeApply';

const CONTEXT_KEY = 'launcher-overlay-context';
const BREAK_THRESHOLD_SEC = 60 * 60; // 1 hour

let lastRenderedSessionId: string | null = null;
let noteDebounce: ReturnType<typeof setTimeout> | null = null;
let currentApp: AppEntry | undefined;
let currentSession: Session | undefined;

// ---------------------------------------------------------------------
// Context + calculations
// ---------------------------------------------------------------------

function getContext(): { appId: string; sessionId: string; pid?: number } | null {
  const raw = localStorage.getItem(CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function effectiveDurationSec(session: Session, endPoint: number): number {
  const pausedMs = session.pausedMs || 0;
  return Math.max(0, Math.round((endPoint - session.startedAt - pausedMs) / 1000));
}

function currentSessionElapsedSec(session: Session, now: number): number {
  return effectiveDurationSec(session, session.endedAt ?? session.pausedAt ?? now);
}

function totalPlaytimeForApp(sessions: Session[], appId: string, now: number): number {
  return sessions.filter((s) => s.appId === appId).reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt ?? s.pausedAt ?? now), 0);
}

function totalPlaytimeTodayForApp(sessions: Session[], appId: string, now: number): number {
  return sessions
    .filter((s) => s.appId === appId && isSameDay(s.startedAt, now))
    .reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt ?? s.pausedAt ?? now), 0);
}

function streakForApp(sessions: Session[], appId: string): number {
  const dayKey = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const days = new Set(sessions.filter((s) => s.appId === appId).map((s) => dayKey(s.startedAt)));

  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

async function focusMain() {
  const main = await WebviewWindow.getByLabel('main');
  await main?.show();
  await main?.setFocus();
}

function saveNote(sessionId: string, note: string) {
  const fresh = loadSessions();
  const s = fresh.find((x) => x.id === sessionId);
  if (s) {
    s.note = note;
    saveSessions(fresh);
  }
}

function togglePause(sessionId: string) {
  const fresh = loadSessions();
  const s = fresh.find((x) => x.id === sessionId);
  if (!s || s.endedAt) return;
  if (s.pausedAt) {
    s.pausedMs = (s.pausedMs || 0) + (Date.now() - s.pausedAt);
    s.pausedAt = undefined;
  } else {
    s.pausedAt = Date.now();
  }
  saveSessions(fresh);
}

function endSessionNow(sessionId: string) {
  const fresh = loadSessions();
  const s = fresh.find((x) => x.id === sessionId);
  if (s && !s.endedAt) {
    if (s.pausedAt) {
      s.pausedMs = (s.pausedMs || 0) + (Date.now() - s.pausedAt);
      s.pausedAt = undefined;
    }
    s.endedAt = Date.now();
    saveSessions(fresh);
  }
  localStorage.removeItem(CONTEXT_KEY);
}

// ---------------------------------------------------------------------
// Panel content builders
// ---------------------------------------------------------------------

function buildSpotlightContent(content: HTMLDivElement, app: AppEntry, session: Session) {
  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'overlay-spotlight-header';

  const iconEl = document.createElement('div');
  iconEl.className = 'overlay-spotlight-icon';
  if (app.icon) {
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${app.icon}`;
    iconEl.appendChild(img);
  } else {
    iconEl.textContent = initials(app.name);
  }

  const nameCol = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'overlay-spotlight-name';
  nameEl.textContent = app.name;
  const pausedBadge = document.createElement('div');
  pausedBadge.id = 'overlay-paused-badge';
  pausedBadge.className = 'overlay-paused-badge hidden';
  pausedBadge.textContent = '⏸ Paused';
  nameCol.append(nameEl, pausedBadge);

  header.append(iconEl, nameCol);

  const stats = document.createElement('div');
  stats.className = 'overlay-stats';
  const statDefs: [string, string][] = [
    ['overlay-stat-session', 'This session'],
    ['overlay-stat-today', 'Today'],
    ['overlay-stat-alltime', 'All time'],
    ['overlay-stat-streak', 'Streak'],
  ];
  for (const [id, label] of statDefs) {
    const stat = document.createElement('div');
    stat.className = 'overlay-stat';
    const v = document.createElement('div');
    v.className = 'overlay-stat-value';
    v.id = id;
    const l = document.createElement('div');
    l.className = 'overlay-stat-label';
    l.textContent = label;
    stat.append(v, l);
    stats.appendChild(stat);
  }

  const breakEl = document.createElement('div');
  breakEl.id = 'overlay-break-reminder';
  breakEl.className = 'overlay-break-reminder hidden';
  breakEl.textContent = "You've been at this a while — maybe pause for a short break.";

  const actions = document.createElement('div');
  actions.className = 'overlay-actions';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'overlay-action-btn';
  viewBtn.textContent = 'View in Launcher';
  viewBtn.addEventListener('click', focusMain);

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'overlay-pause-btn';
  pauseBtn.className = 'overlay-action-btn';
  pauseBtn.textContent = 'Pause';
  pauseBtn.addEventListener('click', () => togglePause(session.id));

  const endBtn = document.createElement('button');
  endBtn.className = 'overlay-action-btn overlay-action-danger';
  endBtn.textContent = 'End Session';
  endBtn.addEventListener('click', async () => {
    endSessionNow(session.id);
    await toggleOverlay(true);
  });

  actions.append(viewBtn, pauseBtn, endBtn);

  content.append(header, stats, breakEl, actions);
}

function buildNoteContent(content: HTMLDivElement, session: Session) {
  content.innerHTML = '';
  const noteWrap = document.createElement('div');
  noteWrap.className = 'overlay-note';
  const noteField = document.createElement('textarea');
  noteField.className = 'overlay-note-textarea';
  noteField.placeholder = 'Notes for this session...';
  noteField.value = session.note || '';
  noteField.addEventListener('input', () => {
    if (noteDebounce) clearTimeout(noteDebounce);
    noteDebounce = setTimeout(() => saveNote(session.id, noteField.value), 400);
  });
  noteWrap.appendChild(noteField);
  content.appendChild(noteWrap);
}

function buildAchievementsContent(content: HTMLDivElement) {
  content.innerHTML = '';
  const achievements = document.createElement('div');
  achievements.className = 'overlay-achievements';
  achievements.textContent = 'No achievement set assigned to this app yet.';
  content.appendChild(achievements);
}

// ---------------------------------------------------------------------
// Canvas / panel orchestration
// ---------------------------------------------------------------------

function rebuildCanvas() {
  const canvas = document.querySelector<HTMLDivElement>('#overlay-canvas')!;
  canvas.innerHTML = '';

  if (!currentApp || !currentSession) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty';
    empty.textContent = 'Nothing tracked right now.';
    canvas.appendChild(empty);
    return;
  }

  const layouts = loadPanelLayouts();
  const builders: Record<PanelId, (content: HTMLDivElement) => void> = {
    spotlight: (content) => buildSpotlightContent(content, currentApp!, currentSession!),
    note: (content) => buildNoteContent(content, currentSession!),
    achievements: (content) => buildAchievementsContent(content),
  };

  (Object.keys(builders) as PanelId[]).forEach((id) => {
    const panel = createPanel(id, layouts, () => rebuildCanvas());
    if (!panel) return;
    builders[id](panel.content);
    canvas.appendChild(panel.el);
  });
}

function updateLiveStats() {
  if (!currentApp || !currentSession) return;
  const sessions = loadSessions();
  const now = Date.now();
  const sessionSec = currentSessionElapsedSec(currentSession, now);
  const todaySec = totalPlaytimeTodayForApp(sessions, currentApp.id, now);
  const lifetimeSec = totalPlaytimeForApp(sessions, currentApp.id, now);
  const streak = streakForApp(sessions, currentApp.id);

  const set = (id: string, text: string) => {
    const el = document.querySelector<HTMLElement>(`#${id}`);
    if (el) el.textContent = text;
  };
  set('overlay-stat-session', formatPlaytime(sessionSec));
  set('overlay-stat-today', formatPlaytime(todaySec));
  set('overlay-stat-alltime', formatPlaytime(lifetimeSec));
  set('overlay-stat-streak', streak > 0 ? `${streak}d` : '—');

  const isPaused = !!currentSession.pausedAt;
  document.querySelector('#overlay-paused-badge')?.classList.toggle('hidden', !isPaused);
  const pauseBtn = document.querySelector<HTMLButtonElement>('#overlay-pause-btn');
  if (pauseBtn) pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  document.querySelector('#overlay-break-reminder')?.classList.toggle('hidden', isPaused || sessionSec <= BREAK_THRESHOLD_SEC);
}

function render() {
  applyActiveTheme();

  const context = getContext();
  const apps = loadApps();
  const sessions = loadSessions();

  currentApp = context ? apps.find((a) => a.id === context.appId) : undefined;
  currentSession = context ? sessions.find((s) => s.id === context.sessionId) : undefined;

  const sessionId = currentSession?.id ?? null;
  if (sessionId !== lastRenderedSessionId) {
    rebuildCanvas();
    lastRenderedSessionId = sessionId;
  }

  updateLiveStats();
}

render();
setInterval(render, 1000);

// ---------------------------------------------------------------------
// "+ Panels" menu (restore closed panels)
// ---------------------------------------------------------------------

const addPanelBtn = document.querySelector<HTMLButtonElement>('#overlay-add-panel-btn')!;
const panelsMenu = document.querySelector<HTMLDivElement>('#overlay-panels-menu')!;

function refreshPanelsMenu() {
  renderPanelsMenu(loadPanelLayouts(), () => {
    rebuildCanvas();
    refreshPanelsMenu();
  });
}

addPanelBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = panelsMenu.classList.contains('hidden');
  panelsMenu.classList.toggle('hidden');
  if (willOpen) refreshPanelsMenu();
});
document.addEventListener('click', () => panelsMenu.classList.add('hidden'));
panelsMenu.addEventListener('click', (e) => e.stopPropagation());

// ---------------------------------------------------------------------
// Live window-following — keeps the overlay matched to the tracked
// app's actual on-screen bounds, not just sized/positioned once on open.
// ---------------------------------------------------------------------

async function followTargetWindow() {
  const context = getContext();
  if (!context?.pid) return;
  const overlay = await WebviewWindow.getByLabel('overlay');
  if (!overlay) return;
  await matchOverlayToWindow(overlay, context.pid);
}

setInterval(followTargetWindow, 400);