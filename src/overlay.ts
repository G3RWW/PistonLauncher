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

type WeeklyTrendSettings = { weekStart: 'sunday' | 'monday'; metric: 'time' | 'sessions' };
const WEEKLY_TREND_SETTINGS_KEY = 'overlay-weekly-trend-settings';

function loadWeeklyTrendSettings(): WeeklyTrendSettings {
  const raw = localStorage.getItem(WEEKLY_TREND_SETTINGS_KEY);
  if (raw) {
    try {
      return { weekStart: 'monday', metric: 'time', ...JSON.parse(raw) };
    } catch {
      /* fall through */
    }
  }
  return { weekStart: 'monday', metric: 'time' };
}
function saveWeeklyTrendSettings(s: WeeklyTrendSettings) {
  localStorage.setItem(WEEKLY_TREND_SETTINGS_KEY, JSON.stringify(s));
}

function sessionCountForDayWindow(sessions: Session[], appId: string, dayStart: number, dayEnd: number): number {
  return sessions.filter((s) => s.appId === appId && s.startedAt >= dayStart && s.startedAt < dayEnd).length;
}

type PomodoroState = {
  mode: 'idle' | 'work' | 'break';
  endsAt: number | null; // when the current running phase ends
  pausedRemainingMs: number | null; // remaining ms, if paused mid-phase
  workMin: number;
  breakMin: number;
};
const POMODORO_KEY = 'overlay-pomodoro-state';

function loadPomodoro(): PomodoroState {
  const raw = localStorage.getItem(POMODORO_KEY);
  if (raw) {
    try {
      return { mode: 'idle', endsAt: null, pausedRemainingMs: null, workMin: 25, breakMin: 5, ...JSON.parse(raw) };
    } catch {
      /* fall through */
    }
  }
  return { mode: 'idle', endsAt: null, pausedRemainingMs: null, workMin: 25, breakMin: 5 };
}
function savePomodoro(s: PomodoroState) {
  localStorage.setItem(POMODORO_KEY, JSON.stringify(s));
}

type Reminder = { id: string; label: string; intervalMin: number; lastFiredAt: number };
const REMINDERS_KEY = 'overlay-reminders';

