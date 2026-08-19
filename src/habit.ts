import type { AppEntry } from './types';
import { loadHabitAppId, saveHabitAppId } from './storage';
import { sessions } from './sessions';
import { apps } from './state';
import { currentStreak, longestStreak, launchedToday, activeDaySet } from './statsHelpers';

export function getHabitAppId(): string | null {
  return loadHabitAppId();
}

export function isHabitApp(appId: string): boolean {
  return loadHabitAppId() === appId;
}

// Builds the "Habit" card shown on an app's detail page. `onChange` is
// called after the habit app is set/cleared so the caller can re-render
// (the card's own contents depend on which app is currently the habit).
export function buildHabitCard(app: AppEntry, onChange: () => void): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'detail-habit-card';

  const heading = document.createElement('h2');
  heading.textContent = 'Habit';
  card.appendChild(heading);

  if (isHabitApp(app.id)) {
    const streak = currentStreak(sessions, app.id);
    const best = longestStreak(sessions, app.id);
    const doneToday = launchedToday(sessions, app.id);

    const streakLine = document.createElement('div');
    streakLine.className = 'habit-streak-line';
    streakLine.textContent = streak > 0 ? `🔥 ${streak} day streak` : 'No streak yet — launch today to start one';

    const meta = document.createElement('div');
    meta.className = 'habit-summary';
    meta.textContent = `Best streak: ${best} day${best === 1 ? '' : 's'} · ${
      doneToday ? 'Launched today ✓' : 'Not launched today yet'
    }`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'habit-remove-btn';
    removeBtn.textContent = 'Remove as habit';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveHabitAppId(null);
      onChange();
    });

    card.append(streakLine, meta, removeBtn);
  } else {
    const summary = document.createElement('div');
    summary.className = 'habit-summary';
    summary.textContent = 'Track a daily streak by launching this app every day.';

    const setBtn = document.createElement('button');
    setBtn.className = 'habit-set-btn';
    setBtn.textContent = 'Set as Habit App';
    setBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveHabitAppId(app.id);
      onChange();
    });

    card.append(summary, setBtn);
  }

  return card;
}

// ============================================================
// Habit page — full-page streak view (Library / Stats / Habit nav)
// ============================================================

export function renderHabitPage() {
  const container = document.querySelector<HTMLDivElement>('#app-habit')!;
  container.innerHTML = '';

  const habitId = getHabitAppId();
  const habitApp = habitId ? apps.find((a) => a.id === habitId) : undefined;

  container.appendChild(habitApp ? buildHabitHero(habitApp) : buildHabitEmptyState());
}

