import { loadApps, loadSessions } from '../../core/storage';
import { getHabitAppId } from '../../habit';
import { currentStreak, longestStreak, launchedToday } from '../../core/statsHelpers';

// The habit app is a separate, globally-selected app (set from its
// detail page in the launcher) — independent of whatever app is
// currently being tracked, so this panel doesn't take currentApp as
// an argument the way the other panels do.
export function buildHabitContent(content: HTMLDivElement) {
  content.innerHTML = '';

  const habitId = getHabitAppId();
  const habitApp = habitId ? loadApps().find((a) => a.id === habitId) : undefined;

  if (!habitApp) {
    const empty = document.createElement('div');
    empty.className = 'overlay-empty-small';
    empty.textContent = 'No habit app set — pick one from its detail page in the launcher.';
    content.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'overlay-habit';

  const nameEl = document.createElement('div');
  nameEl.className = 'overlay-habit-name';
  nameEl.textContent = habitApp.name;

  const streakEl = document.createElement('div');
  streakEl.id = 'overlay-habit-streak';
  streakEl.className = 'overlay-habit-streak';

  const metaEl = document.createElement('div');
  metaEl.id = 'overlay-habit-meta';
  metaEl.className = 'overlay-habit-meta';

  wrap.append(nameEl, streakEl, metaEl);
  content.appendChild(wrap);

  updateHabitContent();
}

// Refreshes the habit panel's live-ish bits (streak/today status) without
// rebuilding the whole panel — called every tick alongside the pomodoro
// and reminder ticks. Silently no-ops if the panel isn't mounted or has
// no habit app set.
export function updateHabitContent() {
  const streakEl = document.querySelector<HTMLElement>('#overlay-habit-streak');
  if (!streakEl) return; // panel not mounted

  const habitId = getHabitAppId();
  if (!habitId) return;

  const sessions = loadSessions();
  const streak = currentStreak(sessions, habitId);
  const best = longestStreak(sessions, habitId);
  const doneToday = launchedToday(sessions, habitId);

  streakEl.textContent = streak > 0 ? `🔥 ${streak} day streak` : 'No streak yet';

  const metaEl = document.querySelector<HTMLElement>('#overlay-habit-meta');
  if (metaEl) {
    metaEl.textContent = `Best: ${best}d · ${doneToday ? 'Launched today ✓' : 'Not launched today'}`;
  }
}
