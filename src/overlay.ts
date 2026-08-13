import './styles.css';
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { loadApps, loadSessions, saveSessions } from './storage';
import { formatPlaytime, initials } from './state';
import type { Session } from './types';

const CONTEXT_KEY = 'launcher-overlay-context';
const BREAK_THRESHOLD_SEC = 60 * 60; // 1 hour

let lastRenderedSessionId: string | null = null;
let noteDebounce: ReturnType<typeof setTimeout> | null = null;

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

// A session's real counted duration up to a point in time, with paused
// time subtracted — mirrors sessions.ts's effectiveDurationSec, since
// this window has its own separate copy of the data.
function effectiveDurationSec(session: Session, endPoint: number): number {
  const pausedMs = session.pausedMs || 0;
  return Math.max(0, Math.round((endPoint - session.startedAt - pausedMs) / 1000));
}

// For the currently-open session's live "This session" stat: freeze at
// the moment it was paused rather than continuing to count up.
function currentSessionElapsedSec(session: Session, now: number): number {
  const endPoint = session.endedAt ?? session.pausedAt ?? now;
  return effectiveDurationSec(session, endPoint);
}

function totalPlaytimeForApp(sessions: Session[], appId: string, now: number): number {
  return sessions
    .filter((s) => s.appId === appId)
    .reduce((sum, s) => sum + effectiveDurationSec(s, s.endedAt ?? s.pausedAt ?? now), 0);
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

// Builds the mostly-static parts of the panel once per distinct session —
// never rebuilt on every 1s tick, so typing in the note field never loses
// focus. Pause-dependent bits get stable ids so updateLiveStats can
// refresh them each tick without touching the rest of the DOM.
function buildStaticLayout(app: { name: string; icon?: string }, session: Session) {
  const container = document.querySelector<HTMLDivElement>('#overlay-body')!;
  container.innerHTML = '';

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

  const noteWrap = document.createElement('div');
  noteWrap.className = 'overlay-note';
  const noteLabel = document.createElement('label');
  noteLabel.textContent = 'What are you working on?';
  const noteField = document.createElement('input');
  noteField.type = 'text';
  noteField.placeholder = 'Add a quick note...';
  noteField.value = session.note || '';
  noteField.addEventListener('input', () => {
    if (noteDebounce) clearTimeout(noteDebounce);
    noteDebounce = setTimeout(() => saveNote(session.id, noteField.value), 400);
  });
  noteWrap.append(noteLabel, noteField);

  const achievements = document.createElement('div');
  achievements.className = 'overlay-achievements';
  achievements.textContent = 'No achievement set assigned to this app yet.';

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
    await getCurrentWebviewWindow().hide();
  });

  actions.append(viewBtn, pauseBtn, endBtn);

  container.append(header, stats, breakEl, noteWrap, achievements, actions);
}

// Updates only the numeric stat values, the pause button/badge, and the
// break-reminder visibility — runs every second without ever touching
// the note input's DOM node.
function updateLiveStats(sessions: Session[], appId: string, session: Session) {
  const now = Date.now();
  const sessionSec = currentSessionElapsedSec(session, now);
  const todaySec = totalPlaytimeTodayForApp(sessions, appId, now);
  const lifetimeSec = totalPlaytimeForApp(sessions, appId, now);
  const streak = streakForApp(sessions, appId);

  const set = (id: string, text: string) => {
    const el = document.querySelector<HTMLElement>(`#${id}`);
    if (el) el.textContent = text;
  };
  set('overlay-stat-session', formatPlaytime(sessionSec));
  set('overlay-stat-today', formatPlaytime(todaySec));
  set('overlay-stat-alltime', formatPlaytime(lifetimeSec));
  set('overlay-stat-streak', streak > 0 ? `${streak}d` : '—');

  const isPaused = !!session.pausedAt;

  const badge = document.querySelector<HTMLElement>('#overlay-paused-badge');
  badge?.classList.toggle('hidden', !isPaused);

  const pauseBtn = document.querySelector<HTMLButtonElement>('#overlay-pause-btn');
  if (pauseBtn) pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';

  const breakEl = document.querySelector<HTMLElement>('#overlay-break-reminder');
  breakEl?.classList.toggle('hidden', isPaused || sessionSec <= BREAK_THRESHOLD_SEC);
}

function render() {
  const context = getContext();
  const apps = loadApps();
  const sessions = loadSessions();

  const app = context ? apps.find((a) => a.id === context.appId) : undefined;
  const session = context ? sessions.find((s) => s.id === context.sessionId) : undefined;

  const container = document.querySelector<HTMLDivElement>('#overlay-body')!;

  if (!app || !session) {
    if (lastRenderedSessionId !== null || container.children.length === 0) {
      container.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'overlay-empty';
      empty.textContent = 'Nothing tracked right now.';
      container.appendChild(empty);
      lastRenderedSessionId = null;
    }
    return;
  }

  if (session.id !== lastRenderedSessionId) {
    buildStaticLayout(app, session);
    lastRenderedSessionId = session.id;
  }

  updateLiveStats(sessions, app.id, session);
}

render();
setInterval(render, 1000);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    getCurrentWebviewWindow().hide();
  }
});