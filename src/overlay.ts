import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { loadApps, loadSessions, saveSessions } from './storage';
import { formatPlaytime, initials } from './state';
import type { AppEntry, Session } from './types';
import { type PanelId, loadPanelLayouts, createPanel, renderDock } from './overlayPanels';
import { matchOverlayToWindow, toggleOverlay, hideOverlay } from './overlayShortcut';
import { applyActiveTheme } from './themeApply';

const CONTEXT_KEY = 'launcher-overlay-context';
const DAILY_GOAL_KEY = 'launcher-daily-goals'; // Record<appId, minutes>
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

// Total counted seconds for one specific calendar day window — used by
// the weekly trend sparkline. Paused time is subtracted approximately
// (using the session's total pausedMs, not distributed per-day), which
// is a reasonable simplification for a glance-level trend chart.
function totalPlaytimeForDayWindow(sessions: Session[], appId: string, dayStart: number, dayEnd: number): number {
  const now = Date.now();
  return sessions
    .filter((s) => s.appId === appId && s.startedAt < dayEnd && (s.endedAt ?? now) > dayStart)
    .reduce((sum, s) => {
      const start = Math.max(s.startedAt, dayStart);
      const end = Math.min(s.endedAt ?? now, dayEnd);
      const raw = end - start;
      const pausedMs = Math.min(s.pausedMs || 0, raw);
      return sum + Math.max(0, Math.round((raw - pausedMs) / 1000));
    }, 0);
}

function loadDailyGoals(): Record<string, number> {
  const raw = localStorage.getItem(DAILY_GOAL_KEY);
  return raw ? JSON.parse(raw) : {};
}
function saveDailyGoals(goals: Record<string, number>) {
  localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goals));
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