function loadReminders(): Reminder[] {
  const raw = localStorage.getItem(REMINDERS_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveReminders(list: Reminder[]) {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(list));
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

  const header = document.createElement('div');
  header.className = 'overlay-panel-settings-header';
  const gearBtn = document.createElement('button');
  gearBtn.className = 'overlay-gear-btn';
  gearBtn.textContent = '⚙';
  gearBtn.title = 'Settings';
  header.appendChild(gearBtn);

  const settingsRow = document.createElement('div');
  settingsRow.className = 'overlay-panel-settings-row hidden';

  const weekStartSelect = document.createElement('select');
  weekStartSelect.className = 'overlay-settings-select';
  weekStartSelect.innerHTML = `<option value="monday">Week starts Mon</option><option value="sunday">Week starts Sun</option>`;

  const metricSelect = document.createElement('select');
  metricSelect.className = 'overlay-settings-select';
  metricSelect.innerHTML = `<option value="time">Show: Time</option><option value="sessions">Show: Sessions</option>`;

  settingsRow.append(weekStartSelect, metricSelect);
  gearBtn.addEventListener('click', () => settingsRow.classList.toggle('hidden'));

  const bars = document.createElement('div');
  bars.className = 'overlay-sparkline';

  function renderBars() {
    const settings = loadWeeklyTrendSettings();
    weekStartSelect.value = settings.weekStart;
    metricSelect.value = settings.metric;

    // Anchor to the current calendar week's start (not a rolling 7-day
    // window), per the chosen start day. Days later than today just
    // show as empty/zero, since they haven't happened yet.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun..6=Sat
    const offset = settings.weekStart === 'monday' ? (dow === 0 ? 6 : dow - 1) : dow;
    const weekStartDate = new Date(today);
    weekStartDate.setDate(weekStartDate.getDate() - offset);

    const days: { label: string; value: number; isTime: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const value =
        settings.metric === 'time'
          ? totalPlaytimeForDayWindow(sessions, appId, dayStart, dayEnd)
          : sessionCountForDayWindow(sessions, appId, dayStart, dayEnd);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), value, isTime: settings.metric === 'time' });
    }

    bars.innerHTML = '';
    const max = Math.max(...days.map((d) => d.value), settings.metric === 'time' ? 60 : 1);
    for (const day of days) {
      const col = document.createElement('div');
      col.className = 'overlay-sparkline-col';

      const barTrack = document.createElement('div');
      barTrack.className = 'overlay-sparkline-track';
      const bar = document.createElement('div');
      bar.className = 'overlay-sparkline-bar';
      bar.style.height = `${Math.max(4, (day.value / max) * 100)}%`;
      bar.title = day.isTime ? formatPlaytime(day.value) : `${day.value} session${day.value === 1 ? '' : 's'}`;
      barTrack.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'overlay-sparkline-label';
      label.textContent = day.label;

      col.append(barTrack, label);
      bars.appendChild(col);
    }
  }

  weekStartSelect.addEventListener('change', () => {
    saveWeeklyTrendSettings({ ...loadWeeklyTrendSettings(), weekStart: weekStartSelect.value as 'sunday' | 'monday' });
    renderBars();
  });
  metricSelect.addEventListener('change', () => {
    saveWeeklyTrendSettings({ ...loadWeeklyTrendSettings(), metric: metricSelect.value as 'time' | 'sessions' });
    renderBars();
  });

  renderBars();
  content.append(header, settingsRow, bars);
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

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildPomodoroContent(content: HTMLDivElement) {
  content.innerHTML = '';

  const display = document.createElement('div');
  display.id = 'overlay-pomodoro-display';
  display.className = 'overlay-pomodoro-display';

  const modeLabel = document.createElement('div');
  modeLabel.id = 'overlay-pomodoro-mode';
  modeLabel.className = 'overlay-pomodoro-mode';

  const settingsRow = document.createElement('div');
  settingsRow.className = 'overlay-pomodoro-settings';

  const workInput = document.createElement('input');
  workInput.type = 'number';
  workInput.min = '1';
  workInput.className = 'overlay-goal-input';
  const workLabel = document.createElement('label');
  workLabel.textContent = 'Work (min)';
  workLabel.appendChild(workInput);

  const breakInput = document.createElement('input');
  breakInput.type = 'number';
  breakInput.min = '1';
  breakInput.className = 'overlay-goal-input';
  const breakLabel = document.createElement('label');
  breakLabel.textContent = 'Break (min)';
  breakLabel.appendChild(breakInput);

  settingsRow.append(workLabel, breakLabel);

  function persistSettings() {
    const s = loadPomodoro();
    s.workMin = Math.max(1, parseInt(workInput.value, 10) || 25);
    s.breakMin = Math.max(1, parseInt(breakInput.value, 10) || 5);
    savePomodoro(s);
  }
  workInput.addEventListener('change', persistSettings);
  breakInput.addEventListener('change', persistSettings);

  const actions = document.createElement('div');
  actions.className = 'overlay-actions';

  const startBtn = document.createElement('button');
  startBtn.className = 'overlay-action-btn';
  startBtn.id = 'overlay-pomodoro-start';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'overlay-action-btn overlay-action-danger';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    savePomodoro({ ...loadPomodoro(), mode: 'idle', endsAt: null, pausedRemainingMs: null });
    refreshPomodoroUI();
  });

  startBtn.addEventListener('click', () => {
    const s = loadPomodoro();
    if (s.mode === 'idle') {
      savePomodoro({ ...s, mode: 'work', endsAt: Date.now() + s.workMin * 60000, pausedRemainingMs: null });
    } else if (s.pausedRemainingMs != null) {
      savePomodoro({ ...s, endsAt: Date.now() + s.pausedRemainingMs, pausedRemainingMs: null });
    } else if (s.endsAt != null) {
      savePomodoro({ ...s, pausedRemainingMs: Math.max(0, s.endsAt - Date.now()), endsAt: null });
    }
    refreshPomodoroUI();
  });

  actions.append(startBtn, resetBtn);

  function refreshPomodoroUI() {
    const s = loadPomodoro();
    workInput.value = String(s.workMin);
    breakInput.value = String(s.breakMin);

    if (s.mode === 'idle') {
      modeLabel.textContent = 'Ready';
      display.textContent = formatCountdown(s.workMin * 60000);
      startBtn.textContent = 'Start';
    } else {
      modeLabel.textContent = s.mode === 'work' ? '🎯 Focus' : '☕ Break';
      const remaining = s.pausedRemainingMs ?? Math.max(0, (s.endsAt ?? Date.now()) - Date.now());
      display.textContent = formatCountdown(remaining);
      startBtn.textContent = s.pausedRemainingMs != null ? 'Resume' : s.endsAt != null ? 'Pause' : 'Start';
    }
  }

  content.append(modeLabel, display, settingsRow, actions);
  refreshPomodoroUI();
}