function buildHabitEmptyState(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'habit-page-empty';

  const heading = document.createElement('h1');
  heading.textContent = 'No habit app set yet';

  const sub = document.createElement('p');
  sub.textContent = 'Pick one app to build a daily streak around — launch it once a day to keep the streak alive.';

  wrap.append(heading, sub);

  if (apps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Add an app to your library first.';
    wrap.appendChild(empty);
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'habit-picker-list';
  for (const app of apps) {
    const row = document.createElement('button');
    row.className = 'habit-picker-row';
    row.textContent = `${app.name} · ${app.category}`;
    row.addEventListener('click', () => {
      saveHabitAppId(app.id);
      renderHabitPage();
    });
    list.appendChild(row);
  }
  wrap.appendChild(list);

  return wrap;
}

function buildHabitHero(app: AppEntry): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'habit-page';

  const streak = currentStreak(sessions, app.id);
  const best = longestStreak(sessions, app.id);
  const doneToday = launchedToday(sessions, app.id);
  const totalDays = activeDaySet(sessions, app.id).size;

  const header = document.createElement('div');
  header.className = 'habit-page-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'habit-page-app-name';
  nameEl.textContent = app.name;

  const changeBtn = document.createElement('button');
  changeBtn.className = 'habit-change-btn';
  changeBtn.textContent = 'Change habit app';
  changeBtn.addEventListener('click', () => {
    saveHabitAppId(null);
    renderHabitPage();
  });

  header.append(nameEl, changeBtn);

  const hero = document.createElement('div');
  hero.className = 'habit-hero' + (doneToday ? ' habit-hero-done' : '');

  const flame = document.createElement('div');
  flame.className = 'habit-hero-flame';
  flame.textContent = '🔥';

  const count = document.createElement('div');
  count.className = 'habit-hero-count';
  count.textContent = String(streak);

  const label = document.createElement('div');
  label.className = 'habit-hero-label';
  label.textContent = 'day streak';

  hero.append(flame, count, label);

  if (!doneToday) {
    const nudge = document.createElement('div');
    nudge.className = 'habit-hero-nudge';
    nudge.textContent =
      streak > 0 ? "Launch it today to keep your streak alive." : 'Launch it today to start a streak.';
    hero.appendChild(nudge);
  }

  const stats = document.createElement('div');
  stats.className = 'habit-stat-row';
  const statDefs: [string, string][] = [
    [String(best), 'Best streak'],
    [String(totalDays), 'Total days'],
  ];
  for (const [value, label2] of statDefs) {
    const stat = document.createElement('div');
    stat.className = 'habit-stat';
    const v = document.createElement('div');
    v.className = 'habit-stat-value';
    v.textContent = value;
    const l = document.createElement('div');
    l.className = 'habit-stat-label';
    l.textContent = label2;
    stat.append(v, l);
    stats.appendChild(stat);
  }

  wrap.append(header, hero, stats, buildWeekStrip(app.id), buildHeatmap(app.id));
  return wrap;
}

// This week, Monday-first — a quick "did I do it" glance, Duolingo-style.
function buildWeekStrip(appId: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'habit-week-strip';

  const days = activeDaySet(sessions, appId);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const mondayOffset = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(todayMid);
  monday.setDate(monday.getDate() - mondayOffset);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const ts = d.getTime();

    const cell = document.createElement('div');
    cell.className = 'habit-week-cell';
    if (days.has(ts)) cell.classList.add('active');
    if (ts === todayMid) cell.classList.add('today');
    if (ts > todayMid) cell.classList.add('future');

    const dot = document.createElement('div');
    dot.className = 'habit-week-dot';
    dot.textContent = days.has(ts) ? '✓' : '';

    const lbl = document.createElement('div');
    lbl.className = 'habit-week-label';
    lbl.textContent = dayLabels[i];

    cell.append(dot, lbl);
    wrap.appendChild(cell);
  }

  return wrap;
}

// GitHub-style 12-week grid of launch-days, Monday-first columns.
function buildHeatmap(appId: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'habit-heatmap-wrap';

  const heading = document.createElement('h2');
  heading.textContent = 'Last 12 weeks';
  wrap.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'habit-heatmap';

  const WEEKS = 12;
  const days = activeDaySet(sessions, appId);
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisMonday = new Date(todayMid);
  thisMonday.setDate(thisMonday.getDate() - mondayOffset);
  const startMonday = new Date(thisMonday);
  startMonday.setDate(startMonday.getDate() - (WEEKS - 1) * 7);

  for (let w = 0; w < WEEKS; w++) {
    const col = document.createElement('div');
    col.className = 'habit-heatmap-col';
    for (let d = 0; d < 7; d++) {
      const day = new Date(startMonday);
      day.setDate(day.getDate() + w * 7 + d);
      const ts = day.getTime();

      const cell = document.createElement('div');
      cell.className = 'habit-heatmap-cell';
      if (ts > todayMid) cell.classList.add('future');
      else if (days.has(ts)) cell.classList.add('active');
      cell.title = day.toLocaleDateString();
      col.appendChild(cell);
    }
    grid.appendChild(col);
  }

  wrap.appendChild(grid);
  return wrap;
}