function buildQuickLaunchContent(content: HTMLDivElement, app: AppEntry) {
  content.innerHTML = '';
  const apps = loadApps();
  const siblings = apps.filter((a) => a.category === app.category && a.id !== app.id);

  if (siblings.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty-small';
    empty.textContent = 'No other apps in this category.';
    content.appendChild(empty);
    return;
  }

  for (const sibling of siblings) {
    const row = document.createElement('button');
    row.className = 'overlay-quicklaunch-row';
    row.title = `Launch ${sibling.name}`;
    row.addEventListener('click', async () => {
      row.disabled = true;
      try {
        const pid = await invoke<number>('launch_app', { path: sibling.path });
        // Record the session directly — same as the launcher's own
        // launchAndTrack. If this window closes before the app does,
        // the launcher's existing orphan-reconciliation on next startup
        // cleans it up, same safety net as any interrupted session.
        const sessions = loadSessions();
        sessions.push({ id: crypto.randomUUID(), appId: sibling.id, startedAt: Date.now(), pid });
        saveSessions(sessions);
      } catch (err) {
        console.error(`Quick-launch failed for ${sibling.name}:`, err);
      } finally {
        row.disabled = false;
      }
    });

    const icon = document.createElement('div');
    icon.className = 'overlay-quicklaunch-icon';
    if (sibling.icon) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${sibling.icon}`;
      icon.appendChild(img);
    } else {
      icon.textContent = initials(sibling.name);
    }

    const name = document.createElement('span');
    name.className = 'overlay-quicklaunch-name';
    name.textContent = sibling.name;

    row.append(icon, name);
    content.appendChild(row);
  }
}

function buildWeeklyTrendContent(content: HTMLDivElement, sessions: Session[], appId: string) {
  content.innerHTML = '';
  const bars = document.createElement('div');
  bars.className = 'overlay-sparkline';

  const days: { label: string; sec: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayStart = d.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), sec: totalPlaytimeForDayWindow(sessions, appId, dayStart, dayEnd) });
  }

  const max = Math.max(...days.map((d) => d.sec), 60);
  for (const day of days) {
    const col = document.createElement('div');
    col.className = 'overlay-sparkline-col';

    const barTrack = document.createElement('div');
    barTrack.className = 'overlay-sparkline-track';
    const bar = document.createElement('div');
    bar.className = 'overlay-sparkline-bar';
    bar.style.height = `${Math.max(4, (day.sec / max) * 100)}%`;
    bar.title = formatPlaytime(day.sec);
    barTrack.appendChild(bar);

    const label = document.createElement('span');
    label.className = 'overlay-sparkline-label';
    label.textContent = day.label;

    col.append(barTrack, label);
    bars.appendChild(col);
  }
  content.appendChild(bars);
}

function buildDailyGoalContent(content: HTMLDivElement, appId: string) {
  content.innerHTML = '';
  const goals = loadDailyGoals();

  const row = document.createElement('div');
  row.className = 'overlay-goal-row';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'overlay-goal-input';
  input.placeholder = 'Goal (minutes)';
  input.value = goals[appId] ? String(goals[appId]) : '';
  input.addEventListener('change', () => {
    const val = Math.max(0, parseInt(input.value, 10) || 0);
    const fresh = loadDailyGoals();
    if (val > 0) fresh[appId] = val;
    else delete fresh[appId];
    saveDailyGoals(fresh);
    updateLiveStats(); // refresh the bar immediately with the new goal
  });
  row.appendChild(input);

  const track = document.createElement('div');
  track.className = 'overlay-goal-bar-track';
  const fill = document.createElement('div');
  fill.id = 'overlay-goal-bar-fill';
  fill.className = 'overlay-goal-bar-fill';
  track.appendChild(fill);

  const label = document.createElement('div');
  label.id = 'overlay-goal-label';
  label.className = 'overlay-goal-label';

  content.append(row, track, label);
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
    quickLaunch: (content) => buildQuickLaunchContent(content, currentApp!),
    weeklyTrend: (content) => buildWeeklyTrendContent(content, loadSessions(), currentApp!.id),
    dailyGoal: (content) => buildDailyGoalContent(content, currentApp!.id),
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

  const goalFill = document.querySelector<HTMLElement>('#overlay-goal-bar-fill');
  const goalLabel = document.querySelector<HTMLElement>('#overlay-goal-label');
  if (goalFill && goalLabel) {
    const goalMin = loadDailyGoals()[currentApp.id] || 0;
    const pct = goalMin > 0 ? Math.min(100, (todaySec / 60 / goalMin) * 100) : 0;
    goalFill.style.width = `${pct}%`;
    goalLabel.textContent = goalMin > 0 ? `${Math.round(todaySec / 60)} / ${goalMin} min today` : 'Set a daily goal above';
  }
}

function render() {
  applyActiveTheme({ stripBodyBackground: true });

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
// Dock — persistent row of module toggle boxes
// ---------------------------------------------------------------------

function refreshDock() {
  renderDock(loadPanelLayouts(), () => {
    rebuildCanvas();
    refreshDock();
  });
}
refreshDock();

// ---------------------------------------------------------------------
// Live window-following — keeps the overlay matched to the tracked
// app's actual on-screen bounds, not just sized/positioned once on open.
// Also auto-hides if the user Alt+Tabs away to a genuinely different
// app — but not when they're interacting with the overlay itself or
// the main launcher window, since both share this same process.
// ---------------------------------------------------------------------

async function followTargetWindow() {
  const context = getContext();
  if (!context?.pid) return;

  try {
    const [foregroundPid, ownPid] = await Promise.all([
      invoke<number | null>('get_foreground_pid'),
      invoke<number>('get_current_pid'),
    ]);
    const switchedAway = foregroundPid != null && foregroundPid !== context.pid && foregroundPid !== ownPid;
    if (switchedAway) {
      await hideOverlay(); // dedicated hide-only — never accidentally shows it
      return;
    }
  } catch (err) {
    console.error('Failed to check overlay focus state:', err);
    // fall through and keep repositioning regardless
  }

  const overlay = await WebviewWindow.getByLabel('overlay');
  if (!overlay) return;
  await matchOverlayToWindow(overlay, context.pid);
}

setInterval(followTargetWindow, 400);