function buildRemindersContent(content: HTMLDivElement) {
  content.innerHTML = '';

  const addRow = document.createElement('div');
  addRow.className = 'overlay-reminder-add-row';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'e.g. Stretch';
  labelInput.className = 'overlay-goal-input';
  const intervalInput = document.createElement('input');
  intervalInput.type = 'number';
  intervalInput.min = '1';
  intervalInput.placeholder = 'min';
  intervalInput.className = 'overlay-goal-input overlay-reminder-interval-input';
  const addBtn = document.createElement('button');
  addBtn.className = 'overlay-action-btn';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const label = labelInput.value.trim();
    const intervalMin = Math.max(1, parseInt(intervalInput.value, 10) || 0);
    if (!label || !intervalMin) return;
    const list = loadReminders();
    list.push({ id: crypto.randomUUID(), label, intervalMin, lastFiredAt: Date.now() });
    saveReminders(list);
    labelInput.value = '';
    intervalInput.value = '';
    renderList();
  });
  addRow.append(labelInput, intervalInput, addBtn);

  const list = document.createElement('div');
  list.className = 'overlay-reminder-list';

  function renderList() {
    list.innerHTML = '';
    const reminders = loadReminders();
    if (reminders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'overlay-empty-small';
      empty.textContent = 'No reminders yet.';
      list.appendChild(empty);
      return;
    }
    for (const r of reminders) {
      const row = document.createElement('div');
      row.className = 'overlay-reminder-row';
      row.dataset.reminderId = r.id;

      const text = document.createElement('span');
      text.className = 'overlay-reminder-text';
      text.textContent = r.label;

      const countdown = document.createElement('span');
      countdown.className = 'overlay-reminder-countdown';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'overlay-widget-btn';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        saveReminders(loadReminders().filter((x) => x.id !== r.id));
        renderList();
      });

      row.append(text, countdown, removeBtn);
      list.appendChild(row);
    }
  }

  renderList();
  content.append(addRow, list);
}

// ---------------------------------------------------------------------
// Canvas / panel orchestration — mounts/unmounts individual panels as
// their layout's closed-state changes, rather than tearing down the
// whole canvas on every toggle. A full rebuild only happens when the
// tracked app/session itself changes (see render()), since that's the
// one case where every panel's content genuinely needs fresh data.
// ---------------------------------------------------------------------

const mountedPanels: Partial<Record<PanelId, HTMLDivElement>> = {};

function panelBuilders(): Record<PanelId, (content: HTMLDivElement) => void> {
  return {
    spotlight: (content) => buildSpotlightContent(content, currentApp!, currentSession!),
    note: (content) => buildNoteContent(content, currentSession!),
    achievements: (content) => buildAchievementsContent(content),
    quickLaunch: (content) => buildQuickLaunchContent(content, currentApp!),
    weeklyTrend: (content) => buildWeeklyTrendContent(content, loadSessions(), currentApp!.id),
    dailyGoal: (content) => buildDailyGoalContent(content, currentApp!.id),
    pomodoro: (content) => buildPomodoroContent(content),
    reminders: (content) => buildRemindersContent(content),
  };
}

function mountPanel(id: PanelId) {
  if (mountedPanels[id]) return; // already mounted — don't rebuild it
  const layouts = loadPanelLayouts();
  const panel = createPanel(id, layouts, () => unmountPanel(id));
  if (!panel) return;
  panelBuilders()[id](panel.content);
  document.querySelector<HTMLDivElement>('#overlay-canvas')!.appendChild(panel.el);
  mountedPanels[id] = panel.el;
}

function unmountPanel(id: PanelId) {
  mountedPanels[id]?.remove();
  delete mountedPanels[id];
}

// Reconciles which panels are mounted against the saved layout — mounts
// any that should now be open, unmounts any that should now be closed.
// This is what dock clicks call: it only ever touches the ONE panel
// whose state actually changed.
function syncPanelsToLayout() {
  const layouts = loadPanelLayouts();
  (Object.keys(layouts) as PanelId[]).forEach((id) => {
    const shouldBeOpen = !layouts[id].closed;
    const isMounted = !!mountedPanels[id];
    if (shouldBeOpen && !isMounted) mountPanel(id);
    else if (!shouldBeOpen && isMounted) unmountPanel(id);
  });
}

// Full teardown + remount of every open panel — used only when the
// tracked app/session changes, since every panel's content depends on
// which app is currently focused.
function rebuildCanvas() {
  const canvas = document.querySelector<HTMLDivElement>('#overlay-canvas')!;
  canvas.innerHTML = '';
  for (const id of Object.keys(mountedPanels) as PanelId[]) delete mountedPanels[id];

  if (!currentApp || !currentSession) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty';
    empty.textContent = 'Nothing tracked right now.';
    canvas.appendChild(empty);
    return;
  }

  syncPanelsToLayout();
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

  tickPomodoro();
  tickReminders();
}

function tickPomodoro() {
  const display = document.querySelector<HTMLElement>('#overlay-pomodoro-display');
  if (!display) return; // panel not mounted

  const s = loadPomodoro();
  if (s.mode !== 'idle' && s.endsAt != null && Date.now() >= s.endsAt) {
    // Phase finished — auto-switch to the other one.
    const nextMode = s.mode === 'work' ? 'break' : 'work';
    const nextMin = nextMode === 'work' ? s.workMin : s.breakMin;
    savePomodoro({ ...s, mode: nextMode, endsAt: Date.now() + nextMin * 60000, pausedRemainingMs: null });
  }

  const fresh = loadPomodoro();
  const modeLabel = document.querySelector<HTMLElement>('#overlay-pomodoro-mode');
  const startBtn = document.querySelector<HTMLButtonElement>('#overlay-pomodoro-start');
  if (fresh.mode === 'idle') {
    if (modeLabel) modeLabel.textContent = 'Ready';
    display.textContent = formatCountdown(fresh.workMin * 60000);
    if (startBtn) startBtn.textContent = 'Start';
  } else {
    if (modeLabel) modeLabel.textContent = fresh.mode === 'work' ? '🎯 Focus' : '☕ Break';
    const remaining = fresh.pausedRemainingMs ?? Math.max(0, (fresh.endsAt ?? Date.now()) - Date.now());
    display.textContent = formatCountdown(remaining);
    if (startBtn) startBtn.textContent = fresh.pausedRemainingMs != null ? 'Resume' : fresh.endsAt != null ? 'Pause' : 'Start';
  }
}

function tickReminders() {
  const list = document.querySelector<HTMLElement>('.overlay-reminder-list');
  if (!list) return; // panel not mounted

  const reminders = loadReminders();
  const now = Date.now();
  let changed = false;

  for (const r of reminders) {
    const intervalMs = r.intervalMin * 60000;
    const elapsed = now - r.lastFiredAt;
    const row = list.querySelector<HTMLElement>(`[data-reminder-id="${r.id}"]`);
    const countdownEl = row?.querySelector<HTMLElement>('.overlay-reminder-countdown');

    if (elapsed >= intervalMs) {
      r.lastFiredAt = now;
      changed = true;
      row?.classList.add('overlay-reminder-fired');
      setTimeout(() => row?.classList.remove('overlay-reminder-fired'), 3000);
    }

    if (countdownEl) {
      const remaining = Math.max(0, intervalMs - (now - r.lastFiredAt));
      countdownEl.textContent = formatCountdown(remaining);
    }
  }

  if (changed) saveReminders(reminders);
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
    syncPanelsToLayout();
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